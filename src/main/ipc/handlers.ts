import { ipcMain, app, shell } from 'electron';
import { hideMainWindow, setWindowMode, getWindowMode, toggleWindowMode, getMainWindow } from '../windows';
import { windowManager } from '../windowManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import { searchFiles, formatFileSize, formatDate } from '../utils/esRunner';
import { getSystemInfo, getPlatform, getPlatformName, isWindows, isMacOS, isLinux } from '../utils/platform';
import { registerChatHandlers } from './chat-handlers';
import { registerMCPHandlers } from './mcp-handlers';

const execAsync = promisify(exec);

export function registerIPCHandlers(): void {
  // Register chat handlers
  registerChatHandlers();
  // Register MCP handlers
  registerMCPHandlers();
  
  // App info handlers
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:platform', () => {
    return getPlatform();
  });

  ipcMain.handle('app:platformName', () => {
    return getPlatformName();
  });

  ipcMain.handle('app:systemInfo', () => {
    return getSystemInfo();
  });

  ipcMain.handle('app:isWindows', () => {
    return isWindows();
  });

  ipcMain.handle('app:isMacOS', () => {
    return isMacOS();
  });

  ipcMain.handle('app:isLinux', () => {
    return isLinux();
  });

  // Window control handlers
  ipcMain.handle('window:hide', () => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 👁️  IPC: Hiding window`);
    hideMainWindow();
  });

  ipcMain.handle('window:setMode', (_, mode: import('../windowManager').WindowMode) => {
    try {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 📡 IPC: Setting window mode to ${mode}`);
      setWindowMode(mode);
      return mode;
    } catch (error) {
      console.error('[IPC] Error in setMode:', error);
      throw error;
    }
  });

  ipcMain.handle('window:getMode', () => {
    try {
      const mode = getWindowMode();
      // Removed verbose logging - called frequently by renderer polling
      return mode;
    } catch (error) {
      console.error('[IPC] Error in getMode:', error);
      return 'compact'; // Default fallback
    }
  });

  ipcMain.handle('window:toggleMode', () => {
    try {
      return toggleWindowMode();
    } catch (error) {
      console.error('[IPC] Error in toggleMode:', error);
      return 'compact';
    }
  });

  ipcMain.handle('window:setCustomDimensions', (_, width: number, height: number) => {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        windowManager.setCustomDimensions(width, height, mainWindow);
      } else {
        console.warn('[IPC] setCustomDimensions: mainWindow is null');
      }
    } catch (error) {
      console.error('[IPC] Error in setCustomDimensions:', error);
    }
  });

  // Command execution handler
  ipcMain.handle('command:execute', async (_, command: string): Promise<{ success: boolean; output?: string; error?: string }> => {
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        return { success: false, error: stderr };
      }
      return { success: true, output: stdout };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  });

  // Open URL handler
  ipcMain.handle('url:open', async (_, url: string): Promise<void> => {
    await shell.openExternal(url);
  });

  // Open file/folder handler
  ipcMain.handle('file:open', async (_, path: string): Promise<void> => {
    await shell.openPath(path);
  });

  // List applications (platform-specific)
  ipcMain.handle('apps:list', async (): Promise<Array<{ name: string; path: string; icon?: string }>> => {
    const apps: Array<{ name: string; path: string; icon?: string }> = [];

    if (isWindows()) {
      // Windows: Get programs from Start Menu
      try {
        const startMenuPath = process.env.APPDATA || '';
        const programsPath = `${startMenuPath}\\Microsoft\\Windows\\Start Menu\\Programs`;
        
        const { stdout } = await execAsync(`dir /b "${programsPath}"`);
        const items = stdout.split('\r\n').filter(line => line.trim());
        
        for (const item of items.slice(0, 50)) { // Limit to 50 apps
          if (item.endsWith('.lnk') || item.endsWith('.exe')) {
            apps.push({
              name: item.replace(/\.(lnk|exe)$/, ''),
              path: `${programsPath}\\${item}`,
            });
          }
        }
      } catch (error) {
        console.error('Error listing Windows apps:', error);
      }
    } else if (isMacOS()) {
      // macOS: Get apps from Applications folder
      try {
        const { stdout } = await execAsync('ls /Applications | grep ".app$"');
        const appNames = stdout.split('\n').filter(line => line.trim());
        
        for (const appName of appNames.slice(0, 50)) { // Limit to 50 apps
          apps.push({
            name: appName.replace('.app', ''),
            path: `/Applications/${appName}`,
          });
        }
      } catch (error) {
        console.error('Error listing macOS apps:', error);
      }
    } else if (isLinux()) {
      // Linux: Get .desktop files
      try {
        const { stdout } = await execAsync('ls /usr/share/applications/*.desktop 2>/dev/null | head -50');
        const desktopFiles = stdout.split('\n').filter(line => line.trim());
        
        for (const file of desktopFiles) {
          const appName = file.split('/').pop()?.replace('.desktop', '') || 'Unknown';
          apps.push({
            name: appName,
            path: file,
          });
        }
      } catch (error) {
        console.error('Error listing Linux apps:', error);
      }
    }

    return apps;
  });

  // Quit app handler
  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  // File search handler (ENHANCED with options parameter - backward compatible)
  ipcMain.handle('file:search', async (
    event,
    query: string,
    options?: {
      maxResults?: number;
      excludeHidden?: boolean;
      excludeSystem?: boolean;
      includeMetadata?: boolean;
    }
  ): Promise<Array<{
    path: string;
    name: string;
    size?: string;
    dateModified?: string;
    isFolder: boolean;
    relevanceScore?: number;
    category?: string;
  }>> => {
    try {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 🔍 IPC: Searching files for query: "${query}"`);
      
      // Only available on Windows
      if (!isWindows()) {
        console.warn('[IPC] File search only available on Windows');
        return [];
      }
      
      // Use new searchFiles signature with options (backward compatible)
      const results = await searchFiles(query, {
        maxResults: options?.maxResults || 50,
        excludeHidden: options?.excludeHidden ?? true,
        excludeSystem: options?.excludeSystem ?? true,
        includeMetadata: options?.includeMetadata ?? true,
      });
      
      // Format results for renderer (include new optional fields)
      return results.map(result => ({
        path: result.path,
        name: result.name,
        size: formatFileSize(result.size),
        dateModified: formatDate(result.dateModified),
        isFolder: result.isFolder,
        // NEW optional fields (backward compatible)
        relevanceScore: result.relevanceScore,
        category: result.category,
      }));
    } catch (error) {
      console.error('[IPC] File search error:', error);
      throw error;
    }
  });

  // Debug log handler - receives logs from renderer process
  ipcMain.handle('debug:log', (event, message: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 📊 ${message}`, data ? JSON.stringify(data, null, 2) : '');
  });
}
