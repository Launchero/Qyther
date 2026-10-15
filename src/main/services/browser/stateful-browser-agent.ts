/**
 * Pi-native stateful browser agent: one `Agent` per task over the `browser_*` Pi tools.
 *
 * This replaces the LangChain `createReactAgent` + `MemorySaver` executor. What changed is
 * the loop, not the surface: every public method keeps its signature because `browser-handlers.ts`
 * and `langchain/agent.ts` call them from outside this subtree. Pi's loop already is
 * plan→act→observe, so the deleted `browser-subgraph.ts` planner/verifier/recovery ladder has
 * no replacement here — recovery is whatever the model does with a tool error, and tools never
 * throw, so every failure arrives as readable text the model can act on.
 *
 * Tools come only from the shared `mcpService` connection, converted by
 * `pi/tools/browser-tools.ts`. The old in-repo fallback that spawned its own
 * `npx @playwright/mcp` child is deleted: a second connection is a second child process,
 * and `cleanup()` below must never kill the shared one (it belongs to the `mcp` shutdown step).
 */
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { Agent, type AgentEvent } from '@earendil-works/pi-agent-core';
import { createLogger } from '../../utils/logger';
import { getPiModel, getPiStreamFn } from '../pi/provider';
import type { PiTool } from '../pi/toolbox';
import { getBrowserToolbox } from '../pi/tools/browser-tools';

const log = createLogger('BrowserAgent');

dotenv.config();

export interface BrowserAgentState {
  sessionId: string;
  messages: unknown[];
  browserUrl?: string;
  stepCount: number;
  maxSteps: number;
  headedMode: boolean;
}

export interface BrowserTaskProgress {
  step: number;
  maxSteps: number;
  status: 'navigating' | 'clicking' | 'typing' | 'extracting' | 'complete' | 'error';
  url?: string;
  message: string;
}

/** Prompt the model drives against. The skill slot is filled per call, never stored. */
function buildBrowserSystemPrompt(sessionId: string, skillContext: string): string {
  const skillInstructions = skillContext
    ? `\n\nSKILL INSTRUCTIONS:\n${skillContext}\n\nFollow the skill instructions above for this task.`
    : '';
  return `You are a browser automation assistant. You can navigate web pages, click elements, fill forms, and extract information.

Important guidelines:
- Use browser_navigate to go to URLs
- Use browser_snapshot to see what's on the page
- Use browser_click to interact with elements
- Use browser_type to fill in text fields
- Be concise and efficient
- Complete the task in as few steps as possible
- Report progress clearly to the user${skillInstructions}

Current session: ${sessionId}`;
}

/** Pi's `message_update` arm carries the inner assistant event; only `text_delta` streams. */
function textDeltaOf(event: AgentEvent): string | null {
  if (event.type !== 'message_update') return null;
  const inner = event.assistantMessageEvent as { type?: string; delta?: string };
  return inner?.type === 'text_delta' && inner.delta ? inner.delta : null;
}

/** One drain tick when no event is queued yet. Short-lived by construction. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ToolTransition = Extract<AgentEvent, { type: 'tool_execution_start' } | { type: 'tool_execution_end' }>;

/** Mutable counters the queue consumer folds tool transitions into. */
interface DrainStats {
  steps: number;
  lastUrl: string | undefined;
}

export class StatefulBrowserAgent extends EventEmitter {
  private headedMode: boolean = false;
  private browserTools: PiTool[] = [];
  private isInitialized: boolean = false;
  private readonly maxSteps: number = 10;

  constructor() {
    super();
  }

  async initialize(config?: { headed?: boolean }): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.headedMode = config?.headed ?? false;

      // Single connection: the shared mcpService client owns the Playwright stdio child.
      this.browserTools = await getBrowserToolbox();
      if (this.browserTools.length === 0) {
        throw new Error('No browser tools found from Playwright MCP server');
      }
      log.info(`Loaded ${this.browserTools.length} browser tools`);

      if (!getPiModel()) {
        throw new Error('Pi model is not configured (MODEL/BASE_URL/API_KEY)');
      }

