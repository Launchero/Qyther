import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { MCPAdapter } from '@langchain/mcp-adapters';
/* eslint-disable @typescript-eslint/no-explicit-any -- Browser/MCP tool results are highly dynamic */
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { createLogger } from '../../utils/logger';
import { mcpService } from '../mcp/client';

const log = createLogger('BrowserAgent');

dotenv.config();

export interface BrowserAgentState {
  sessionId: string;
  messages: BaseMessage[];
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

export class StatefulBrowserAgent extends EventEmitter {
  private agentExecutor: any = null;
  private checkpointer: MemorySaver;
  private headedMode: boolean = false;
  private browserTools: any[] = [];
  private fallbackClient: MCPAdapter | null = null;
  private usingFallback = false;
  private isInitialized: boolean = false;
  private readonly maxSteps: number = 10;
  private readonly stepTimeout: number = 30000; // 30 seconds

  constructor() {
    super();
    this.checkpointer = new MemorySaver();
  }

  async initialize(config?: { headed?: boolean }): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.headedMode = config?.headed ?? false;

      // Try to get browser tools from shared mcpService first
      if (mcpService.isInitialized() && mcpService.getTools().length > 0) {
        const allTools = mcpService.getTools();
        this.browserTools = allTools.filter((tool: any) =>
          tool.name?.startsWith('browser_')
        );
        this.usingFallback = false;
        log.info(`Loaded ${this.browserTools.length} browser tools from shared mcpService`);
      } else {
        // Fallback: create own Playwright client if mcpService not initialized
        log.warn('mcpService not initialized, creating fallback Playwright client');
        // 2.x validates config strictly, so the bare connections record this used to pass
        // is now rejected; connections belong under `servers`.
        this.fallbackClient = new MCPAdapter({
          servers: {
            playwright: {
              command: 'npx',
              args: ['@playwright/mcp@latest'],
              transport: 'stdio' as const,
            },
          },
          // Without this the tools arrive as playwright_browser_navigate and the
          // startsWith('browser_') filter below matches nothing.
          prefixToolNameWithServerName: false,
        });

        const allTools = await this.fallbackClient.listTools();
        this.browserTools = allTools.filter((tool: any) =>
          tool.name?.startsWith('browser_')
        );
        this.usingFallback = true;
        log.info(`Loaded ${this.browserTools.length} browser tools from fallback client`);
      }

      if (this.browserTools.length === 0) {
        throw new Error('No browser tools found from Playwright MCP server');
      }

      log.info(`Loaded ${this.browserTools.length} browser tools`);

      const apiKey = process.env.API_KEY;
      const baseURL = process.env.BASE_URL;
      const model = process.env.MODEL || 'qwen3.6-plus';

      if (!apiKey) {
        throw new Error('API_KEY not found in environment');
      }

      const chatModel = new ChatOpenAI({
        model: model,
        apiKey,
        configuration: {
          baseURL: baseURL,
        },
        temperature: 0.7,
      });

      // Create ReAct agent with tools
      this.agentExecutor = createReactAgent({
        llm: chatModel,
        tools: this.browserTools as any,
        checkpointSaver: this.checkpointer,
      });

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
    if (!this.isInitialized) {
      throw new Error('Browser agent not initialized');
    }

    const messages: BaseMessage[] = [
      new SystemMessage(`You are a browser automation assistant. You can navigate web pages, click elements, fill forms, and extract information. 
      
Important guidelines:
- Use browser_navigate to go to URLs
- Use browser_snapshot to see what's on the page
- Use browser_click to interact with elements
- Use browser_type to fill in text fields
- Be concise and efficient
- Complete the task in as few steps as possible
- Report progress clearly to the user

Current session: ${sessionId}`),
      new HumanMessage(task),
    ];

    const stream = this.agentExecutor.streamEvents(
      { messages },
      { version: "v2", configurable: { thread_id: sessionId } }
    );

    return this.createStreamFromEvents(stream, sessionId, onProgress);
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

    const skillInstructions = skillContext
      ? `\n\nSKILL INSTRUCTIONS:\n${skillContext}\n\nFollow the skill instructions above for this task.`
      : '';

    const messages: BaseMessage[] = [
      new SystemMessage(`You are a browser automation assistant. You can navigate web pages, click elements, fill forms, and extract information.
      
Important guidelines:
- Use browser_navigate to go to URLs
- Use browser_snapshot to see what's on the page
- Use browser_click to interact with elements
- Use browser_type to fill in text fields
- Be concise and efficient
- Complete the task in as few steps as possible
- Report progress clearly to the user${skillInstructions}

Current session: ${sessionId}`),
      new HumanMessage(task),
    ];

