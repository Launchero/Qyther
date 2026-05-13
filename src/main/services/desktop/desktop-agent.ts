import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { MemorySaver, interrupt } from '@langchain/langgraph';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { createLogger } from '../../utils/logger';
import { WindowsDesktopAdapter } from './windows-adapter';
import { AccessibilityTreeAdapter } from './accessibility-tree';
import { GroundTruthVerifier } from './verifier';
import {
  createScreenshotTool,
  createClickTool,
  createDoubleClickTool,
  createTypeTextTool,
  createKeyComboTool,
  createScrollTool,
  createDragTool,
  createGetScreenTextTool,
  createGetWindowInfoTool,
  createMoveMouseTool,
  createLaunchAppTool,
  createWaitTool,
  createRightClickTool,
  createClipboardTool,
  createGetWindowListTool,
  createGetElementInfoTool,
  createClickElementTool,
  createSearchElementsTool,
  createFocusWindowTool,
  createHoverTool,
  createFileOperationsTool,
  createGetSelectedTextTool,
  createMinimizeWindowTool,
  createMaximizeWindowTool,
  createRestoreWindowTool,
  createCloseWindowTool,
} from './desktop-tools';
import type { ScreenshotToolResult } from './desktop-tools';
import type { DangerLevel, DesktopToolName } from './types';
import { StructuredToolInterface } from '@langchain/core/tools';
import { screen } from 'electron';
import {
  createExecuteCommandTool,
  createInvokeElementTool,
  createSetElementValueTool,
  createGetElementTextTool,
  createHoldKeyTool,
  createNavigateToPathTool,
} from './desktop-tools';

const log = createLogger('DesktopAgent');

dotenv.config();

// Danger policy: classifies each tool by risk level
const DANGER_POLICY: Record<DesktopToolName, DangerLevel> = {
  screenshot: 'safe',
  get_screen_text: 'safe',
  get_window_info: 'safe',
  get_window_list: 'safe',
  move_mouse: 'safe',
  wait: 'safe',
  get_element_info: 'safe',
  search_elements: 'safe',
  get_selected_text: 'safe',
  hover: 'safe',
  file_operations: 'safe', // per-action check below
  launch_app: 'safe',
  clipboard: 'safe',
  right_click: 'safe',
  scroll: 'safe',
  focus_window: 'safe',
  click: 'safe',
  double_click: 'safe',
  type_text: 'safe',
  key_combo: 'safe',
  drag: 'reviewable',            // Can drop files in wrong location
  click_element: 'safe',
  minimize_window: 'safe',
  maximize_window: 'safe',
  restore_window: 'safe',
  close_window: 'dangerous',     // Can lose unsaved work
  execute_command: 'reviewable', // Can run arbitrary commands
  invoke_element: 'safe',
  set_element_value: 'safe',
  get_element_text: 'safe',
  hold_key: 'safe',
  navigate_to_path: 'safe',
};

export interface DesktopTaskProgress {
  step: number;
  maxSteps: number;
  status: 'capturing' | 'clicking' | 'typing' | 'scrolling' | 'dragging' | 'key_combo' | 'window_management' | 'complete' | 'error';
  message: string;
}

export class DesktopAgent extends EventEmitter {
  private llm: ChatOpenAI | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private llmWithTools: any = null;
  private tools: StructuredToolInterface[] = [];
  private toolMap: Map<string, StructuredToolInterface> = new Map();
  private checkpointer: MemorySaver;
  private adapter: WindowsDesktopAdapter | null = null;
  private accessibilityAdapter: AccessibilityTreeAdapter | null = null;
  private verifier: GroundTruthVerifier | null = null;
  private isInitialized: boolean = false;
  private readonly maxSteps: number = 25;
  private readonly llmTimeoutMs: number = 60_000;
  private readonly MAX_STATE_MESSAGES = 40;
  private readonly maxRetries: number = 2;
  private readonly retryBackoffMs: number = 1000;
  private verifierBaselineSet = false;

