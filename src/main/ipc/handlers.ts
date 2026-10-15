import { ipcMain, app, shell, dialog as electronDialog } from 'electron';
import { hideMainWindow, setWindowMode, getWindowMode, toggleWindowMode, getMainWindow } from '../windows';
import { windowManager } from '../windowManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import { searchFiles, formatFileSize, formatDate, isEverythingRunning } from '../utils/esRunner';
import { getSystemInfo, getPlatform, getPlatformName, isWindows, isMacOS, isLinux } from '../utils/platform';
import { registerChatHandlers } from './chat-handlers';
import { registerMCPHandlers } from './mcp-handlers';
import { isCommandSafe } from './command-guard';
import { isSafeSearchQuery, isUsablePath } from './file-guard';
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

  // Both of these used to answer a failure with `'compact'`. That is not a neutral default: the
  // renderer lays the palette out for the mode it is told, so a swallowed error made main report an
  // ordinary read as a compact window while the real bounds were still expanded — and the caller
  // had no way to tell a lie from a fact. Both now re-throw, like `window:setMode` already did;
  // the one consumer (`useWindowMode`'s mount read) already catches and keeps its own state.
  ipcMain.handle('window:getMode', () => {
    try {
      const mode = getWindowMode();
      return mode;
    } catch (error) {
      log.error('Error in getMode:', error);
      throw error;
    }
  });

  ipcMain.handle('window:toggleMode', () => {
    try {
      return toggleWindowMode();
    } catch (error) {
      log.error('Error in toggleMode:', error);
      throw error;
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

  /**
   * The drag handle's per-frame height request. It used to write `Math.round(height)` straight into
   * `setBounds`, which made this the one channel that could move the window anywhere the renderer
   * named — past the work area, past the expanded ceiling, to `NaN`. The clamp is main's
   * (`windowManager.clampExpandedHeight`) and the reply carries the height actually applied, so the
   * drag can never drift from what the window really holds.
   */
  ipcMain.handle('window:resizeHeight', (_, height: number) => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) return { success: false, error: 'No palette window' };
      // The handle is only mounted in `expanded`; a resize while compact or custom would fight the
      // hard size lock those modes install, leaving bounds the lock then snaps back.
      if (getWindowMode() !== 'expanded') {
        log.warn('Ignored a resize request outside expanded mode');
        return { success: false, error: 'Only the expanded palette can be resized' };
      }
      const clamped = windowManager.clampExpandedHeight(height);
      if (clamped === null) {
        log.warn('Rejected a non-numeric resize height');
        return { success: false, error: 'height must be a finite number' };
      }
      const currentBounds = mainWindow.getBounds();
      mainWindow.setBounds({
        x: currentBounds.x,
        y: currentBounds.y,
        width: currentBounds.width,
        height: clamped,
      });
      return { success: true, height: clamped };
    } catch (error) {
      log.error('Error in resizeHeight:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
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

  /**
   * One animation frame of the page, used as the clock for the height tween. One-way `send`, not
   * `invoke`: the reply would be a promise allocated 60× a second for no reader, since what the
   * renderer is waiting for is the next `setBounds`, which it sees as its own resized height.
   * Takes no argument and can move nothing on its own — `windowManager` ignores it unless a tween
   * is in flight, so it is not a second, unvalidated way to resize the window.
   */
  ipcMain.on('window:animationFrame', () => {
    windowManager.onAnimationFrame();
  });

  // Command execution handler
  ipcMain.handle('command:execute', async (_, command: string): Promise<{ success: boolean; output?: string; error?: string }> => {
    if (!isCommandSafe(command)) {
      log.warn('Blocked command:execute attempt');
      return { success: false, error: 'Command not allowed for security reasons' };
    }
    try {
      // Both bounds are load-bearing, and this was the only `exec` in the tree carrying neither.
      // `exec` defaults to `timeout: 0`, so a command that never exits held the IPC call — and its
      // shell — open indefinitely; the 1 MB default buffer then failed a merely chatty command
      // with a truncation error instead of a result. These match the other two exec sites
      // (`utils/esRunner.ts`, `services/pi/toolbox.ts`).
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
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
      if (!isUsablePath(path)) {
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
    // This channel used to reach `shell.showItemInFolder` with no check at either layer, so the
    // renderer could name any path on any drive without main looking at it once.
    if (!isUsablePath(path)) {
      log.warn('Blocked file:revealInFolder with an unusable path');
      return;
    }
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
      // The metacharacter blocklist lived only in `preload.ts`, and preload is renderer-reachable:
      // invoking the channel directly shipped the raw string into an `es.exe` command line.
      if (!isSafeSearchQuery(query)) {
        log.warn('Blocked file:search with an unsafe query');
        return [];
      }

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

  // Everything application status handler
  ipcMain.handle('file:everything:status', async (): Promise<{ running: boolean; esExists: boolean; platformSupported: boolean }> => {
    try {
      const platformSupported = isWindows();
      if (!platformSupported) {
        return { running: false, esExists: false, platformSupported: false };
      }

      const esPath = require('../utils/esDownloader').getEsPath();
      const esExists = require('fs').existsSync(esPath);
      const running = esExists ? await isEverythingRunning() : false;

      return { running, esExists, platformSupported };
    } catch (error) {
      log.error('Error checking Everything status:', error);
      return { running: false, esExists: false, platformSupported: isWindows() };
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
  }): Promise<{ path?: string; cancelled?: boolean; error?: string }> => {
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
      return { error: error instanceof Error ? error.message : 'Dialog failed' };
    }
  });

  ipcMain.handle('dialog:openFolder', async (_, options?: { 
    defaultPath?: string 
  }): Promise<{ path?: string; cancelled?: boolean; error?: string }> => {
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
      return { error: error instanceof Error ? error.message : 'Dialog failed' };
    }
  });
}
