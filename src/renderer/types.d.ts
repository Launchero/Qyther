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
  
  // Chat API
  chat: {
    initialize: () => Promise<{ success: boolean; ready: boolean; error?: string }>;
    sendMessage: (content: string, sessionId?: string) => Promise<{ success: boolean; response?: string; error?: string }>;
    createSession: (title?: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
    getCurrentSession: () => Promise<any>;
    getSession: (sessionId: string) => Promise<any>;
    listSessions: () => Promise<any[]>;
    switchSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    clearHistory: () => Promise<{ success: boolean; error?: string }>;
    isReady: () => Promise<boolean>;
    onStreamChunk: (callback: (data: { chunk: string; isComplete: boolean }) => void) => () => void;
  };
  
  // MCP API
  mcp: {
    getStatus: () => Promise<{ enabled: boolean; initialized: boolean; toolsCount: number }>;
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
    onProgress: (callback: (data: { sessionId: string; progress: any }) => void) => () => void;
    onChunk: (callback: (data: { sessionId: string; chunk: string }) => void) => () => void;
    onError: (callback: (data: { sessionId: string; error: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