      this.isInitialized = true;
      log.info('Initialized successfully');
    } catch (error) {
      log.error('Initialization failed:', error);
      throw error;
    }
  }

  async createSession(): Promise<string> {
    const sessionId = `browser-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    log.info(`Created session: ${sessionId}`);
    return sessionId;
  }

  async executeTask(
    task: string,
    sessionId: string,
    onProgress?: (progress: BrowserTaskProgress) => void
  ): Promise<AsyncGenerator<string>> {
    return this.executeTaskStream(task, sessionId, onProgress);
  }

  async *executeTaskStream(
    task: string,
    sessionId: string,
    skillContextOrOnProgress?: string | ((progress: BrowserTaskProgress) => void),
    onProgress?: (progress: BrowserTaskProgress) => void
  ): AsyncGenerator<string> {
    if (!this.isInitialized) {
      throw new Error('Browser agent not initialized');
    }

    // Support both old signature (task, sessionId, onProgress) and new (task, sessionId, skillContext, onProgress)
    const skillContext = typeof skillContextOrOnProgress === 'string' ? skillContextOrOnProgress : '';
    const progressCallback = typeof skillContextOrOnProgress === 'function' ? skillContextOrOnProgress : onProgress;

    const model = getPiModel();
    if (!model) {
      throw new Error('Pi model is not configured (MODEL/BASE_URL/API_KEY)');
    }

    const agent = new Agent({
      initialState: {
        systemPrompt: buildBrowserSystemPrompt(sessionId, skillContext),
        model,
        tools: this.browserTools,
        thinkingLevel: 'off',
      },
      streamFn: getPiStreamFn(),
      sessionId,
      toolExecution: 'sequential',
    });

    yield* this.drainPiRun(agent, task, progressCallback);
  }

  /**
   * Get all browser tools for exact-name lookup.
   * The verifier that used this is deleted; the shape stays for out-of-subtree callers.
   */
  async getMcpTools(): Promise<PiTool[]> {
    return this.browserTools;
  }

  /**
   * Bridge Pi's callback events into the yielded-token + progress-callback shape the IPC
   * handler reads. The listener only queues; progress and tokens are derived in the loop
   * so one tool maps to exactly one start and one end report.
   */
  private async *drainPiRun(
    agent: Agent,
    task: string,
    onProgress?: (progress: BrowserTaskProgress) => void
  ): AsyncGenerator<string> {
    const queue: AgentEvent[] = [];
    let done = false;
    let failure: unknown = null;
    const unsubscribe = agent.subscribe((event) => {
      queue.push(event);
    });
    const run = agent
      .prompt(task)
      .catch((error: unknown) => { failure = error; })
      .finally(() => { done = true; });

    const stats: DrainStats = { steps: 0, lastUrl: undefined };
    try {
      yield* this.consumeQueue(queue, () => done, stats, onProgress);
      await run;
      if (failure) throw failure;
    } catch (error) {
      const errorProgress: BrowserTaskProgress = {
        step: stats.steps,
        maxSteps: this.maxSteps,
        status: 'error',
        url: stats.lastUrl,
        message: error instanceof Error ? error.message : 'Unknown error',
      };

      if (onProgress) onProgress(errorProgress);
      this.emit('progress', errorProgress);
      throw error;
    } finally {
      unsubscribe();
    }

    const completionProgress: BrowserTaskProgress = {
      step: stats.steps,
      maxSteps: this.maxSteps,
      status: 'complete',
      url: stats.lastUrl,
      message: 'Task completed',
    };

    if (onProgress) onProgress(completionProgress);
    this.emit('progress', completionProgress);
  }

  private async *consumeQueue(
    queue: AgentEvent[],
    isDone: () => boolean,
    stats: DrainStats,
    onProgress?: (progress: BrowserTaskProgress) => void
  ): AsyncGenerator<string> {
    while (!isDone() || queue.length > 0) {
      const event = queue.shift();
      if (!event) {
        await pause(20);
        continue;
      }
      const delta = textDeltaOf(event);
      if (delta) {
        yield delta;
      } else if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
        stats.steps += 1;
        stats.lastUrl = this.emitToolProgress(event, stats.steps, stats.lastUrl, onProgress);
      }
    }
  }

  private emitToolProgress(
    event: ToolTransition,
    step: number,
    lastUrl: string | undefined,
    onProgress?: (progress: BrowserTaskProgress) => void
  ): string | undefined {
    const started = event.type === 'tool_execution_start';
    let url = lastUrl;
    if (started) {
      const found = this.extractUrlFromToolInput(event.args);
      if (found) url = found;
    }
    const progress: BrowserTaskProgress = {
      step,
      maxSteps: this.maxSteps,
      status: started ? this.inferStatusFromTool(event.toolName) : 'complete',
      url,
      message: `${started ? 'Executing' : 'Completed'} ${event.toolName}`,
    };

    if (onProgress) onProgress(progress);
    this.emit('progress', progress);
    return url;
  }

  private inferStatusFromTool(toolName: string | undefined): BrowserTaskProgress['status'] {
    if (!toolName) return 'navigating';
    if (toolName.includes('navigate')) return 'navigating';
    if (toolName.includes('click')) return 'clicking';
    if (toolName.includes('type') || toolName.includes('fill')) return 'typing';
    if (toolName.includes('snapshot') || toolName.includes('extract')) return 'extracting';
    return 'navigating';
  }

  private extractUrlFromToolInput(input: unknown): string | undefined {
    if (input !== null && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      const url = record.url ?? record.href;
      return typeof url === 'string' ? url : undefined;
    }
    return undefined;
  }

  async closeSession(sessionId: string): Promise<void> {
    log.info(`Closing session: ${sessionId}`);
    // Pi runs are stateless — no transcript to close. The one durable effect the old
    // close had was leaving the page open behind it, so close the page directly when the
    // server exposes a close tool. The Playwright child itself is never touched here.
    const closer = this.browserTools.find((tool) => tool.name === 'browser_close');
    if (!closer) return;
    try {
      await closer.execute('close-session', {});
    } catch (error) {
      log.warn('Error closing browser:', error);
    }
  }

  async cleanup(): Promise<void> {
    log.info('Cleaning up resources');
    // Nothing to close: runs are per-task Agents and the Playwright child belongs to
    // mcpService (released by the `mcp` shutdown step). Reset the flags only.
    this.browserTools = [];
    this.isInitialized = false;
  }

  requiresBrowserAutomation(query: string): boolean {
    const browserKeywords = [
      'browse', 'search web', 'navigate', 'visit', 'click',
      'fill form', 'screenshot', 'extract from', 'scrape',
      'open url', 'go to', 'type into', 'hover over',
      'scroll', 'press key', 'select option', 'drag',
      'wait for', 'handle dialog', 'switch tab',
      'web page', 'website', 'webpage', 'browser'
    ];

    const lowerQuery = query.toLowerCase();
    return browserKeywords.some(keyword =>
      lowerQuery.includes(keyword)
    );
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async extractAllLinks(_sessionId: string): Promise<string[]> {
    try {
      const evaluateTool = this.browserTools.find((tool) => tool.name === 'browser_evaluate');

      if (!evaluateTool) {
        log.warn('browser_evaluate tool not found, using alternative method');
        // Fallback: return empty array
        return [];
      }

      const result = await evaluateTool.execute('extract-links', {
        script: `() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links
            .map(a => a.href)
            .filter(href => href.startsWith('http'))
            .filter((href, index, self) => self.indexOf(href) === index); // Remove duplicates
        }`
      });

      const body = (result.content[0] as { text?: string } | undefined)?.text ?? '';
      const links: unknown = JSON.parse(body);
      if (!Array.isArray(links)) return [];
      const urls = links.filter((link): link is string => typeof link === 'string');
      log.info(`Extracted ${urls.length} links`);
      return urls;
    } catch (error) {
      log.error('Error extracting links:', error);
      return [];
    }
  }
}

// Singleton instance
export const statefulBrowserAgent = new StatefulBrowserAgent();