  constructor() {
    super();
    this.checkpointer = new MemorySaver();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.adapter = new WindowsDesktopAdapter();
      this.accessibilityAdapter = new AccessibilityTreeAdapter();
      this.verifier = new GroundTruthVerifier();
      await this.accessibilityAdapter.initialize();

      const tools = [
        createScreenshotTool(this.adapter),
        createClickTool(this.adapter),
        createDoubleClickTool(this.adapter),
        createTypeTextTool(this.adapter),
        createKeyComboTool(this.adapter),
        createScrollTool(this.adapter),
        createDragTool(this.adapter),
        createGetScreenTextTool(this.adapter),
        createGetWindowInfoTool(this.adapter),
        createMoveMouseTool(this.adapter),
        createLaunchAppTool(),
        createWaitTool(),
        createRightClickTool(this.adapter),
        createClipboardTool(),
        createGetWindowListTool(),
        createGetElementInfoTool(this.accessibilityAdapter),
        createClickElementTool(this.accessibilityAdapter),
        createSearchElementsTool(this.accessibilityAdapter),
        createFocusWindowTool(this.adapter),
        createHoverTool(this.adapter),
        createFileOperationsTool(),
        createGetSelectedTextTool(),
        createMinimizeWindowTool(this.adapter),
        createMaximizeWindowTool(this.adapter),
        createRestoreWindowTool(this.adapter),
        createCloseWindowTool(this.adapter),
        // New tools (Phase 3)
        createExecuteCommandTool(),
        createInvokeElementTool(this.accessibilityAdapter),
        createSetElementValueTool(this.accessibilityAdapter),
        createGetElementTextTool(this.accessibilityAdapter),
        createHoldKeyTool(this.adapter),
        createNavigateToPathTool(),
      ];

      this.tools = tools;
      this.toolMap = new Map(tools.map(t => [t.name, t]));

      const apiKey = process.env.API_KEY;
      const baseURL = process.env.BASE_URL;
      const model = process.env.MODEL || 'qwen3.6-plus';

      if (!apiKey) {
        throw new Error('API_KEY not found in environment');
      }

      this.llm = new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL },
        temperature: 0.7,
      });

      this.llmWithTools = this.llm.bindTools(tools);

      this.isInitialized = true;
      log.info(`Initialized custom ReAct loop with ${tools.length} desktop tools`);
    } catch (error) {
      log.error('Initialization failed:', error);
      throw error;
    }
  }

  async *executeTaskStream(
    task: string,
    sessionId: string,
    onProgress?: (progress: DesktopTaskProgress) => void,
  ): AsyncGenerator<string> {
    if (!this.isInitialized) {
      throw new Error('Desktop agent not initialized');
    }

    log.info(`[Session:${sessionId}] Starting task: "${task.substring(0, 100)}${task.length > 100 ? '...' : ''}"`);

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    log.debug(`[Session:${sessionId}] Primary display: ${screenWidth}x${screenHeight}`);

    // For simple window management tasks, skip expensive initial screenshot
    const isSimpleWindowTask = /^(minimize|maximize|restore|close|focus)\s+(the\s+)?window/i.test(task) ||
      /window.*(minimize|maximize|restore|close|focus)/i.test(task);

    let initialScreenshotDataUrl: string | null = null;
    let initialScreenshotWidth = 0;
    let initialScreenshotHeight = 0;

    if (!isSimpleWindowTask) {
      const screenshotStart = Date.now();
      try {
        const screenshotResult = await this.adapter!.captureScreen(0);
        const primaryMonitor = screenshotResult.monitors[0];
        if (primaryMonitor && primaryMonitor.dataUrl) {
          initialScreenshotDataUrl = primaryMonitor.dataUrl;
          initialScreenshotWidth = primaryMonitor.width;
          initialScreenshotHeight = primaryMonitor.height;
          log.info(`[Session:${sessionId}] Initial screenshot captured: ${initialScreenshotWidth}x${initialScreenshotHeight} in ${Date.now() - screenshotStart}ms`);
        } else {
          log.warn(`[Session:${sessionId}] Initial screenshot returned no data URL, falling back to text-only`);
        }
      } catch (error) {
        log.warn(`[Session:${sessionId}] Initial screenshot failed after ${Date.now() - screenshotStart}ms, proceeding with text-only first message`, error);
      }
    } else {
      log.info(`[Session:${sessionId}] Skipping initial screenshot for simple window task (saves ~1s)`);
    }

    const initialMessageContent = initialScreenshotDataUrl
      ? [
          { type: 'text' as const, text: task },
          { type: 'image_url' as const, image_url: { url: initialScreenshotDataUrl } },
        ]
      : task;

    const messages: BaseMessage[] = [
      new SystemMessage(`You are a desktop automation assistant. You are starting with an initial screenshot of the current screen already provided in the first message. Analyze it before taking any action. Use it to understand the current desktop state, identify open windows, visible UI elements, and the overall layout. This screenshot shows exactly what is currently visible on the primary monitor. You can see the screen, click elements, type text, press key combinations, scroll, drag, launch applications, interact with context menus, use the clipboard, list windows, wait for UI changes, query the accessibility tree, search for UI elements, focus windows, hover over elements, perform file operations, read selected text, execute shell commands, and manage window states (minimize, maximize, restore, close) from any application.

IMPORTANT: You MUST use the tool calling mechanism. NEVER output JSON, YAML, or any structured text format in your response. When you need to use a tool, emit a tool call — do NOT write JSON like {"action": "screenshot"} or {"tool": "get_window_list"}.

TOOL ARGUMENT SCHEMA RULES:
- ALL tool arguments must match the exact schema defined for each tool.
- Coordinate tools (click, double_click, scroll, move_mouse, hover, drag, right_click) require SINGLE numbers for x/y — NEVER arrays like {x: [100, 200], y: [100]}.
  - Correct: {x: 697, y: 423}
  - Incorrect: {x: [697, 423], y: [423]}
- If a tool rejects your call with a schema error, read the error message, fix the argument format, and retry immediately.

SCREEN DIMENSIONS: Your primary display is ${screenWidth}x${screenHeight} pixels. ALL coordinates MUST be within these bounds (x: 0-${screenWidth - 1}, y: 0-${screenHeight - 1}). Never click outside these bounds.

TOOL PRIORITY ORDER (use in this order, preferring structured tools over visual ones):
1. search_elements + invoke_element — Find and invoke UI elements directly via UI Automation (fastest, most reliable, survives UI shifts)
2. get_element_info + set_element_value — Set text fields via ValuePattern (no coordinate clicks needed)
3. get_element_info + get_element_text — Extract text from UI elements directly (better than OCR)
4. get_element_info + click_element — Click via UIA element handles (survives UI shifts)
5. focus_window + get_window_list — Window management via handles (deterministic)
6. execute_command — Run PowerShell commands for file operations, git, package management, etc.
7. screenshot — Use ONLY when:
   - Element is not in accessibility tree (custom rendering, canvas, images)
   - You need visual context (layout, colors, spatial relationships)
   - OCR is needed for text not exposed via accessibility API

Important guidelines:
- PREFER using search_elements to find UI elements by name or type before taking action.
- PREFER using get_element_info over screenshot when possible. The accessibility tree provides structured, precise information about UI elements (names, roles, bounding boxes) without the high token cost of images.
- PREFER using invoke_element over click (by coordinates). Direct element invocation survives UI shifts and is more reliable.
- PREFER using set_element_value over type_text for filling text fields (instant vs character-by-character).
- PREFER using get_element_text over get_screen_text/OCR for reading element text.
- ALWAYS start by checking what's on screen (search_elements, get_element_info, get_window_list, or screenshot)
- Use search_elements to find buttons, text fields, menus by name substring
- Use focus_window to switch between applications before interacting with their elements
- Use precise coordinates for clicking (based on screenshot analysis)
- Use type_text to fill text fields when set_element_value is not available
- Use key_combo for keyboard shortcuts like ctrl+c, ctrl+v, alt+tab, win+r
- Use hold_key to press and hold modifier keys during drag or complex operations
- Use launch_app to open programs by name
- Use clipboard for copy/paste workflows instead of ctrl+c/ctrl+v when possible
- Use get_selected_text to read selected text from any application (works universally)
- Use file_operations to list, read, write, copy, move, or delete files
- Use execute_command for shell operations like git, npm, system queries
- Use right_click to open context menus
- Use hover to reveal tooltips and dropdown menus
- Use get_window_list to find and switch between open windows. Each window has a numeric handle (e.g. "1", "2", "3") shown in brackets.
- Use minimize_window/maximize_window/restore_window/close_window to manage window states by passing the numeric handle. These are far more reliable than clicking title bar buttons or using keyboard shortcuts.
- Use wait to pause while apps load or UI updates
- Use navigate_to_path to open File Explorer to any folder path in one step — use this instead of visual navigation for folder tasks
- Complete the task in as few steps as possible

STRATEGY CHANGE RULE: If any tool (especially search_elements) fails twice in a row with the same result, you MUST switch to a different approach immediately. Do NOT repeat the same tool call with the same query. After two failed search_elements calls, switch to screenshot-based visual identification or use navigate_to_path for folder navigation.

CRITICAL: Minimize screenshot usage. Each screenshot costs significant tokens and time. Prefer structured UIA tools (invoke_element, set_element_value, get_element_text) over visual inspection whenever possible.

CRITICAL: When you use tools, you will see the results. After receiving tool results, provide a clear, helpful final response to the user summarizing what you found or accomplished. Do NOT just output tool names - explain what the results mean.

Your final response MUST:
- Be a complete sentence or two describing what you accomplished
- Mention the specific actions you took (e.g., "I pressed Win+D to minimize all windows")
- Confirm the result (e.g., "All open windows are now minimized")
- Never respond with just "Done" or a single word

Current session: ${sessionId}`),
      new HumanMessage(initialMessageContent),
    ];

    const sessionStart = Date.now();
    try {
      yield* this.runReactLoop(messages, sessionId, onProgress);
      log.info(`[Session:${sessionId}] Task completed successfully in ${Date.now() - sessionStart}ms`);
    } catch (error) {
      log.error(`[Session:${sessionId}] Task failed after ${Date.now() - sessionStart}ms`, error instanceof Error ? error.message : error);
      throw error;
    }
  }

  private async *runReactLoop(
    messages: BaseMessage[],
    sessionId: string,
    onProgress?: (progress: DesktopTaskProgress) => void,
  ): AsyncGenerator<string> {
    let stepCount = 0;
    const accumulatedResponse: string[] = [];
    const toolExecutionLog: Array<{ tool: string; durationMs: number; success: boolean }> = [];

    // ── ReAct Loop Recovery Tracker ─────────────────────────────────────────
    // Tracks consecutive failures per tool, schema errors, and recent tool calls
    // to enable automatic strategy pivots when the agent gets stuck.
    const failureTracker = {
      consecutiveFailures: new Map<string, number>(),
      schemaErrors: new Map<string, { message: string; step: number }>(),
      recentTools: [] as string[],
    };
    const STRATEGY_CHANGE_THRESHOLD = 2;

    log.info(`[Session:${sessionId}] Entering ReAct loop (max steps: ${this.maxSteps})`);

    try {
      for (let step = 0; step < this.maxSteps; step++) {
        const llmStart = Date.now();
        log.info(`[Session:${sessionId}] Step ${step + 1}/${this.maxSteps} — Calling LLM (context: ${messages.length} messages)`);

        // Call LLM with tools bound (timeout to prevent hangs)
        const response = await this.invokeWithTimeout(messages, this.llmTimeoutMs, step);
        const llmDuration = Date.now() - llmStart;
        const aiMessage = response as AIMessage;
        messages.push(aiMessage);

        if (messages.length > this.MAX_STATE_MESSAGES) {
          const excess = messages.length - this.MAX_STATE_MESSAGES;
          const trimmed = messages.splice(2, excess);
          log.info(`[Session:${sessionId}] Context trimming: removed ${trimmed.length} old messages to prevent overflow`);
        }

        // Extract text content
        const textContent = typeof aiMessage.content === 'string'
          ? aiMessage.content
          : Array.isArray(aiMessage.content)
            ? aiMessage.content.filter(c => (c as { type?: string }).type === 'text').map(c => (c as { text?: string }).text).join('')
            : '';

        // Check for tool calls
        const toolCalls = (aiMessage as AIMessage).tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls - this is the final response
          log.info(`[Session:${sessionId}] LLM returned final response (no tool calls) after ${step + 1} step(s), LLM latency: ${llmDuration}ms`);
          // Yield the accumulated response plus this final text
          const finalResponse = accumulatedResponse.join('\n\n') + (accumulatedResponse.length > 0 ? '\n\n' : '') + textContent;
          if (finalResponse.trim()) {
            yield finalResponse.trim();
          } else if (textContent.trim()) {
            yield textContent.trim();
          }
          break;
        }

        log.info(`[Session:${sessionId}] LLM invoked ${toolCalls.length} tool call(s) in step ${step + 1}, thought: "${textContent.substring(0, 150)}"${textContent.length > 150 ? '...' : ''}"`);

        // There are tool calls - store the thought but don't yield yet
        if (textContent.trim()) {
          accumulatedResponse.push(textContent.trim());
        }

        // Execute each tool call
        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.args as Record<string, unknown>;

          stepCount++;

          // ── Strategy Change Detection ────────────────────────────────────
          // Track consecutive calls to the same tool for failure pattern detection
          failureTracker.recentTools.push(toolName);
          if (failureTracker.recentTools.length > 4) {
            failureTracker.recentTools.shift();
          }
          const sameToolRepeated = failureTracker.recentTools.filter(t => t === toolName).length;
          const sameToolFailedCount = failureTracker.consecutiveFailures.get(toolName) ?? 0;
          if (sameToolRepeated >= STRATEGY_CHANGE_THRESHOLD && sameToolFailedCount >= STRATEGY_CHANGE_THRESHOLD) {
            log.warn(`[Session:${sessionId}] Strategy change detected: "${toolName}" called ${sameToolRepeated} times consecutively with ${sameToolFailedCount} failures. Injecting pivot instruction.`);
            messages.push(new HumanMessage(
              `You have called "${toolName}" multiple times in a row without success. STOP using this tool. Switch to a completely different approach immediately. For navigation tasks use navigate_to_path. For UI interaction try invoke_element or set_element_value instead of coordinate-based clicks.`
            ));
          }

          // Check danger policy
          let dangerLevel = DANGER_POLICY[toolName as DesktopToolName] ?? 'reviewable';

          // Override for file_operations: check per-action danger level
          if (toolName === 'file_operations' && toolArgs && typeof toolArgs === 'object') {
            const action = (toolArgs as Record<string, unknown>).action;
            if (action === 'delete_file') {
              dangerLevel = 'dangerous';
            } else if (action === 'write_file' || action === 'copy_file' || action === 'move_file') {
              dangerLevel = 'reviewable';
            } else {
              dangerLevel = 'safe';
            }
          }

          // Log every danger policy check for debugging
          if (dangerLevel !== 'safe') {
            log.info(`[Danger] tool=${toolName}${toolName === 'file_operations' ? `, action=${(toolArgs as Record<string, unknown>)?.action}` : ''} -> ${dangerLevel} (HITL required)`);
          }

          // Check if we need human approval before executing
          if (dangerLevel === 'dangerous' || dangerLevel === 'reviewable') {
            log.info(`[Session:${sessionId}] HITL required for "${toolName}" (danger: ${dangerLevel}), triggering interrupt`);
            const interruptValue = {
              type: 'desktop_confirmation',
              action: toolName,
              description: `The agent wants to execute "${toolName}" with args: ${JSON.stringify(toolArgs).slice(0, 200)}`,
              dangerLevel,
              args: toolArgs,
              sessionId,
              step: stepCount,
            };
            log.info(`[Danger] Interrupt payload: ${JSON.stringify(interruptValue).slice(0, 500)}`);
            const userDecision = interrupt(interruptValue) as string;

            if (userDecision === 'denied' || userDecision === 'reject') {
              log.info(`[Session:${sessionId}] HITL denied "${toolName}" at step ${stepCount}`);
              log.info(`[Danger] HITL: user DENIED ${toolName} with args: ${JSON.stringify(toolArgs).slice(0, 200)}. Agent instructed to not retry.`);
              messages.push(new ToolMessage({
                tool_call_id: toolCall.id!,
                content: `Action "${toolName}" was denied by user.`,
                name: toolName,
              }));
              messages.push(new HumanMessage(
                `The user denied the "${toolName}" action. Do NOT attempt this action again. Continue with alternative approaches.`
              ));
              if (onProgress) onProgress({ step: stepCount, maxSteps: this.maxSteps, status: 'complete', message: `Action ${toolName} denied by user` });
              continue;
            }

            log.info(`[Session:${sessionId}] HITL approved "${toolName}" at step ${stepCount}`);
            log.info(`[Danger] HITL: user APPROVED ${toolName} at step ${stepCount}`);
          }

          // Execute the tool
          const tool = this.toolMap.get(toolName);
          let toolResult: string | object;
          let isScreenshotResult = false;
          const toolStart = Date.now();
          let toolSuccess = false;
          let toolError: string | null = null;

          try {
            if (!tool) {
              toolResult = `Error: Unknown tool "${toolName}"`;
              log.error(`[Session:${sessionId}] Unknown tool "${toolName}" at step ${stepCount}`);
            } else {
              const argsPreview = JSON.stringify(toolArgs).slice(0, 300);
              log.info(`[Session:${sessionId}] Executing tool "${toolName}" at step ${stepCount} with args: ${argsPreview}`);
              const result = await tool.invoke(toolArgs);
              toolResult = result;
              toolSuccess = true;
              // Detect screenshot result with embedded image
              isScreenshotResult = typeof result === 'object' && result !== null && (result as ScreenshotToolResult)._type === 'screenshot_result';
              const resultPreview = typeof result === 'string' ? result.slice(0, 300) : JSON.stringify(result).slice(0, 300);
              log.info(`[Session:${sessionId}] Tool "${toolName}" completed in ${Date.now() - toolStart}ms${isScreenshotResult ? ' (screenshot with image)' : ''}, result: ${resultPreview}`);
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            toolResult = `Tool execution error: ${errorMsg}`;
            toolError = errorMsg;
            log.error(`[Session:${sessionId}] Tool "${toolName}" failed after ${Date.now() - toolStart}ms: ${errorMsg}`);

            // ── Schema Error Recovery ──────────────────────────────────────
            // When the LLM sends malformed args (e.g. arrays instead of numbers),
            // record the schema error and return a structured corrective message.
            const isSchemaError = errorMsg.includes('did not match expected schema') ||
              errorMsg.includes('Invalid input') ||
              errorMsg.includes('Received tool input');
            if (isSchemaError) {
              failureTracker.schemaErrors.set(toolName, { message: errorMsg, step: stepCount });
              const schemaHint = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
              toolResult = `SCHEMA ERROR: Your arguments did not match the tool's schema. ${schemaHint}\n\nFix your arguments to match the correct format and retry immediately. For coordinate tools, use single numbers (e.g. {x: 100, y: 200}) not arrays.`;
            }
          }

          toolExecutionLog.push({
            tool: toolName,
            durationMs: Date.now() - toolStart,
            success: toolSuccess && toolError === null,
          });

          // ── Update Failure Tracker ───────────────────────────────────────
          if (!toolSuccess || toolError !== null) {
            const prevCount = failureTracker.consecutiveFailures.get(toolName) ?? 0;
            failureTracker.consecutiveFailures.set(toolName, prevCount + 1);
          } else {
            failureTracker.consecutiveFailures.delete(toolName);
          }

          // Build the ToolMessage. For screenshots, include the image as multimodal content.
          if (isScreenshotResult && typeof toolResult === 'object') {
            const sr = toolResult as ScreenshotToolResult;
            // Multimodal ToolMessage: text description + image
            const imageContent = [
              { type: 'text', text: sr.description },
              { type: 'image_url', image_url: { url: sr.image } },
            ];
            log.debug(`[Session:${sessionId}] Sending multimodal ToolMessage for screenshot with ${sr.image.length} char data URL`);
            messages.push(new ToolMessage({ tool_call_id: toolCall.id!, content: imageContent, name: toolName }));
          } else {
            const textResult = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            messages.push(new ToolMessage({ tool_call_id: toolCall.id!, content: textResult, name: toolName }));
          }

          // Verify action effect for dangerous actions and inject feedback
          if (dangerLevel === 'dangerous' && this.verifier && this.adapter) {
            try {
              if (!this.verifierBaselineSet) {
                await this.verifier.updateBaseline(this.adapter);
                this.verifierBaselineSet = true;
                log.debug(`[Session:${sessionId}] Verifier baseline captured`);
              }
              const verification = await this.verifier.verify(
                { type: toolName, args: toolArgs },
                this.adapter,
              );
              log.info(`[Session:${sessionId}] Verification for "${toolName}": score=${verification.score}, hardReject=${verification.hardReject}, signals=${verification.signals.length}`);
              if (verification.hardReject) {
                log.warn(`[Session:${sessionId}] Verification HARD-REJECT for "${toolName}" at step ${stepCount}: score=${verification.score}, signals:`, JSON.stringify(verification.signals.map(s => ({ type: s.type, value: s.value }))));
                messages.push(new HumanMessage(
                  `VERIFICATION: Your last action (${toolName}) did not produce the expected effect. The screen did not show the expected changes (hard reject). Try a different approach.`
                ));
              } else if (verification.score < 0.5) {
                log.warn(`[Session:${sessionId}] Verification LOW-SCORE for "${toolName}" at step ${stepCount}: score=${verification.score}`);
                const pixelDiff = verification.signals.find(s => s.type === 'pixel_diff');
                const diffValue = pixelDiff && pixelDiff.value !== undefined ? (pixelDiff.value as number) : 'unknown';
                messages.push(new HumanMessage(
                  `VERIFICATION: Your last action (${toolName}) had limited effect on screen. Pixel diff: ${diffValue}. The expected change may not have occurred. Consider trying a different approach.`
                ));
              } else {
                log.debug(`[Session:${sessionId}] Verification PASSED for "${toolName}" at step ${stepCount}: score=${verification.score}`);
              }
            } catch (err) {
              log.warn(`[Session:${sessionId}] Verification error for "${toolName}" at step ${stepCount}:`, err instanceof Error ? err.message : err);
            }
          }

          // Minimum delay between tool calls to prevent UI instability
          await new Promise(r => setTimeout(r, 50));

          const status = this.inferStatusFromTool(toolName);
          const progress: DesktopTaskProgress = {
            step: stepCount,
            maxSteps: this.maxSteps,
            status,
            message: `Completed ${toolName}`,
          };
          if (onProgress) onProgress(progress);
        }
      }

      const completionProgress: DesktopTaskProgress = {
        step: stepCount,
        maxSteps: this.maxSteps,
        status: 'complete',
        message: 'Task completed',
      };
      if (onProgress) onProgress(completionProgress);
      this.emit('progress', completionProgress);
      log.info(`[Session:${sessionId}] ReAct loop exited: ${stepCount} tool calls, ${toolExecutionLog.length} tool executions`);
    } catch (error) {
      const errorProgress: DesktopTaskProgress = {
        step: stepCount,
        maxSteps: this.maxSteps,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      if (onProgress) onProgress(errorProgress);
      this.emit('progress', errorProgress);
      log.error(`[Session:${sessionId}] ReAct loop crashed at step ${stepCount} (tool log: ${toolExecutionLog.length} executions):`, error instanceof Error ? { message: error.message, stack: error.stack } : error);

      // ── Abort/Timeout Recovery ─────────────────────────────────────────
      // If the LLM request was aborted due to timeout, try once more with
      // a trimmed context (keep only the last 10 messages) instead of crashing.
      if (error instanceof Error && (error.message.includes('aborted') || error.message.includes('timed out'))) {
        if (messages.length > 12) {
          log.warn(`[Session:${sessionId}] Abort error detected. Trimming context from ${messages.length} to 12 messages and retrying.`);
          const systemMessage = messages[0];
          const recentMessages = messages.slice(-11);
          messages.length = 0;
          messages.push(systemMessage);
          messages.push(new HumanMessage(
            `The previous LLM request timed out. Please complete the task using the current state. Your previous tool calls have been recorded in the execution log below. Focus on completing the remaining work.`
          ));
          messages.push(...recentMessages.filter(m => {
            if (!(m instanceof HumanMessage)) return true;
            const content = typeof m.content === 'string' ? m.content : '';
            return !content.includes('The previous LLM request timed out');
          }));

          // Retry the loop with trimmed context (one attempt only)
          try {
            yield* this.runReactLoopWithAbortRecovery(messages, sessionId, onProgress);
            return;
          } catch (recoveryError) {
            log.error(`[Session:${sessionId}] Abort recovery also failed:`, recoveryError instanceof Error ? recoveryError.message : recoveryError);
          }
        }
      }

      throw error;
    }
  }

  /**
   * Variant of runReactLoop used for abort recovery — runs with a shorter timeout
   * and no nested abort recovery to prevent infinite recursion.
   */
  private async *runReactLoopWithAbortRecovery(
    messages: BaseMessage[],
    sessionId: string,
    onProgress?: (progress: DesktopTaskProgress) => void,
  ): AsyncGenerator<string> {
    let stepCount = 0;
    const accumulatedResponse: string[] = [];
    const toolExecutionLog: Array<{ tool: string; durationMs: number; success: boolean }> = [];
    const recoveryTimeoutMs = 30_000;

    log.info(`[Session:${sessionId}] Entering abort recovery ReAct loop (timeout: ${recoveryTimeoutMs}ms)`);

    try {
      for (let step = 0; step < this.maxSteps; step++) {
        const llmStart = Date.now();
        log.info(`[Session:${sessionId}] Recovery Step ${step + 1}/${this.maxSteps} — Calling LLM (context: ${messages.length} messages)`);

        let aiMessage: AIMessage;
        try {
          aiMessage = await (Promise.race([
            this.llmWithTools!.invoke(messages),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Recovery LLM timed out after ${recoveryTimeoutMs / 1000}s`)), recoveryTimeoutMs)),
          ]) as Promise<AIMessage>);
        } catch (llmError) {
          log.error(`[Session:${sessionId}] Recovery LLM call failed:`, llmError instanceof Error ? llmError.message : llmError);
          throw llmError;
        }
        const llmDuration = Date.now() - llmStart;
        messages.push(aiMessage);

        const textContent = typeof aiMessage.content === 'string'
          ? aiMessage.content
          : Array.isArray(aiMessage.content)
            ? aiMessage.content.filter(c => (c as { type?: string }).type === 'text').map(c => (c as { text?: string }).text).join('')
            : '';

        const toolCalls = (aiMessage as AIMessage).tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          const finalResponse = accumulatedResponse.join('\n\n') + (accumulatedResponse.length > 0 ? '\n\n' : '') + textContent;
          if (finalResponse.trim()) {
            yield finalResponse.trim();
          } else if (textContent.trim()) {
            yield textContent.trim();
          }
          break;
        }

        if (textContent.trim()) {
          accumulatedResponse.push(textContent.trim());
        }

        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.args as Record<string, unknown>;
          stepCount++;

          const tool = this.toolMap.get(toolName);
          let toolResult: string | object;
          let isScreenshotResult = false;
          const toolStart = Date.now();

          try {
            if (!tool) {
              toolResult = `Error: Unknown tool "${toolName}"`;
            } else {
              const result = await tool.invoke(toolArgs);
              toolResult = result;
              isScreenshotResult = typeof result === 'object' && result !== null && (result as ScreenshotToolResult)._type === 'screenshot_result';
            }
          } catch (toolError) {
            toolResult = `Tool execution error: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`;
          }

          toolExecutionLog.push({ tool: toolName, durationMs: Date.now() - toolStart, success: typeof toolResult === 'string' && !toolResult.startsWith('Tool execution error') && !toolResult.startsWith('Error:') });

          if (isScreenshotResult && typeof toolResult === 'object') {
            const sr = toolResult as ScreenshotToolResult;
            const imageContent = [
              { type: 'text', text: sr.description },
              { type: 'image_url', image_url: { url: sr.image } },
            ];
            messages.push(new ToolMessage({ tool_call_id: toolCall.id!, content: imageContent, name: toolName }));
          } else {
            const textResult = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            messages.push(new ToolMessage({ tool_call_id: toolCall.id!, content: textResult, name: toolName }));
          }

          await new Promise(r => setTimeout(r, 50));

          const status = this.inferStatusFromTool(toolName);
          const progress: DesktopTaskProgress = { step: stepCount, maxSteps: this.maxSteps, status, message: `Completed ${toolName}` };
          if (onProgress) onProgress(progress);
        }
      }
    } catch (error) {
      log.error(`[Session:${sessionId}] Abort recovery ReAct loop crashed:`, error instanceof Error ? error.message : error);
      throw error;
    }
  }

  private inferStatusFromTool(toolName: string | undefined): DesktopTaskProgress['status'] {
    if (!toolName) return 'capturing';
    if (toolName === 'screenshot') return 'capturing';
    if (toolName === 'click' || toolName === 'double_click' || toolName === 'click_element' || toolName === 'right_click') return 'clicking';
    if (toolName === 'type_text') return 'typing';
    if (toolName === 'scroll') return 'scrolling';
    if (toolName === 'drag') return 'dragging';
    if (toolName === 'key_combo') return 'key_combo';
    if (toolName === 'file_operations') return 'capturing';
    if (toolName === 'focus_window') return 'capturing';
    if (toolName === 'hover') return 'capturing';
    if (toolName === 'search_elements') return 'capturing';
    if (toolName === 'get_selected_text') return 'capturing';
    if (toolName === 'minimize_window' || toolName === 'maximize_window' || toolName === 'restore_window' || toolName === 'close_window') return 'window_management';
    return 'capturing';
  }

  private async invokeWithTimeout(
    messages: BaseMessage[],
    timeoutMs: number,
    step: number,
  ): Promise<AIMessage> {
    const lastAttempt = this.maxRetries;
    for (let attempt = 1; attempt <= lastAttempt; attempt++) {
      try {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`LLM invocation timed out after ${timeoutMs / 1000}s`)), timeoutMs);
        });
        return await (Promise.race([
          this.llmWithTools!.invoke(messages),
          timeout,
        ]) as Promise<AIMessage>);
      } catch (error) {
        const isTimeout = error instanceof Error && error.message.includes('timed out');
        if (!isTimeout || attempt === lastAttempt) throw error;
        log.warn(`[Session] Step ${step + 1} LLM timeout (attempt ${attempt}/${lastAttempt}), retrying in ${this.retryBackoffMs / 1000}s...`);
        await new Promise(r => setTimeout(r, this.retryBackoffMs));
      }
    }
    throw new Error('LLM invocation exhausted all retries');
  }

  async closeSession(sessionId: string): Promise<void> {
    log.info(`[Session:${sessionId}] Closing desktop session`);

    if (this.adapter) {
      try {
        await this.adapter.cleanup();
        log.debug(`[Session:${sessionId}] Adapter cleanup completed`);
      } catch (error) {
        log.warn(`[Session:${sessionId}] Adapter cleanup failed:`, error instanceof Error ? error.message : error);
      }
    }

    if (this.verifier) {
      this.verifier.reset();
      this.verifierBaselineSet = false;
      log.debug(`[Session:${sessionId}] Verifier reset`);
    }

    this.isInitialized = false;
    log.info(`[Session:${sessionId}] Session closed`);
  }

  async cleanup(): Promise<void> {
    log.info('Cleaning up desktop agent resources');
    if (this.adapter) {
      try {
        await this.adapter.cleanup();
      } catch (error) {
        log.error('Error cleaning up adapter:', error);
      }
      this.adapter = null;
    }
    if (this.accessibilityAdapter) {
      this.accessibilityAdapter.cleanup();
      this.accessibilityAdapter = null;
    }
    if (this.verifier) {
      this.verifier.reset();
      this.verifier = null;
    }
    this.llm = null;
    this.tools = [];
    this.toolMap.clear();
    this.isInitialized = false;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getDangerPolicy(): Readonly<Record<DesktopToolName, DangerLevel>> {
    return { ...DANGER_POLICY };
  }
}

export const desktopAgent = new DesktopAgent();
