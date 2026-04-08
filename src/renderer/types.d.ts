// Define types locally - cannot import from preload/main process
export type WindowMode = 'compact' | 'expanded' | 'custom';

// File Search Result Type
export interface FileSearchResult {
  path: string;
  name: string;
  size?: string;
  dateModified?: string;
  isFolder: boolean;
  relevanceScore?: number;
  category?: string;
}

// System Info Type
export interface SystemInfo {
  platform: 'win32' | 'darwin' | 'linux' | 'unknown';
  platformName: string;
  platformVersion: string;
  arch: string;
  hostname: string;
  release: string;
  totalMemory: string;
  freeMemory: string;
  cpuCount: number;
  cpuModel: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  appVersion: string;
  userDataPath: string;
}

// Define ElectronAPI type locally to avoid cross-context imports
export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getPlatformName: () => Promise<string>;
  getSystemInfo: () => Promise<SystemInfo>;
  isWindows: () => Promise<boolean>;
  isMacOS: () => Promise<boolean>;
  isLinux: () => Promise<boolean>;

  // Window control
  window: {
    hide: () => Promise<void>;
    setMode: (mode: WindowMode) => Promise<void>;
    getMode: () => Promise<WindowMode>;
    toggleMode: () => Promise<WindowMode>;
    setCustomDimensions: (width: number, height: number) => Promise<void>;
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
  };

  // Applications
  apps: {
    list: () => Promise<{ name: string; path: string }[]>;
  };

  // App lifecycle
  quit: () => Promise<void>;

  // Debug logging
  debug: {
    log: (message: string, data?: any) => Promise<void>;
  };

  // OpenCode SDK
  opencode: {
    initialize: (config?: { baseUrl?: string; enabled?: boolean }) => Promise<{ success: boolean; error?: string }>;
    getConfig: () => Promise<{ configured: boolean; hasApiKey: boolean; model: string }>;
    getConfiguration: () => Promise<any>;
    createSession: (title?: string) => Promise<{ id: string; title: string }>;
    getOrCreateSession: (key: string, title?: string) => Promise<string>;
    getSession: (sessionId: string) => Promise<any>;
    saveSession: (session: any) => Promise<{ success: boolean }>;
    addMessage: (sessionId: string, message: any) => Promise<any>;
    listSessions: (limit?: number) => Promise<Array<{ id: string; title: string; createdAt: string; updatedAt: string; messageCount: number }>>;
    forkSession: (params: { sessionId: string; fromMessageId?: string }) => Promise<string>;
    deleteSession: (sessionId: string) => Promise<{ success: boolean }>;
    getMCPServers: () => Promise<Array<{ id: string; name: string; status: string; icon: string }>>;
    getMCPServerStatus: (serverId: string) => Promise<any>;
    getAllMCPServerStatus: () => Promise<any[]>;
    getModels: () => Promise<Array<{ id: string; name: string; description?: string; isRecommended?: boolean }>>;
    sendMessage: (payload: { sessionId: string; messages: Array<{ role: string; content: string }>; model?: string }) => Promise<any>;
    getSessionMessages: (sessionId: string) => Promise<any[]>;
    summarizeSession: (sessionId: string) => Promise<string>;
    onStreamChunk: (callback: (chunk: { sessionId: string; messageId: string; delta: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
