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
} from './desktop-tools';
import type { ScreenshotToolResult } from './desktop-tools';
import type { DangerLevel, DesktopToolName } from './types';
import { StructuredToolInterface } from '@langchain/core/tools';

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
  launch_app: 'reviewable',
  clipboard: 'reviewable',
  right_click: 'reviewable',
  scroll: 'reviewable',
  focus_window: 'reviewable',
  click: 'dangerous',
  double_click: 'dangerous',
  type_text: 'dangerous',
  key_combo: 'dangerous',
  drag: 'dangerous',
  click_element: 'dangerous',
};

export interface DesktopTaskProgress {
  step: number;
  maxSteps: number;
  status: 'capturing' | 'clicking' | 'typing' | 'scrolling' | 'dragging' | 'key_combo' | 'complete' | 'error';
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

    const messages: BaseMessage[] = [
      new SystemMessage(`You are a desktop automation assistant. You can see the screen, click elements, type text, press key combinations, scroll, drag, launch applications, interact with context menus, use the clipboard, list windows, wait for UI changes, query the accessibility tree, search for UI elements, focus windows, hover over elements, perform file operations, and read selected text from any application.

IMPORTANT: You MUST use the tool calling mechanism. NEVER output JSON, YAML, or any structured text format in your response. When you need to use a tool, emit a tool call — do NOT write JSON like {"action": "screenshot"} or {"tool": "get_window_list"}.

Important guidelines:
- PREFER using search_elements to find UI elements by name or type before taking action.
- PREFER using get_element_info over screenshot when possible. The accessibility tree provides structured, precise information about UI elements (names, roles, bounding boxes) without the high token cost of images.
- PREFER using click_element (by handle) over click (by coordinates). Direct element invocation survives UI shifts and is more reliable.
- Only use screenshot when:
  - Element is not in accessibility tree (custom rendering, canvas, images)
  - You need visual context (layout, colors, spatial relationships)
  - OCR is needed for text not exposed via accessibility API
- Always start by checking what's on screen (search_elements, get_element_info, get_window_list, or screenshot)
- Use search_elements to find buttons, text fields, menus by name substring
- Use focus_window to switch between applications before interacting with their elements
- Use precise coordinates for clicking (based on screenshot analysis)
- Use type_text to fill text fields
- Use key_combo for keyboard shortcuts like ctrl+c, ctrl+v, alt+tab, win+r
- Use launch_app to open programs by name
- Use clipboard for copy/paste workflows instead of ctrl+c/ctrl+v when possible
- Use get_selected_text to read selected text from any application (works universally)
- Use file_operations to list, read, write, copy, move, or delete files
- Use right_click to open context menus
- Use hover to reveal tooltips and dropdown menus
- Use get_window_list to find and switch between open windows
- Use wait to pause while apps load or UI updates
- Complete the task in as few steps as possible

CRITICAL: When you use tools, you will see the results. After receiving tool results, provide a clear, helpful final response to the user summarizing what you found or accomplished. Do NOT just output tool names - explain what the results mean.

Your final response MUST:
- Be a complete sentence or two describing what you accomplished
- Mention the specific actions you took (e.g., "I pressed Win+D to minimize all windows")
- Confirm the result (e.g., "All open windows are now minimized")
- Never respond with just "Done" or a single word

Current session: ${sessionId}`),
      new HumanMessage(task),
    ];

