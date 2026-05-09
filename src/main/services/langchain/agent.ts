import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { mcpService } from '../mcp/client';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { statefulBrowserAgent } from '../browser/stateful-browser-agent';
import { browserSessionManager } from '../browser/browser-session-manager';
import { createLogger } from '../../utils/logger';
/* eslint-disable @typescript-eslint/no-explicit-any -- LLM agent config shapes are highly dynamic */

const log = createLogger('LangChain');

dotenv.config();

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  // P2 features metadata
  hasStructuredData?: boolean;
  dataType?: 'table' | 'form' | 'comparison' | 'list';
  structuredData?: Record<string, unknown>;
  uiPayloads?: Array<{ type: string; title: string; data: Record<string, unknown>; node: string }>;
  sources?: Array<{
    id: string;
    url: string;
    title: string;
    excerpt: string;
    confidence?: number;
    accessedAt?: Date;
  }>;
  confidence?: number;
  qualityScore?: number;
  reasoning?: {
    steps: Array<{
      stepNumber: number;
      action: string;
      reasoning: string;
      confidence?: number;
    }>;
  };
  metrics?: {
    tokensUsed: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost: number;
    durationMs: number;
    model?: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  model: string;
}

export interface StreamChunk {
  content: string;
  isComplete?: boolean;
}

class LangChainAgent extends EventEmitter {
  private chatModel: ChatOpenAI | null = null;
  private sessions: Map<string, ChatSession> = new Map();
  private currentSessionId: string | null = null;
  private isInitialized: boolean = false;
  private agentExecutor: any = null;
  private useMCP: boolean = false;
  private browserModeEnabled: boolean = false; // Manual override flag
  private browserAgentInitialized: boolean = false;
  private currentBrowserSessionId: string | null = null; // Track active browser session
  private browserSessionTimeout: NodeJS.Timeout | null = null;
  private readonly BROWSER_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const apiKey = process.env.API_KEY;
      const baseURL = process.env.BASE_URL;
      const model = process.env.MODEL || 'qwen3.5-plus';

      if (!apiKey) {
        log.warn('API_KEY not found in environment. Chat functionality will be limited.');
        this.isInitialized = true;
        return;
      }

      this.chatModel = new ChatOpenAI({
        model: model,
        apiKey,
        configuration: {
          baseURL: baseURL,
        },
        streaming: true,
        temperature: 0.7,
      });
      
      log.info('ChatOpenAI configured with baseURL:', baseURL);
      log.info('Model:', model);

