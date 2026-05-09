import { ipcMain, app, shell, dialog as electronDialog } from 'electron';
import { hideMainWindow, setWindowMode, getWindowMode, toggleWindowMode, getMainWindow } from '../windows';
import { windowManager } from '../windowManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import { searchFiles, formatFileSize, formatDate } from '../utils/esRunner';
import { getSystemInfo, getPlatform, getPlatformName, isWindows, isMacOS, isLinux } from '../utils/platform';
import { registerChatHandlers } from './chat-handlers';
import { registerMCPHandlers } from './mcp-handlers';
import { createLogger } from '../utils/logger';

const execAsync = promisify(exec);
const log = createLogger('IPC');

export function registerIPCHandlers(): void {
  registerChatHandlers();
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
    log.info('Hiding window');
    hideMainWindow();
  });

  ipcMain.handle('window:setMode', (_, mode: import('../windowManager').WindowMode) => {
    try {
      log.info('Setting window mode to', mode);
      setWindowMode(mode);
      return mode;
    } catch (error) {
      log.error('Error in setMode:', error);
      throw error;
    }
  });

  ipcMain.handle('window:getMode', () => {
    try {
      const mode = getWindowMode();
      return mode;
    } catch (error) {
      log.error('Error in getMode:', error);
      return 'compact';
    }
  });

  ipcMain.handle('window:toggleMode', () => {
    try {
      return toggleWindowMode();
    } catch (error) {
      log.error('Error in toggleMode:', error);
      return 'compact';
    }
  });

  ipcMain.handle('window:setCustomDimensions', (_, width: number, height: number) => {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        windowManager.setCustomDimensions(width, height, mainWindow);
      } else {
        log.warn('setCustomDimensions: mainWindow is null');
      }
    } catch (error) {
      log.error('Error in setCustomDimensions:', error);
    }
  });

  ipcMain.handle('window:resizeHeight', (_, height: number) => {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        const currentBounds = mainWindow.getBounds();
        mainWindow.setBounds({
          x: currentBounds.x,
          y: currentBounds.y,
          width: currentBounds.width,
          height: Math.round(height),
        });
      }
    } catch (error) {
      log.error('Error in resizeHeight:', error);
    }
  });

  ipcMain.handle('window:getHeight', () => {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        return mainWindow.getBounds().height;
      }
      return 600;
    } catch (error) {
      log.error('Error in getHeight:', error);
      return 600;
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

  // Open URL handler - validates URL protocol to prevent arbitrary protocol handlers
  ipcMain.handle('url:open', async (_, url: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        log.warn('Blocked URL with invalid protocol:', parsed.protocol);
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch {
      log.error('Invalid URL:', url);
      return { success: false, error: 'Invalid URL format' };
    }
  });

  // Open file/folder handler - validates path to prevent arbitrary file access
  ipcMain.handle('file:open', async (_, path: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!path || typeof path !== 'string' || path.length > 1000) {
        return { success: false, error: 'Invalid path' };
      }
      // Reject paths with known dangerous patterns
      if (path.includes('\\\\') && !path.startsWith('\\\\')) {
        return { success: false, error: 'Invalid path' };
      }
      const result = await shell.openPath(path);
      if (result) {
        log.warn('shell.openPath returned error:', result);
        return { success: false, error: result };
      }
      return { success: true };
    } catch {
      log.error('Failed to open path:', path);
      return { success: false, error: 'Failed to open path' };
    }
  });

  // Reveal file in folder handler
  ipcMain.handle('file:revealInFolder', async (_, path: string): Promise<void> => {
    shell.showItemInFolder(path);
  });

  // List applications (platform-specific)
  ipcMain.handle('apps:list', async (): Promise<Array<{ name: string; path: string; icon?: string }>> => {
    const apps: Array<{ name: string; path: string; icon?: string }> = [];

    if (isWindows()) {
      // Windows: Get programs from both Start Menu locations
      const startMenuPaths = [
        process.env.APPDATA ? `${process.env.APPDATA}\\Microsoft\\Windows\\Start Menu\\Programs` : '',
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
      ].filter(Boolean);
      
      try {
        for (const programsPath of startMenuPaths) {
          try {
            const { stdout } = await execAsync(`dir /b "${programsPath}"`);
            const items = stdout.split('\r\n').filter(line => line.trim());
            
            for (const item of items.slice(0, 50)) {
              if (item.endsWith('.lnk') || item.endsWith('.exe')) {
                const existing = apps.find(a => a.name === item.replace(/\.(lnk|exe)$/, ''));
                if (!existing) {
                  apps.push({
                    name: item.replace(/\.(lnk|exe)$/, ''),
                    path: `${programsPath}\\${item}`,
                  });
                }
              }
            }
          } catch {
            // Skip paths that don't exist
          }
        }
      } catch (error) {
        log.error('Error listing Windows apps:', error);
      }
    } else if (isMacOS()) {
      try {
        const { stdout } = await execAsync('ls /Applications | grep ".app$"');
        const appNames = stdout.split('\n').filter(line => line.trim());
        
        for (const appName of appNames.slice(0, 50)) {
          apps.push({
            name: appName.replace('.app', ''),
            path: `/Applications/${appName}`,
          });
        }
      } catch (error) {
        log.error('Error listing macOS apps:', error);
      }
    } else if (isLinux()) {
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
        log.error('Error listing Linux apps:', error);
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
      log.debug('Searching files for query:', query);
      
      // Only available on Windows
      if (!isWindows()) {
        log.warn('File search only available on Windows');
        return [];
      }
      
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
      log.error('File search error:', error);
      throw error;
    }
  });

  // Debug log handler - receives logs from renderer process
  ipcMain.handle('debug:log', (event, message: string, data?: unknown) => {
    log.debug(message, data ? JSON.stringify(data, null, 2) : '');
  });

  // Dialog handlers
  ipcMain.handle('dialog:openFile', async (_, options?: { 
    defaultPath?: string; 
    filters?: Array<{ name: string; extensions: string[] }> 
  }): Promise<{ path?: string; cancelled?: boolean }> => {
    try {
      const mainWindow = getMainWindow();
      const result = await electronDialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        defaultPath: options?.defaultPath,
        filters: options?.filters,
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        return { cancelled: true };
      }
      
      return { path: result.filePaths[0] };
    } catch (error) {
      log.error('Dialog openFile error:', error);
      return { cancelled: true };
    }
  });

  ipcMain.handle('dialog:openFolder', async (_, options?: { 
    defaultPath?: string 
  }): Promise<{ path?: string; cancelled?: boolean }> => {
    try {
      const mainWindow = getMainWindow();
      const result = await electronDialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory'],
        defaultPath: options?.defaultPath,
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        return { cancelled: true };
      }
      
      return { path: result.filePaths[0] };
    } catch (error) {
      log.error('Dialog openFolder error:', error);
      return { cancelled: true };
    }
  });
}
