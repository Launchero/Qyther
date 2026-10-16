// Shared boundary types are `import type` only: erased at build, so this stays free of
// any runtime dependency on the main process.
import type { TurnEnvelope } from '../shared/ipc/turn';
import type { ChatSessionSummary } from '../shared/ipc/sessions';
import type { SettingsSnapshot, SettingsPatch } from '../shared/ipc/settings';

export interface ChatMetrics {
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  durationMs: number;
  model: string;
}

export interface UIPayload {
  type: string;
  title: string;
  data: Record<string, unknown>;
  node: string;
}

export interface Source {
  url: string;
  title: string;
  excerpt: string;
}

export interface ThinkingStepData extends TurnEnvelope {
  type: string;
  step: string;
  status: string;
  detail: string;
  data?: unknown;
  update?: boolean;
}

export interface StreamChunkData extends TurnEnvelope {
  chunk: string;
  isComplete: boolean;
  error?: string;
  metrics?: ChatMetrics;
  thinkingSteps?: ThinkingStepData[];
  fullContent?: string | null;
  uiPayloads?: UIPayload[];
  sources?: Source[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Array<{ id?: string; role: string; content: string; timestamp: Date | string }>;
  createdAt: Date | string;
  updatedAt: Date | string;
  model: string;
}

export interface BrowserProgressData {
  type: string;
  message: string;
  [key: string]: unknown;
}

export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getPlatformName: () => Promise<string>;
  getSystemInfo: () => Promise<{
    platform: string;
    platformName: string;
    arch: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    appVersion: string;
    userDataPath: string;
  }>;
  isWindows: () => Promise<boolean>;
  isMacOS: () => Promise<boolean>;
  isLinux: () => Promise<boolean>;

  // Window control
  window: {
    hide: () => Promise<void>;
    setMode: (mode: 'compact' | 'expanded' | 'custom') => Promise<void>;
    getMode: () => Promise<'compact' | 'expanded' | 'custom'>;
    toggleMode: () => Promise<'compact' | 'expanded' | 'custom'>;
    setCustomDimensions: (width: number, height: number) => Promise<void>;
    resizeHeight: (height: number) => Promise<void>;
    getHeight: () => Promise<number>;
    animationFrame: () => void;
  };

  // Command execution
  command: {
    execute: (command: string) => Promise<string>;
  };

  // URL handling
  url: {
    open: (url: string) => Promise<void>;
  };

  // File handling
  file: {
    open: (path: string) => Promise<void>;
    revealInFolder: (path: string) => Promise<void>;
    search: (
      query: string,
      options?: {
        maxResults?: number;
        excludeHidden?: boolean;
        excludeSystem?: boolean;
        includeMetadata?: boolean;
      }
    ) => Promise<Array<{
      path: string;
      name: string;
      size?: string;
      dateModified?: string;
      isFolder: boolean;
      relevanceScore?: number;
      category?: string;
    }>>;
    getEverythingStatus: () => Promise<{ running: boolean; esExists: boolean; platformSupported: boolean }>;
  };

  // Applications
  apps: {
    list: () => Promise<{ name: string; path: string }[]>;
  };

  // App lifecycle
  quit: () => Promise<void>;

  // Dialog API
  dialog: {
    openFile: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ path?: string; cancelled?: boolean; error?: string }>;
    openFolder: (options?: { defaultPath?: string }) => Promise<{ path?: string; cancelled?: boolean; error?: string }>;
  };

  // Debug logging
  debug: {
    log: (message: string, data?: unknown) => Promise<void>;
  };

  // API Config (buyer-provided API keys)
  apiConfig: {
    save: (config: { apiKey: string; baseUrl: string; model: string }) => Promise<{ success: boolean; error?: string }>;
    load: () => Promise<{ configured: boolean; baseUrl?: string; model?: string; maskedKey?: string }>;
    delete: () => Promise<{ success: boolean; error?: string }>;
    test: (config: { apiKey: string; baseUrl: string; model: string }) => Promise<{ success: boolean; error?: string }>;
  };

  // Settings window + main-owned appearance (a new namespace that this stale duplicate must also
  // carry, or `window.electronAPI.settings` is invisible to the renderer — the five-site hazard).
  settings: {
    open: () => Promise<{ success: boolean }>;
    get: () => Promise<SettingsSnapshot>;
    set: (patch: SettingsPatch) => Promise<SettingsSnapshot>;
    onChanged: (callback: (snapshot: SettingsSnapshot) => void) => () => void;
  };

  // Chat API
  chat: {
    initialize: () => Promise<{ success: boolean; ready: boolean; error?: string; retryable?: boolean }>;
    sendStreamMessage: (content: string, sessionId?: string, attachmentPaths?: Array<{ name: string; path: string; type: string }>) => Promise<{ success: boolean; response?: string; error?: string }>;
    createSession: (title?: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
    getCurrentSession: () => Promise<ChatSession | null>;
    getSession: (sessionId: string) => Promise<ChatSession | null>;
    listSessions: () => Promise<ChatSession[]>;
    switchSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    clearHistory: () => Promise<{ success: boolean; error?: string }>;
    isReady: () => Promise<boolean>;
    cancelTurn: (threadId: string) => Promise<{ success: boolean; error?: string }>;
    onTurnStarted: (callback: (data: TurnEnvelope & { threadId: string }) => void) => () => void;
    onSessionsChanged: (callback: (sessions: ChatSessionSummary[]) => void) => () => void;
    onStreamChunk: (callback: (data: StreamChunkData) => void) => () => void;
    onThinkingStep: (callback: (data: ThinkingStepData) => void) => () => void;
    onAgentChange: (callback: (data: { label: string } & TurnEnvelope) => void) => () => void;
  };

  // MCP API
  mcp: {
    getStatus: () => Promise<{ enabled: boolean; initialized: boolean; toolsCount: number }>;
    getServerCount: () => Promise<number>;
    toggle: (enabled: boolean) => Promise<void>;
    getServers: () => Promise<Array<{
      name: string;
      type: 'stdio' | 'http';
      enabled: boolean;
      toolCount: number;
      status: 'connected' | 'disconnected' | 'error';
    }>>;
    toggleServer: (serverName: string, enabled: boolean) => Promise<void>;
    getTools: () => Promise<Array<{ name: string; description: string; enabled: boolean }>>;
    toggleTool: (toolName: string) => Promise<void>;
  };

  // Browser Automation API
  browser: {
    initializeAgent: (config?: { headed?: boolean }) => Promise<{ success: boolean; error?: string }>;
    setMode: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
    getMode: () => Promise<{ success: boolean; enabled: boolean }>;
    getStatus: () => Promise<{ success: boolean; browserModeEnabled: boolean; browserAgentInitialized: boolean }>;
    getSessionStatus: () => Promise<{ success: boolean; active: boolean; sessionId?: string; url?: string }>;
    createSession: (config?: { headed?: boolean }) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
    closeSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    extractLinks: () => Promise<{ success: boolean; links?: string[]; error?: string }>;
    onProgress: (callback: (data: { sessionId: string; progress: unknown }) => void) => () => void;
    onChunk: (callback: (data: { sessionId: string; chunk: string }) => void) => () => void;
    onError: (callback: (data: { sessionId: string; error: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}