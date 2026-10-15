import { EventEmitter } from 'events';
import { mcpService } from '../mcp/client';
import { isPiConfigured } from '../pi/provider';
import { statefulBrowserAgent } from '../browser/stateful-browser-agent';
import { browserSessionManager } from '../browser/browser-session-manager';
import { createLogger } from '../../utils/logger';

const log = createLogger('LangChain');

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
  /**
   * The model itself is Pi's (`../pi/provider.ts`); this store holds nothing but
   * transcripts. What used to live here — a `ChatOpenAI` and a ReAct `agentExecutor` —
   * was the second, renderer-unreachable way to reach a model, and it is gone: the one
   * live path is the Pi ask loop (`../pi/ask-turn.ts`).
   */
  private sessions: Map<string, ChatSession> = new Map();
  /**
   * Published whenever the *visible* list (`listSessions()`: sessions that have messages, newest
   * first) can change. The renderer used to poll `chat:listSessions` for this, and a `useEffect`
   * whose dependency was a fresh closure every render turned that into an unbounded IPC loop; the
   * push is what replaces the polling entirely, so a stale transcript list is now impossible.
   */
  private sessionsChangedNotifier: ((sessions: ChatSession[]) => void) | null = null;

  private publishSessions(): void {
    const notifier = this.sessionsChangedNotifier;
    if (!notifier) return;
    // Synchronous on purpose. Awaiting `listSessions()` here left a floating promise per mutation, so
    // two rapid changes could publish out of order and a test could not observe the push without an
    // extra tick; `visibleSessions()` is already in memory.
    try {
      notifier(this.visibleSessions());
    } catch (error) {
      log.error('Failed to publish the session list:', error);
    }
  }

  /**
   * The one definition of "the sessions the renderer lists": non-empty, newest first. `listSessions`
   * and every push read it, so the two cannot disagree about what is visible.
   */
  private visibleSessions(): ChatSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.messages.length > 0)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  setSessionsChangedNotifier(notifier: ((sessions: ChatSession[]) => void) | null): void {
    this.sessionsChangedNotifier = notifier;
  }
  private currentSessionId: string | null = null;
  private isInitialized: boolean = false;
  private useMCP: boolean = false;
  private browserModeEnabled: boolean = false; // Manual override flag
  private browserAgentInitialized: boolean = false;
  private currentBrowserSessionId: string | null = null; // Track active browser session
  private browserSessionTimeout: NodeJS.Timeout | null = null;
  private readonly BROWSER_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
  }

  /**
   * Latch-only: the model client is Pi's and is built lazily on the first turn
   * (`../pi/ask-turn.ts`), so there is nothing to construct here. `isReady()` asks
   * Pi's own config predicate, which is what `chat:initialize`'s envelope reports on.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!isPiConfigured()) {
      log.warn('API_KEY/BASE_URL not found in environment. Chat functionality will be limited.');
    }

    this.isInitialized = true;
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
      model: process.env.MODEL || 'qwen3.6-plus',
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
    return this.visibleSessions();
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
    this.publishSessions();
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
    // First message makes a session *appear* in the list, and every message re-sorts it.
    this.publishSessions();
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
      // An emptied session drops out of the visible list.
      this.publishSessions();
    }
  }

  /**
   * Connect the shared MCP service and record whether anything is available.
   * This used to build a ReAct `agentExecutor` over the tools; that executor is gone —
   * the Pi ask agent binds the MCP family directly (`../pi/tools/mcp-tools.ts`), so
   * connecting is all that is left for this path to do. `mcp-handlers.ts` still calls
   * it before reading status.
   */
  async initializeMCP(): Promise<void> {
    try {
      await mcpService.initialize();
      this.useMCP = mcpService.getTools().length > 0;
      if (this.useMCP) {
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

  /**
   * Readiness is Pi's config predicate, not a model instance held here — this class
   * stores transcripts only. `chat:initialize`'s envelope reads this and reports
   * `retryable: false`, since `initialize()` latches and cannot pick up a late key.
   */
  isReady(): boolean {
    return this.isInitialized && isPiConfigured();
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
      // Release the inactivity timer FIRST. This method nulls `currentBrowserSessionId` without
      // clearing `browserSessionTimeout`, so the 5-minute handle survived and later fired
      // `closeBrowserSession()` against an already-null session — a live timer outliving the work
      // it was watching. `closeBrowserSession` clears it at the top for the same reason.
      if (this.browserSessionTimeout) {
        clearTimeout(this.browserSessionTimeout);
        this.browserSessionTimeout = null;
      }

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
