import { contextBridge, ipcRenderer } from 'electron';
import type { TurnEnvelope } from '../shared/ipc/turn';
import type { ChatSessionSummary } from '../shared/ipc/sessions';
import type { SettingsSnapshot, SettingsPatch } from '../shared/ipc/settings';

// #region agent log
const PRELOAD_LOGGING_ENABLED = process.env.LOG_PRELOAD === 'true';
// Remote logging endpoint must be explicitly configured - disabled by default for security
const PRELOAD_LOG_ENDPOINT = process.env.LOG_PRELOAD_ENDPOINT || '';
const PRELOAD_SESSION_ID = process.env.LOG_PRELOAD_SESSION_ID || '';

const logToServer = (message: string, data: unknown = {}, hypothesisId: string = 'A') => {
  if (!PRELOAD_LOGGING_ENABLED || !PRELOAD_LOG_ENDPOINT) return;

  // Validate endpoint is localhost to prevent data exfiltration
  try {
    const parsed = new URL(PRELOAD_LOG_ENDPOINT);
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      return; // Reject non-local endpoints
    }
  } catch {
    return; // Invalid URL
  }

  fetch(PRELOAD_LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': PRELOAD_SESSION_ID },
    body: JSON.stringify({
      sessionId: PRELOAD_SESSION_ID,
      id: `preload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      location: 'preload.ts:1',
      message,
      data,
      runId: 'initial',
      hypothesisId,
    }),
  }).catch(() => {
    // Silently ignore network errors - preload should not fail on logging issues
  });
};
// #endregion

logToServer('Preload script starting', { platform: process.platform, versions: process.versions }, 'A');

// WindowMode defined locally - cannot import from main process
type WindowMode = 'compact' | 'expanded' | 'custom';

// Listen for window shown event and notify renderer to focus search
ipcRenderer.on('window:shown', () => {
  logToServer('window:shown event received', {}, 'A');
  // Dispatch a custom event that renderer can listen to
  window.dispatchEvent(new CustomEvent('electron-window-shown'));
});

// Listen for window will-hide event so renderer can store active element
ipcRenderer.on('window:will-hide', () => {
  window.dispatchEvent(new CustomEvent('electron-window-will-hide'));
});

// Listen for window mode change event from main process
ipcRenderer.on('window:modeChanged', (_event, mode: WindowMode) => {
  window.dispatchEvent(new CustomEvent('electron-window-mode-changed', { detail: mode }));
});

// The geometry behind `modeChanged` only holds when the height tween finishes. Main measures it
// and sends this afterwards, so anything that must wait for the window (the harness, an
// autoscroll, a focus move) can wait on a fact instead of polling innerHeight.
ipcRenderer.on('window:modeSettled', (_event, detail: { mode: WindowMode; height: number }) => {
  window.dispatchEvent(new CustomEvent('electron-window-mode-settled', { detail }));
});

// Listen for screenshot capture requests from main process
ipcRenderer.on('desktop:screenshot:capture', async (_event, reqId: string) => {
  try {
    const { desktopCapturer } = await import('electron');
    const width = window.screen.width;
    const height = window.screen.height;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });
    if (sources.length === 0) {
      throw new Error('No screen sources available');
    }
    const result = sources[0].thumbnail.toDataURL();
    ipcRenderer.send('desktop:screenshot:result', reqId, result);
  } catch (error) {
    ipcRenderer.send('desktop:screenshot:error', reqId, error instanceof Error ? error.message : 'Unknown error');
  }
});

// IPC message types for chat stream events
interface StreamMetrics {
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  durationMs: number;
  model: string;
}

interface StreamThinkingStep {
  type: string;
  step: string;
  status: string;
  detail: string;
  data?: unknown;
  update?: boolean;
}

interface StreamChunkData extends TurnEnvelope {
  chunk: string;
  isComplete: boolean;
  metrics?: StreamMetrics;
  thinkingSteps?: StreamThinkingStep[];
  uiPayloads?: UIPayloadForRenderer[];
  sources?: SourceItem[];
}

interface UIPayloadForRenderer {
  type: string;
  title: string;
  data: Record<string, unknown>;
  node: string;
}

interface SourceItem {
  url: string;
  title: string;
  excerpt: string;
}

interface ThinkingStepData extends TurnEnvelope {
  type: string;
  step: string;
  status: string;
  detail: string;
  data?: unknown;
  update?: boolean;
}

interface BrowserProgressData {
  sessionId: string;
  progress: {
    step: number;
    maxSteps: number;
    status: 'navigating' | 'clicking' | 'typing' | 'extracting' | 'complete' | 'error';
    url?: string;
    message: string;
  };
}

// Define strict API surface for renderer
export const electronAPI = {
  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  getPlatformName: () => ipcRenderer.invoke('app:platformName'),
  getSystemInfo: () => ipcRenderer.invoke('app:systemInfo'),
  isWindows: () => ipcRenderer.invoke('app:isWindows'),
  isMacOS: () => ipcRenderer.invoke('app:isMacOS'),
  isLinux: () => ipcRenderer.invoke('app:isLinux'),

  // Window control
  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    setMode: (mode: WindowMode) => ipcRenderer.invoke('window:setMode', mode),
    getMode: () => ipcRenderer.invoke('window:getMode'),
    toggleMode: () => ipcRenderer.invoke('window:toggleMode'),
    setCustomDimensions: (width: number, height: number) => ipcRenderer.invoke('window:setCustomDimensions', width, height),
    resizeHeight: (height: number) => ipcRenderer.invoke('window:resizeHeight', height),
    getHeight: () => ipcRenderer.invoke('window:getHeight'),
    // A page frame, offered as the clock for the window height tween. See `window:animationFrame`.
    animationFrame: () => ipcRenderer.send('window:animationFrame'),
  },

  // Command execution
  command: {
    execute: (command: string) => {
      if (!command || typeof command !== 'string') {
        throw new Error('Valid command is required');
      }
      const dangerousPatterns = ['rm -rf', 'del /s', 'format', 'shutdown'];
      for (const pattern of dangerousPatterns) {
        if (command.toLowerCase().includes(pattern)) {
          throw new Error('Command not allowed for security reasons');
        }
      }
      return ipcRenderer.invoke('command:execute', command);
    },
  },

  // URL handling
  url: {
    open: (url: string) => {
      if (!url || !url.startsWith('http')) {
        throw new Error('Valid URL is required');
      }
      return ipcRenderer.invoke('url:open', url);
    },
  },

  // File handling
  file: {
    open: (path: string) => {
      if (!path || typeof path !== 'string') {
        throw new Error('Valid path is required');
      }
      return ipcRenderer.invoke('file:open', path);
    },
    revealInFolder: (path: string) => {
      if (!path || typeof path !== 'string') {
        throw new Error('Valid path is required');
      }
      return ipcRenderer.invoke('file:revealInFolder', path);
    },
    search: (query: string, options?: {
      maxResults?: number;
      excludeHidden?: boolean;
      excludeSystem?: boolean;
      includeMetadata?: boolean;
    }) => {
      if (!query || typeof query !== 'string') {
        throw new Error('Valid search query is required');
      }
      const dangerousPatterns = ['&&', '||', ';', '|', '&', '>', '<', '^'];
      for (const pattern of dangerousPatterns) {
        if (query.includes(pattern)) {
          throw new Error('Invalid characters in search query');
        }
      }

      if (query.length > 500) {
        throw new Error('Search query too long (max 500 characters)');
      }
      if (options && typeof options !== 'object') {
        throw new Error('Options must be an object');
      }

      return ipcRenderer.invoke('file:search', query, options);
    },
    getEverythingStatus: () => ipcRenderer.invoke('file:everything:status'),
  },

  // Applications
  apps: {
    list: () => ipcRenderer.invoke('apps:list'),
  },

  // App lifecycle
  quit: () => ipcRenderer.invoke('app:quit'),

  // Debug logging
  debug: {
    log: (message: string, data?: unknown) => ipcRenderer.invoke('debug:log', message, data),
  },

  // Chat API
  chat: {
    initialize: () => ipcRenderer.invoke('chat:initialize'),
    sendStreamMessage: (content: string, sessionId?: string, attachmentPaths?: Array<{ name: string; path: string; type: string }>) =>
      ipcRenderer.invoke('chat:sendStreamMessage', { content, sessionId, attachmentPaths }),
    createSession: (title?: string) => ipcRenderer.invoke('chat:createSession', title),
    getCurrentSession: () => ipcRenderer.invoke('chat:getCurrentSession'),
    getSession: (sessionId: string) => ipcRenderer.invoke('chat:getSession', sessionId),
    listSessions: () => ipcRenderer.invoke('chat:listSessions'),
    switchSession: (sessionId: string) => ipcRenderer.invoke('chat:switchSession', sessionId),
    deleteSession: (sessionId: string) => ipcRenderer.invoke('chat:deleteSession', sessionId),
    clearHistory: () => ipcRenderer.invoke('chat:clearHistory'),
    isReady: () => ipcRenderer.invoke('chat:isReady'),
    cancelTurn: (threadId: string) => ipcRenderer.invoke('chat:cancelTurn', { threadId }),
    onTurnStarted: (callback: (data: TurnEnvelope & { threadId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: TurnEnvelope & { threadId: string }) => callback(data);
      ipcRenderer.on('chat:turn-started', handler);
      return () => {
        ipcRenderer.removeListener('chat:turn-started', handler);
      };
    },
    onSessionsChanged: (callback: (sessions: ChatSessionSummary[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessions: ChatSessionSummary[]) => callback(sessions);
      ipcRenderer.on('chat:sessions-changed', handler);
      return () => {
        ipcRenderer.removeListener('chat:sessions-changed', handler);
      };
    },
    onStreamChunk: (callback: (data: StreamChunkData) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: StreamChunkData) => callback(data);
      ipcRenderer.on('chat:stream-chunk', handler);
      return () => {
        ipcRenderer.removeListener('chat:stream-chunk', handler);
      };
    },
    onThinkingStep: (callback: (data: ThinkingStepData) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: ThinkingStepData) => callback(data);
      ipcRenderer.on('chat:thinking-step', handler);
      return () => {
        ipcRenderer.removeListener('chat:thinking-step', handler);
      };
    },
    onAgentChange: (callback: (data: { label: string } & TurnEnvelope) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { label: string } & TurnEnvelope) => callback(data);
      ipcRenderer.on('chat:agent-change', handler);
      return () => {
        ipcRenderer.removeListener('chat:agent-change', handler);
      };
    },
  },

  // Browser Automation API
  browser: {
    initializeAgent: (config?: { headed?: boolean }) => ipcRenderer.invoke('browser:initializeAgent', config),
    setMode: (enabled: boolean) => ipcRenderer.invoke('browser:setMode', enabled),
    getMode: () => ipcRenderer.invoke('browser:getMode'),
    getStatus: () => ipcRenderer.invoke('browser:getStatus'),
    getSessionStatus: () => ipcRenderer.invoke('browser:getSessionStatus'),
    createSession: (config?: { headed?: boolean }) => ipcRenderer.invoke('browser:createSession', config),
    closeSession: (sessionId: string) => ipcRenderer.invoke('browser:closeSession', sessionId),
    extractLinks: () => ipcRenderer.invoke('browser:extractLinks'),
    onProgress: (callback: (data: BrowserProgressData) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: BrowserProgressData) => callback(data);
      ipcRenderer.on('browser:progress', handler);
      return () => {
        ipcRenderer.removeListener('browser:progress', handler);
      };
    },
    onChunk: (callback: (data: { sessionId: string; chunk: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; chunk: string }) => callback(data);
      ipcRenderer.on('browser:chunk', handler);
      return () => {
        ipcRenderer.removeListener('browser:chunk', handler);
      };
    },
    onError: (callback: (data: { sessionId: string; error: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; error: string }) => callback(data);
      ipcRenderer.on('browser:error', handler);
      return () => {
        ipcRenderer.removeListener('browser:error', handler);
      };
    },
  },

  // MCP API
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:getStatus'),
    getServerCount: () => ipcRenderer.invoke('mcp:getServerCount'),
    toggle: (enabled: boolean) => ipcRenderer.invoke('mcp:toggle', enabled),
    getServers: () => ipcRenderer.invoke('mcp:getServers'),
    toggleServer: (serverName: string, enabled: boolean) =>
      ipcRenderer.invoke('mcp:toggleServer', serverName, enabled),
    getTools: () => ipcRenderer.invoke('mcp:getTools'),
    toggleTool: (toolName: string) => ipcRenderer.invoke('mcp:toggleTool', toolName),
  },

  // Dialog API
  dialog: {
    openFile: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke('dialog:openFile', options),
    openFolder: (options?: { defaultPath?: string }) =>
      ipcRenderer.invoke('dialog:openFolder', options),
  },

  // API Config (buyer-provided API keys)
  apiConfig: {
    save: (config: { apiKey: string; baseUrl: string; model: string }) => ipcRenderer.invoke('api-config:save', config),
    load: () => ipcRenderer.invoke('api-config:load'),
    delete: () => ipcRenderer.invoke('api-config:delete'),
    test: (config: { apiKey: string; baseUrl: string; model: string }) => ipcRenderer.invoke('api-config:test', config),
  },

  // Settings window + main-owned appearance. `settings:changed` is a main->renderer push, so the
  // subscriber gets an unsubscribe function (same shape as `chat`/`browser`/`mcp` listeners) and
  // MUST store and call it — the settings and palette windows each subscribe once on mount.
  settings: {
    open: () => ipcRenderer.invoke('settings:open'),
    get: () => ipcRenderer.invoke('settings:get') as Promise<SettingsSnapshot>,
    set: (patch: SettingsPatch) => ipcRenderer.invoke('settings:set', patch) as Promise<SettingsSnapshot>,
    onChanged: (callback: (snapshot: SettingsSnapshot) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: SettingsSnapshot) => callback(snapshot);
      ipcRenderer.on('settings:changed', handler);
      return () => {
        ipcRenderer.removeListener('settings:changed', handler);
      };
    },
  },
};

// Expose with type safety
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
logToServer('contextBridge.exposeInMainWorld called', {
  electronAPI_keys: Object.keys(electronAPI),
  has_window: !!electronAPI.window,
  has_apps: !!electronAPI.apps
}, 'A');

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI;