    const stream = this.agentExecutor.streamEvents(
      { messages },
      { version: "v2", configurable: { thread_id: sessionId } }
    );

    yield* this.createStreamFromEvents(stream, sessionId, progressCallback);
  }

  /**
   * Get all MCP browser tools for use by verifier and other components.
   */
  async getMcpTools(): Promise<any[]> {
    return this.browserTools;
  }

  private async *createStreamFromEvents(
    stream: AsyncIterable<any>,
    sessionId: string,
    onProgress?: (progress: BrowserTaskProgress) => void
  ): AsyncGenerator<string> {
    let stepCount = 0;
    let lastUrl: string | undefined;

    try {
      for await (const event of stream) {
        const eventName = event.event;
        const toolName = event.name as string | undefined;

        if (eventName === "on_tool_start") {
          stepCount++;
          const status = this.inferStatusFromTool(toolName);
          const url = this.extractUrlFromToolInput(event.data?.input);
          if (url) lastUrl = url;

          const progress: BrowserTaskProgress = {
            step: stepCount,
            maxSteps: this.maxSteps,
            status,
            url,
            message: `Executing ${toolName}`,
          };

          if (onProgress) onProgress(progress);
          this.emit('progress', progress);
        } else if (eventName === "on_tool_end") {
          stepCount++;
          const progress: BrowserTaskProgress = {
            step: stepCount,
            maxSteps: this.maxSteps,
            status: 'complete',
            url: lastUrl,
            message: `Completed ${toolName}`,
          };

          if (onProgress) onProgress(progress);
          this.emit('progress', progress);
        } else if (eventName === "on_chat_model_stream") {
          const content = event.data?.chunk?.content;
          if (content) {
            const textContent = typeof content === 'string'
              ? content
              : Array.isArray(content)
                ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
                : '';

            if (textContent) {
              yield textContent;
            }
          }
        }
      }

      // Emit completion
      const completionProgress: BrowserTaskProgress = {
        step: stepCount,
        maxSteps: this.maxSteps,
        status: 'complete',
        url: lastUrl,
        message: 'Task completed',
      };

      if (onProgress) onProgress(completionProgress);
      this.emit('progress', completionProgress);
    } catch (error) {
      const errorProgress: BrowserTaskProgress = {
        step: stepCount,
        maxSteps: this.maxSteps,
        status: 'error',
        url: lastUrl,
        message: error instanceof Error ? error.message : 'Unknown error',
      };

      if (onProgress) onProgress(errorProgress);
      this.emit('progress', errorProgress);
      throw error;
    }
  }

  private inferStatusFromTool(toolName: string | undefined): BrowserTaskProgress['status'] {
    if (!toolName) return 'navigating';
    if (toolName.includes('navigate')) return 'navigating';
    if (toolName.includes('click')) return 'clicking';
    if (toolName.includes('type') || toolName.includes('fill')) return 'typing';
    if (toolName.includes('snapshot') || toolName.includes('extract')) return 'extracting';
    return 'navigating';
  }

  private extractUrlFromToolInput(input: any): string | undefined {
    if (input && typeof input === 'object') {
      return input.url || input.href || undefined;
    }
    return undefined;
  }

  async closeSession(sessionId: string): Promise<void> {
    log.info(`Closing session: ${sessionId}`);
    
    if (this.agentExecutor) {
      try {
        await this.agentExecutor.invoke(
          {
            messages: [new HumanMessage('Close the browser session')],
          },
          {
            configurable: {
              thread_id: sessionId,
            },
          }
        );
      } catch (error) {
        log.warn('Error closing browser:', error);
      }
    }
  }

  async cleanup(): Promise<void> {
    log.info('Cleaning up resources');

    if (this.usingFallback && this.fallbackClient) {
      try {
        await this.fallbackClient.close();
        this.fallbackClient = null;
      } catch (error) {
        log.error('Error closing fallback MCP client:', error);
      }
    }

    this.agentExecutor = null;
    this.browserTools = [];
    this.usingFallback = false;
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
      const evaluateTool = this.browserTools.find((t: any) => t.name === 'browser_evaluate');
      
      if (!evaluateTool) {
        log.warn('browser_evaluate tool not found, using alternative method');
        // Fallback: return empty array
        return [];
      }
      
      const result = await evaluateTool.invoke({
        script: `() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links
            .map(a => a.href)
            .filter(href => href.startsWith('http'))
            .filter((href, index, self) => self.indexOf(href) === index); // Remove duplicates
        }`
      });
      
      const links = JSON.parse(result as string);
      log.info(`Extracted ${links.length} links`);
      return links;
    } catch (error) {
      log.error('Error extracting links:', error);
      return [];
    }
  }
}

// Singleton instance
export const statefulBrowserAgent = new StatefulBrowserAgent();
