import { createLogger } from '../../utils/logger';

const log = createLogger('BrowserSessionMgr');

export interface BrowserSession {
  id: string;
  createdAt: Date;
  lastActive: Date;
  url?: string;
  headedMode: boolean;
  status: 'active' | 'idle' | 'closed';
  stepCount: number;
}

export interface BrowserSessionConfig {
  headed?: boolean;
  maxSteps?: number;
  stepTimeout?: number;
}

export class BrowserSessionManager {
  private currentSession: BrowserSession | null = null;
  private readonly maxSteps: number = 10;
  private readonly stepTimeout: number = 30000; // 30 seconds
  private readonly inactivityTimeout: number = 300000; // 5 minutes

  async createSession(config?: BrowserSessionConfig): Promise<string> {
    // Close any existing session first
    if (this.currentSession && this.currentSession.status !== 'closed') {
      log.info('Closing existing session before creating new one');
      await this.closeSession();
    }

    const sessionId = `browser-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      createdAt: new Date(),
      lastActive: new Date(),
      headedMode: config?.headed ?? false,
      status: 'active',
      stepCount: 0,
    };

    log.info(`Created session: ${sessionId}`);
    return sessionId;
  }

  async getCurrentSession(): Promise<BrowserSession | null> {
    if (!this.currentSession) {
      return null;
    }

    // Check if session has timed out due to inactivity
    const timeSinceLastActive = Date.now() - this.currentSession.lastActive.getTime();
    if (timeSinceLastActive > this.inactivityTimeout) {
      log.info('Session timed out due to inactivity');
      await this.closeSession();
      return null;
    }

    return this.currentSession;
  }

  async updateSessionActivity(sessionId: string, updates: Partial<BrowserSession>): Promise<void> {
    if (!this.currentSession || this.currentSession.id !== sessionId) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.currentSession = {
      ...this.currentSession,
      ...updates,
      lastActive: new Date(),
    };

    if (updates.stepCount !== undefined) {
      this.currentSession.stepCount = updates.stepCount;
    }
  }

  async closeSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    log.info(`Closing session: ${this.currentSession.id}`);
    this.currentSession.status = 'closed';
    this.currentSession = null;
  }

  async autoCloseInactiveSession(timeoutMs?: number): Promise<void> {
    if (!this.currentSession || this.currentSession.status === 'closed') {
      return;
    }

    const timeout = timeoutMs ?? this.inactivityTimeout;
    const timeSinceLastActive = Date.now() - this.currentSession.lastActive.getTime();

    if (timeSinceLastActive > timeout) {
      log.info('Auto-closing inactive session');
      await this.closeSession();
    }
  }

  getSessionStatus(): { active: boolean; sessionId?: string; url?: string; stepCount?: number } {
    if (!this.currentSession || this.currentSession.status === 'closed') {
      return { active: false };
    }

    return {
      active: true,
      sessionId: this.currentSession.id,
      url: this.currentSession.url,
      stepCount: this.currentSession.stepCount,
    };
  }

  isSessionActive(): boolean {
    return this.currentSession?.status === 'active';
  }

  getCurrentSessionId(): string | null {
    return this.currentSession?.id ?? null;
  }
}

// Singleton instance
export const browserSessionManager = new BrowserSessionManager();
