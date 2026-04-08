import { contextBridge, ipcRenderer } from 'electron';

// #region agent log
const logToServer = (message: string, data: any = {}, hypothesisId: string = 'A') => {
  fetch('http://127.0.0.1:7593/ingest/711a8501-3d31-485b-8bdd-ee2778fa3e69',{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0162f'},
    body:JSON.stringify({
      sessionId:'e0162f',
      id:`preload_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
      timestamp:Date.now(),
      location:'preload.ts:1',
      message,
      data,
      runId:'initial',
      hypothesisId
    })
  }).catch(()=>{});
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
  },
  
  // Command execution
  command: {
    execute: (command: string) => {
      // Validate command before sending
      if (!command || typeof command !== 'string') {
        throw new Error('Valid command is required');
      }
      // Basic security: prevent dangerous commands
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
  
  // File handling (ENHANCED with options parameter - backward compatible)
  file: {
    open: (path: string) => {
      if (!path || typeof path !== 'string') {
        throw new Error('Valid path is required');
      }
      return ipcRenderer.invoke('file:open', path);
    },
    search: (query: string, options?: {
      maxResults?: number;
      excludeHidden?: boolean;
      excludeSystem?: boolean;
      includeMetadata?: boolean;
    }) => {
      // EXISTING validation - DO NOT MODIFY (backward compatibility)
      if (!query || typeof query !== 'string') {
        throw new Error('Valid search query is required');
      }
      // Basic security: prevent command injection
      const dangerousPatterns = ['&&', '||', ';', '|', '&', '>', '<', '^'];
      for (const pattern of dangerousPatterns) {
        if (query.includes(pattern)) {
          throw new Error('Invalid characters in search query');
        }
      }
      
      // NEW enhanced validation - ADDITIONAL only (backward compatible)
      if (query.length > 500) {
        throw new Error('Search query too long (max 500 characters)');
      }
      if (options && typeof options !== 'object') {
        throw new Error('Options must be an object');
      }
      
      return ipcRenderer.invoke('file:search', query, options);
    },
  },
  
  // Applications
  apps: {
    list: () => ipcRenderer.invoke('apps:list'),
  },
  
  // App lifecycle
  quit: () => ipcRenderer.invoke('app:quit'),
  
  // Debug logging
  debug: {
    log: (message: string, data?: any) => ipcRenderer.invoke('debug:log', message, data),
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