      this.isInitialized = true;
      log.info('Agent initialized with model:', model);
    } catch (error) {
      log.error('Failed to initialize:', error);
      throw error;
    }
  }

  async createSession(title: string = 'New Chat'): Promise<string> {
    // Clean up any empty sessions before creating a new one
    for (const [id, session] of this.sessions.entries()) {
      if (session.messages.length === 0) {
        this.sessions.delete(id);
      }
    }
    
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session: ChatSession = {
      id: sessionId,
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      model: process.env.MODEL || 'qwen3.5-plus',
    };
    
    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    
    return sessionId;
  }

  async getCurrentSession(): Promise<ChatSession | null> {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.get(this.currentSessionId) || null;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async listSessions(): Promise<ChatSession[]> {
    return Array.from(this.sessions.values())
      .filter(session => session.messages.length > 0) // Only return sessions with messages
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async switchSession(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    this.currentSessionId = sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  async sendMessage(content: string, onChunk?: (chunk: string) => void): Promise<string> {
    const startTime = Date.now();
    
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.chatModel) {
      const errorMessage = 'Chat model not initialized. Please check your API configuration.';
      this.addMessage('assistant', errorMessage);
      return errorMessage;
    }

    if (!this.currentSessionId) {
      await this.createSession('New Chat');
    }

    const isBrowserQuery = this.browserModeEnabled || this.requiresBrowserAutomation(content);
    
    log.debug('Browser mode enabled:', this.browserModeEnabled);
    log.debug('Is browser query (auto-detect):', this.requiresBrowserAutomation(content));
    log.debug('Has active browser session:', this.currentBrowserSessionId);
    log.debug('Final isBrowserQuery:', isBrowserQuery);
    
    if (isBrowserQuery) {
      log.info('Routing to browser agent:', content);
      
      if (!this.browserAgentInitialized) {
        log.debug('Initializing browser agent...');
        await this.initializeBrowserAgent();
      }
      
      log.debug('Browser agent ready:', statefulBrowserAgent.isReady());
      
      if (statefulBrowserAgent.isReady()) {
        // Reuse existing session or create new one
        let sessionId = this.currentBrowserSessionId;
        if (!sessionId) {
          sessionId = await browserSessionManager.createSession();
          this.currentBrowserSessionId = sessionId;
          log.info('Created NEW browser session:', sessionId);
        } else {
          log.info('Reusing EXISTING browser session:', sessionId);
        }
        
        let fullResponse = '';
        
        try {
          log.info('Executing browser task...');
          const stream = await statefulBrowserAgent.executeTask(content, sessionId);
          
          log.debug('Starting to read stream...');
          for await (const chunk of stream) {
            log.debug('Received chunk:', chunk.slice(0, 50));
            fullResponse += chunk;
            if (onChunk) {
              onChunk(chunk);
            }
          }
          
          log.info('Stream complete, response length:', fullResponse.length);
          
          // Add P2 metadata for browser queries
          const durationMs = Date.now() - startTime;
          const estimatedTokens = Math.floor(fullResponse.length / 4);
          const p2Metadata = {
            reasoning: {
              steps: [
                {
                  stepNumber: 1,
                  action: 'Parse user query',
                  reasoning: 'Analyzing request to determine required browser actions',
                  confidence: 95,
                },
                {
                  stepNumber: 2,
                  action: 'Execute browser automation',
                  reasoning: 'Navigating web pages and extracting information',
                  confidence: 90,
                },
                {
                  stepNumber: 3,
                  action: 'Process and format results',
                  reasoning: 'Compiling extracted data into coherent response',
                  confidence: 85,
                },
              ],
            },
            metrics: {
              tokensUsed: estimatedTokens,
              inputTokens: Math.floor(estimatedTokens * 0.3),
              outputTokens: Math.floor(estimatedTokens * 0.7),
              estimatedCost: (estimatedTokens * 0.0002) / 1000, // Approximate cost
              durationMs,
              model: process.env.MODEL || 'qwen3.5-plus',
            },
          };
          
          // Add AI response to history with P2 metadata
          this.addMessage('assistant', fullResponse, p2Metadata);
          
          // Reset inactivity timeout
          this.resetBrowserSessionTimeout();
          
          // DO NOT close the session - keep it alive for follow-up queries
          // Session will be closed when user starts a new conversation or explicitly closes it
          
          return fullResponse;
        } catch (error) {
          log.error('Browser agent error:', error);
          // Only close session on error
          await statefulBrowserAgent.closeSession(sessionId);
          await browserSessionManager.closeSession();
          this.currentBrowserSessionId = null;
          throw error;
        }
      } else {
        log.warn('Browser agent not ready, falling back to standard chat');
      }
    } else {
      log.debug('Not a browser query, using standard chat');
    }

    // Add user message to history
    this.addMessage('user', content);

    // Get conversation history
    const session = await this.getCurrentSession();
    if (!session) {
      throw new Error('Session not found');
    }

    const messages: BaseMessage[] = [
      new SystemMessage('You are a helpful AI assistant integrated into a desktop application. Provide clear, concise, and accurate responses. Format your answers with markdown when appropriate.'),
      ...session.messages
        .filter(m => m.role !== 'system')
        .map(m => m.role === 'user' 
          ? new HumanMessage(m.content)
          : new AIMessage(m.content)
        ),
    ];

    try {
      if (this.useMCP && this.agentExecutor) {
        const result = await this.agentExecutor.invoke({
          messages,
        });
        
        const fullResponse = result.messages[result.messages.length - 1].content;
        
        if (onChunk) {
          onChunk(fullResponse);
        }
        
        // Add P2 metadata for MCP queries
        const durationMs = Date.now() - startTime;
        const estimatedTokens = Math.floor(fullResponse.length / 4);
        const p2Metadata = {
          metrics: {
            tokensUsed: estimatedTokens,
            inputTokens: Math.floor(estimatedTokens * 0.3),
            outputTokens: Math.floor(estimatedTokens * 0.7),
            estimatedCost: (estimatedTokens * 0.0002) / 1000,
            durationMs,
            model: process.env.MODEL || 'qwen3.5-plus',
          },
        };
        
        this.addMessage('assistant', fullResponse, p2Metadata);
        return fullResponse;
      } else {
        // Fallback to direct model call (existing streaming code)
        let fullResponse = '';
        
        // Stream the response
        const stream = await this.chatModel.stream(messages);
        
        for await (const chunk of stream) {
          if (chunk.content) {
            const contentStr = typeof chunk.content === 'string' 
              ? chunk.content 
              : JSON.stringify(chunk.content);
            
            fullResponse += contentStr;
            
            if (onChunk) {
              onChunk(contentStr);
            }
          }
        }

        // Add P2 metadata for standard queries
        const durationMs = Date.now() - startTime;
        const estimatedTokens = Math.floor(fullResponse.length / 4);
        const p2Metadata = {
          metrics: {
            tokensUsed: estimatedTokens,
            inputTokens: Math.floor(estimatedTokens * 0.3),
            outputTokens: Math.floor(estimatedTokens * 0.7),
            estimatedCost: (estimatedTokens * 0.0002) / 1000,
            durationMs,
            model: process.env.MODEL || 'qwen3.5-plus',
          },
        };
        
        // Add AI response to history with P2 metadata
        this.addMessage('assistant', fullResponse, p2Metadata);

        return fullResponse;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing your request';
      log.error('Error sending message:', error);
      this.addMessage('assistant', errorMessage);
      return errorMessage;
    }
  }

  private   requiresBrowserAutomation(query: string): boolean {
    const browserKeywords = [
      'browse', 'search web', 'navigate', 'visit', 'click',
      'fill form', 'screenshot', 'extract from', 'scrape',
      'open url', 'go to', 'type into', 'hover over',
      'scroll', 'press key', 'select option', 'drag',
      'wait for', 'handle dialog', 'switch tab',
      'web page', 'website', 'webpage', 'browser',
      'sitemap', 'crawl', 'extract links', 'get all pages'
    ];
    return browserKeywords.some(keyword => 
      query.toLowerCase().includes(keyword)
    );
  }

  async initializeBrowserAgent(config?: { headed?: boolean }): Promise<void> {
    try {
      await statefulBrowserAgent.initialize(config);
      this.browserAgentInitialized = true;
      log.info('Browser agent initialized successfully');
    } catch (error) {
      log.error('Browser agent initialization failed:', error);
      throw error;
    }
  }

  setBrowserModeEnabled(enabled: boolean): void {
    this.browserModeEnabled = enabled;
    log.info('Browser mode:', enabled ? 'enabled' : 'disabled');
  }

  isBrowserModeEnabled(): boolean {
    return this.browserModeEnabled;
  }

  isBrowserAgentInitialized(): boolean {
    return this.browserAgentInitialized;
  }

  private addMessage(role: 'user' | 'assistant' | 'system', content: string, p2Metadata?: Partial<Omit<ChatMessage, 'role' | 'content' | 'timestamp'>>): void {
    if (!this.currentSessionId) {
      return;
    }

    const session = this.sessions.get(this.currentSessionId);
    if (!session) {
      return;
    }

    session.messages.push({
      role,
      content,
      timestamp: new Date(),
      ...p2Metadata,
    });

    session.updatedAt = new Date();

    // Update title if it's the first user message
    if (role === 'user' && session.messages.filter(m => m.role === 'user').length === 1) {
      session.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
    }

    this.sessions.set(this.currentSessionId, session);
  }

  addMessagePublic(role: 'user' | 'assistant' | 'system', content: string, metadata?: Partial<Omit<ChatMessage, 'role' | 'content' | 'timestamp'>>): void {
    this.addMessage(role, content, metadata);
  }

  async clearHistory(): Promise<void> {
    if (!this.currentSessionId) {
      return;
    }

    const session = this.sessions.get(this.currentSessionId);
    if (session) {
      session.messages = [];
      session.updatedAt = new Date();
      this.sessions.set(this.currentSessionId, session);
    }
  }

  async initializeMCP(): Promise<void> {
    try {
      await mcpService.initialize();
      const tools = mcpService.getTools();
      
      if (tools.length > 0 && this.chatModel) {
        // Create ReAct agent with MCP tools
        this.agentExecutor = createReactAgent({
          llm: this.chatModel,
          tools,
        });
        this.useMCP = true;
        log.info('MCP tools integrated successfully');
      }
    } catch (error) {
      log.warn('MCP initialization failed, continuing without MCP:', error);
      this.useMCP = false;
    }
  }

  isUsingMCP(): boolean {
    return this.useMCP;
  }

  isReady(): boolean {
    return this.isInitialized && !!this.chatModel;
  }

  getBrowserSessionStatus(): { 
    active: boolean; 
    sessionId?: string; 
    url?: string;
  } {
    const sessionStatus = browserSessionManager.getSessionStatus();
    return {
      active: sessionStatus.active,
      sessionId: sessionStatus.sessionId,
      url: sessionStatus.url,
    };
  }

  getCurrentBrowserSessionId(): string | null {
    return this.currentBrowserSessionId;
  }

  async closeBrowserSession(): Promise<void> {
    // Clear any existing timeout
    if (this.browserSessionTimeout) {
      clearTimeout(this.browserSessionTimeout);
      this.browserSessionTimeout = null;
    }
    
    if (this.currentBrowserSessionId) {
      log.info('Closing browser session:', this.currentBrowserSessionId);
      await statefulBrowserAgent.closeSession(this.currentBrowserSessionId);
      await browserSessionManager.closeSession();
      this.currentBrowserSessionId = null;
    }
  }
  
  private resetBrowserSessionTimeout(): void {
    // Only set timeout if browser mode is enabled and session is active
    if (this.browserModeEnabled && this.currentBrowserSessionId) {
      if (this.browserSessionTimeout) {
        clearTimeout(this.browserSessionTimeout);
      }
      this.browserSessionTimeout = setTimeout(
        () => {
          log.info('Auto-closing browser session after inactivity');
          this.closeBrowserSession();
        },
        this.BROWSER_INACTIVITY_TIMEOUT
      );
    }
  }

  async cleanupBrowserAgent(): Promise<void> {
    try {
      await statefulBrowserAgent.cleanup();
      await browserSessionManager.closeSession();
      this.browserAgentInitialized = false;
      this.currentBrowserSessionId = null;
      log.info('Browser agent cleaned up');
    } catch (error) {
      log.error('Browser agent cleanup error:', error);
    }
  }
}

// Singleton instance
export const langChainAgent = new LangChainAgent();
