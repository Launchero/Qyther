import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { loadMcpTools } from '@langchain/mcp-adapters';
import type { RunnableToolLike } from '@langchain/core/runnables';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

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
  private mcpClient: MultiServerMCPClient | null = null;
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
      
      // Initialize MCP client with Playwright
      this.mcpClient = new MultiServerMCPClient({
        playwright: {
          command: 'npx',
          args: ['@playwright/mcp@latest'],
          transport: 'stdio' as const,
        },
      });

      // Get tools from MCP client
      const allTools = await this.mcpClient.getTools();
      
      // Filter to only browser tools
      const browserTools = allTools.filter((tool: any) => 
        tool.name?.startsWith('browser_')
      );

      if (browserTools.length === 0) {
        throw new Error('No browser tools found from Playwright MCP server');
      }

      console.log(`[BrowserAgent] Loaded ${browserTools.length} browser tools`);

      // Initialize ChatOpenAI model
      const apiKey = process.env.API_KEY;
      const baseURL = process.env.BASE_URL;
      const model = process.env.MODEL || 'qwen3.5-plus';

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
        tools: browserTools as any,
        checkpointSaver: this.checkpointer,
      });

      this.isInitialized = true;
      console.log('[BrowserAgent] Initialized successfully');
    } catch (error) {
      console.error('[BrowserAgent] Initialization failed:', error);
      throw error;
    }
  }

  async createSession(): Promise<string> {
    const sessionId = `browser-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[BrowserAgent] Created session: ${sessionId}`);
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

    try {
      // Execute the agent with invoke (not stream) and get final result
      console.log('[BrowserAgent] Invoking agent with thread_id:', sessionId);
      const result = await this.agentExecutor.invoke(
        { messages },
        {
          configurable: {
            thread_id: sessionId,
          },
        }
      );
      
      console.log('[BrowserAgent] Agent execution complete, result:', JSON.stringify(result, null, 2));
      
      // Extract the final response from the result
      let finalResponse = '';
      if (result.messages && result.messages.length > 0) {
        const lastMessage = result.messages[result.messages.length - 1];
        finalResponse = lastMessage.content || '';
        console.log('[BrowserAgent] Final response length:', finalResponse.length);
      }
      
      // Create a simple async generator that yields the final response
      async function* generateResponse() {
        if (finalResponse) {
          yield finalResponse;
        }
      }
      
      return generateResponse();
    } catch (error) {
      console.error('[BrowserAgent] Execution error:', error);
      
      // Create error response generator
      async function* generateError() {
        yield `Error executing browser task: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
      
      return generateError();
    }
  }

  private async *createProgressStream(
    originalStream: AsyncIterable<any>,
    sessionId: string,
    onProgress?: (progress: BrowserTaskProgress) => void
  ): AsyncGenerator<string> {
    let stepCount = 0;
    let lastUrl: string | undefined;
    let currentStatus: BrowserTaskProgress['status'] = 'navigating';

    try {
      for await (const chunk of originalStream) {
        stepCount++;
        
        // Extract content from chunk
        const content = this.extractContentFromChunk(chunk);
        
        if (content) {
          // Emit progress update
          const progress: BrowserTaskProgress = {
            step: stepCount,
            maxSteps: this.maxSteps,
            status: currentStatus,
            url: lastUrl,
            message: content.slice(0, 100),
          };
          
          if (onProgress) {
            onProgress(progress);
          }
          
          this.emit('progress', progress);
          
          yield content;
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
      
      if (onProgress) {
        onProgress(completionProgress);
      }
      
      this.emit('progress', completionProgress);
    } catch (error) {
      // Emit error
      const errorProgress: BrowserTaskProgress = {
        step: stepCount,
        maxSteps: this.maxSteps,
        status: 'error',
        url: lastUrl,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      
      if (onProgress) {
        onProgress(errorProgress);
      }
      
      this.emit('progress', errorProgress);
      throw error;
    }
  }

  private extractContentFromChunk(chunk: any): string {
    try {
      // Handle different chunk formats from LangGraph
      if (typeof chunk === 'string') {
        return chunk;
      }
      
      if (chunk.messages && Array.isArray(chunk.messages)) {
        const lastMessage = chunk.messages[chunk.messages.length - 1];
        if (lastMessage?.content) {
          return typeof lastMessage.content === 'string' 
            ? lastMessage.content 
            : JSON.stringify(lastMessage.content);
        }
      }
      
      if (chunk.content) {
        return typeof chunk.content === 'string' 
          ? chunk.content 
          : JSON.stringify(chunk.content);
      }
      
      return '';
    } catch (error) {
      console.warn('[BrowserAgent] Error extracting content from chunk:', error);
      return '';
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    console.log(`[BrowserAgent] Closing session: ${sessionId}`);
    
    // Close the browser by calling browser_close tool if available
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
        console.warn('[BrowserAgent] Error closing browser:', error);
      }
    }
  }

  async cleanup(): Promise<void> {
    console.log('[BrowserAgent] Cleaning up resources');
    
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
        this.mcpClient = null;
      } catch (error) {
        console.error('[BrowserAgent] Error closing MCP client:', error);
      }
    }
    
    this.agentExecutor = null;
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
  
  async extractAllLinks(sessionId: string): Promise<string[]> {
    if (!this.mcpClient) {
      throw new Error('MCP client not initialized');
    }
    
    try {
      // Get all browser tools
      const allTools = await this.mcpClient.getTools();
      const evaluateTool = allTools.find((t: any) => t.name === 'browser_evaluate');
      
      if (!evaluateTool) {
        console.warn('[BrowserAgent] browser_evaluate tool not found, using alternative method');
        // Fallback: return empty array
        return [];
      }
      
      // Execute JavaScript to extract all links
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
      console.log('[BrowserAgent] Extracted', links.length, 'links');
      return links;
    } catch (error) {
      console.error('[BrowserAgent] Error extracting links:', error);
      return [];
    }
  }
}

// Singleton instance
export const statefulBrowserAgent = new StatefulBrowserAgent();