    yield* this.runReactLoop(messages, sessionId, onProgress);
  }

  private async *runReactLoop(
    messages: BaseMessage[],
    sessionId: string,
    onProgress?: (progress: DesktopTaskProgress) => void,
  ): AsyncGenerator<string> {
    let stepCount = 0;
    const accumulatedResponse: string[] = [];

    try {
      for (let step = 0; step < this.maxSteps; step++) {
        // Call LLM with tools bound
        const response = await this.llmWithTools!.invoke(messages);
        const aiMessage = response as AIMessage;
        messages.push(aiMessage);

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
          // Yield the accumulated response plus this final text
          const finalResponse = accumulatedResponse.join('\n\n') + (accumulatedResponse.length > 0 ? '\n\n' : '') + textContent;
          if (finalResponse.trim()) {
            yield finalResponse.trim();
          } else if (textContent.trim()) {
            yield textContent.trim();
          }
          break;
        }

        // There are tool calls - store the thought but don't yield yet
        if (textContent.trim()) {
          accumulatedResponse.push(textContent.trim());
        }

        // Execute each tool call
        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.args as Record<string, unknown>;

          stepCount++;

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

          if (dangerLevel !== 'safe') {
            const confirmationId = `${sessionId}-${Date.now()}-${stepCount}`;

            log.info(`[HITL] Pausing for confirmation: ${toolName} (${dangerLevel})`);

            const progress: DesktopTaskProgress = {
              step: stepCount,
              maxSteps: this.maxSteps,
              status: 'complete',
              message: `Awaiting approval for ${toolName}`,
            };
            if (onProgress) onProgress(progress);

            const approved = interrupt({
              type: 'desktop_confirmation',
              action: toolName,
              description: `${toolName} (${dangerLevel}): ${JSON.stringify(toolArgs)}`,
              dangerLevel,
              args: toolArgs,
              sessionId,
              confirmationId,
            }) as boolean;

            if (!approved) {
              log.info(`[HITL] Action denied: ${toolName}`);
              const toolResult = `The user denied this action. Do not retry. Choose a different approach.`;
              messages.push(new ToolMessage({ tool_call_id: toolCall.id!, content: toolResult, name: toolName }));

              const deniedProgress: DesktopTaskProgress = {
                step: stepCount,
                maxSteps: this.maxSteps,
                status: 'error',
                message: `Action ${toolName} denied`,
              };
              if (onProgress) onProgress(deniedProgress);
              continue;
            }

            log.info(`[HITL] Action approved: ${toolName}`);
          }

          // Execute the tool
          const tool = this.toolMap.get(toolName);
          let toolResult: string | object;
          let isScreenshotResult = false;

          try {
            if (!tool) {
              toolResult = `Error: Unknown tool "${toolName}"`;
            } else {
              log.debug(`[ReAct] Invoking tool: ${toolName} with args:`, JSON.stringify(toolArgs));
              const result = await tool.invoke({ input: toolArgs });
              toolResult = result;
              // Detect screenshot result with embedded image
              isScreenshotResult = typeof result === 'object' && result !== null && (result as ScreenshotToolResult)._type === 'screenshot_result';
              log.debug(`[ReAct] Tool ${toolName} returned${isScreenshotResult ? ' (screenshot with image)' : ''}:`, typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200));
            }
          } catch (error) {
            toolResult = `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }

          // Build the ToolMessage. For screenshots, include the image as multimodal content.
          if (isScreenshotResult && typeof toolResult === 'object') {
            const sr = toolResult as ScreenshotToolResult;
            // Multimodal ToolMessage: text description + image
            const imageContent = [
              { type: 'text', text: sr.description },
              { type: 'image_url', image_url: { url: sr.image } },
            ];
            log.debug(`[ReAct] Sending multimodal ToolMessage for screenshot with ${sr.image.length} char data URL`);
            messages.push(new ToolMessage({ tool_call_id: toolCall.id!, content: imageContent, name: toolName }));
          } else {
            const textResult = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            messages.push(new ToolMessage({ tool_call_id: toolCall.id!, content: textResult, name: toolName }));
          }

          // Verify action effect for dangerous actions and inject feedback
          if (dangerLevel === 'dangerous' && this.verifier && this.adapter) {
            try {
              const verification = await this.verifier.verify(
                { type: toolName, args: toolArgs },
                this.adapter,
              );
              if (verification.hardReject) {
                log.warn(`[ReAct] Verification hard-rejected for ${toolName}: score=${verification.score}`);
                // Inject feedback telling the LLM the action failed verification
                messages.push(new HumanMessage(
                  `VERIFICATION: Your last action (${toolName}) did not produce the expected effect. The screen did not show the expected changes (hard reject). Try a different approach.`
                ));
              } else if (verification.score < 0.5) {
                log.warn(`[ReAct] Verification low-score for ${toolName}: score=${verification.score}`);
                // Inject feedback telling the LLM the action had limited effect
                const pixelDiff = verification.signals.find(s => s.type === 'pixel_diff');
                const diffValue = pixelDiff && pixelDiff.value !== undefined ? (pixelDiff.value as number) : 'unknown';
                messages.push(new HumanMessage(
                  `VERIFICATION: Your last action (${toolName}) had limited effect on screen. Pixel diff: ${diffValue}. The expected change may not have occurred. Consider trying a different approach.`
                ));
              }
            } catch {
              // Ignore verifier errors
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
    } catch (error) {
      const errorProgress: DesktopTaskProgress = {
        step: stepCount,
        maxSteps: this.maxSteps,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      if (onProgress) onProgress(errorProgress);
      this.emit('progress', errorProgress);
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
    return 'capturing';
  }

  async closeSession(_sessionId: string): Promise<void> {
    log.debug('Closing desktop session');

    if (this.adapter) {
      try {
        await this.adapter.cleanup();
      } catch (error) {
        log.warn('Error cleaning up adapter:', error);
      }
    }

    if (this.verifier) {
      this.verifier.reset();
    }

    this.isInitialized = false;
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
