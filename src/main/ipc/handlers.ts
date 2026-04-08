import { ipcMain, app, shell } from 'electron';
import { hideMainWindow, setWindowMode, getWindowMode, toggleWindowMode, getMainWindow } from '../windows';
import { windowManager } from '../windowManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import { searchFiles, formatFileSize, formatDate } from '../utils/esRunner';
import { getSystemInfo, getPlatform, getPlatformName, isWindows, isMacOS, isLinux } from '../utils/platform';
import {
  initializeOpenCode,
  getConfigStatus,
  getConfiguration,
  isOpenCodeInitialized,
} from '../opencode/config.js';
import {
  createSession,
  loadSession,
  saveSession,
  deleteSession,
  listSessions,
  getSessionHistory,
  forkSession,
  getOrCreateSession,
  addMessageToSession,
} from '../opencode/sessions.js';
import {
  loadMCPServers,
  getMCPServerList,
  getMCPServerStatus,
  getAllMCPServerStatus,
} from '../opencode/mcp.js';

const execAsync = promisify(exec);

export function registerIPCHandlers(): void {
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

  // ==================== OpenCode SDK Handlers ====================
  registerOpenCodeIPCHandlers();
}

function registerOpenCodeIPCHandlers(): void {

  // Initialize OpenCode
  ipcMain.handle('opencode:initialize', async (_, config?: { baseUrl?: string; enabled?: boolean }) => {
    console.log('[IPC] opencode:initialize called');
    try {
      const result = await initializeOpenCode(config);
      return result;
    } catch (error) {
      console.error('[IPC] opencode:initialize error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get configuration status
  ipcMain.handle('opencode:getConfig', async () => {
    console.log('[IPC] opencode:getConfig called');
    try {
      const status = await getConfigStatus();
      return status;
    } catch (error) {
      console.error('[IPC] opencode:getConfig error:', error);
      return { configured: false, hasApiKey: false, model: 'unknown' };
    }
  });

  // Get full configuration
  ipcMain.handle('opencode:getConfiguration', async () => {
    console.log('[IPC] opencode:getConfiguration called');
    try {
      return await getConfiguration();
    } catch (error) {
      console.error('[IPC] opencode:getConfiguration error:', error);
      throw error;
    }
  });

  // Create new session
  ipcMain.handle('opencode:createSession', async (_, title?: string) => {
    console.log('[IPC] opencode:createSession called:', title);
    try {
      const session = await createSession(title);
      return { id: session.id, title: session.title };
    } catch (error) {
      console.error('[IPC] opencode:createSession error:', error);
      throw error;
    }
  });

  // Get or create session
  ipcMain.handle('opencode:getOrCreateSession', async (_, key: string, title?: string) => {
    console.log('[IPC] opencode:getOrCreateSession called:', key);
    try {
      // Use key as session ID or create new if doesn't exist
      const session = await getOrCreateSession(key);
      return session.id;
    } catch (error) {
      console.error('[IPC] opencode:getOrCreateSession error:', error);
      // Fallback: create a new session
      const newSession = await createSession(title || key);
      return newSession.id;
    }
  });

  // Get session
  ipcMain.handle('opencode:getSession', async (_, sessionId: string) => {
    console.log('[IPC] opencode:getSession called:', sessionId);
    try {
      const session = await loadSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      return session;
    } catch (error) {
      console.error('[IPC] opencode:getSession error:', error);
      throw error;
    }
  });

  // Save session
  ipcMain.handle('opencode:saveSession', async (_, session: any) => {
    console.log('[IPC] opencode:saveSession called:', session.id);
    try {
      await saveSession(session);
      return { success: true };
    } catch (error) {
      console.error('[IPC] opencode:saveSession error:', error);
      throw error;
    }
  });

  // Add message to session
  ipcMain.handle('opencode:addMessage', async (_, sessionId: string, message: any) => {
    console.log('[IPC] opencode:addMessage called:', sessionId);
    try {
      const session = await addMessageToSession(sessionId, {
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
      });
      return session;
    } catch (error) {
      console.error('[IPC] opencode:addMessage error:', error);
      throw error;
    }
  });

  // List sessions (history)
  ipcMain.handle('opencode:listSessions', async (_, limit?: number) => {
    console.log('[IPC] opencode:listSessions called');
    try {
      return await getSessionHistory(limit);
    } catch (error) {
      console.error('[IPC] opencode:listSessions error:', error);
      return [];
    }
  });

  // Fork session
  ipcMain.handle('opencode:forkSession', async (_, { sessionId, fromMessageId }: { sessionId: string; fromMessageId?: string }) => {
    console.log('[IPC] opencode:forkSession called:', sessionId);
    try {
      const messageIndex = fromMessageId ? parseInt(fromMessageId) : undefined;
      const forkedSession = await forkSession(sessionId, messageIndex);
      if (!forkedSession) {
        throw new Error('Failed to fork session');
      }
      return forkedSession.id;
    } catch (error) {
      console.error('[IPC] opencode:forkSession error:', error);
      throw error;
    }
  });

  // Delete session
  ipcMain.handle('opencode:deleteSession', async (_, sessionId: string) => {
    console.log('[IPC] opencode:deleteSession called:', sessionId);
    try {
      await deleteSession(sessionId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] opencode:deleteSession error:', error);
      throw error;
    }
  });

  // Get MCP servers
  ipcMain.handle('opencode:getMCPServers', async () => {
    console.log('[IPC] opencode:getMCPServers called');
    try {
      return getMCPServerList();
    } catch (error) {
      console.error('[IPC] opencode:getMCPServers error:', error);
      return [];
    }
  });

  // Get MCP server status
  ipcMain.handle('opencode:getMCPServerStatus', async (_, serverId: string) => {
    console.log('[IPC] opencode:getMCPServerStatus called:', serverId);
    try {
      return getMCPServerStatus(serverId);
    } catch (error) {
      console.error('[IPC] opencode:getMCPServerStatus error:', error);
      return null;
    }
  });

  // Get all MCP server statuses
  ipcMain.handle('opencode:getAllMCPServerStatus', async () => {
    console.log('[IPC] opencode:getAllMCPServerStatus called');
    try {
      return getAllMCPServerStatus();
    } catch (error) {
      console.error('[IPC] opencode:getAllMCPServerStatus error:', error);
      return [];
    }
  });

  // Get available models
  ipcMain.handle('opencode:getModels', async () => {
    console.log('[IPC] opencode:getModels called');
    // Return available models - could be loaded from config
    return [
      { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship model', isRecommended: true },
      { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Fast GPT-4' },
      { id: 'google/gemini-2.0-pro', name: 'Gemini 2.0 Pro', description: 'Google best model' },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Google fast model' },
      { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: 'Best for coding tasks' },
      { id: 'ollama/llama3', name: 'Llama 3 (Ollama)', description: 'Local model' },
      { id: 'ollama/codellama', name: 'CodeLlama (Ollama)', description: 'Code-focused local model' },
    ];
  });

  // Send message with streaming support
  ipcMain.handle('opencode:sendMessage', async (event, payload: {
    sessionId: string;
    messages: Array<{ role: string; content: string }>;
    model?: string;
  }) => {
    console.log('[IPC] opencode:sendMessage called:', payload.sessionId);
    try {
      // Add user message to session
      const userMessage = payload.messages[payload.messages.length - 1];
      await addMessageToSession(payload.sessionId, {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: userMessage.content,
        timestamp: new Date().toISOString(),
      });

      // Get OpenCode client
      const { getOpenCodeClient } = await import('../opencode/client.js');
      let client;
      try {
        client = await getOpenCodeClient();
      } catch (clientError) {
        const errorMessage = clientError instanceof Error ? clientError.message : 'Failed to initialize OpenCode client';
        console.error('[IPC] OpenCode client error:', errorMessage);
        throw new Error(errorMessage);
      }

      // Subscribe to events FIRST (before sending prompt)
      const events = await client.event.subscribe();
      const webContents = event.sender;
      const assistantMessageId = `msg-${Date.now()}-assistant`;

      console.log('[IPC] Sending prompt to OpenCode...');

      // Let the server decide the model
      const modelOverride = undefined;
      console.log('[IPC] Using server default model');
      
      const result = await client.session.prompt({
        path: { id: payload.sessionId },
        body: {
          model: modelOverride,
          parts: payload.messages.map(m => ({ type: 'text' as const, text: m.content })),
        },
      });

      console.log('[IPC] Prompt sent, waiting for streaming response...');

      // Stream events back to renderer with timeout
      let fullContent = '';
      const streamTimeout = setTimeout(() => {
        console.log('[IPC] Stream timeout after 60 seconds');
      }, 60000);

      try {
        for await (const streamEvent of events.stream) {
          console.log('[IPC] Received stream event:', streamEvent.type);
          if (streamEvent.type === 'message.part.updated') {
            const delta = streamEvent.properties.delta;
            fullContent += delta;

            // Send chunk to renderer
            webContents.send('opencode:stream-chunk', {
              sessionId: payload.sessionId,
              messageId: assistantMessageId,
              delta,
            });
          }
        }
      } catch (streamError) {
        console.error('[IPC] Stream error:', streamError);
      } finally {
        clearTimeout(streamTimeout);
      }

      console.log('[IPC] Streaming complete, received', fullContent.length, 'characters');

      // Save assistant message to session
      await addMessageToSession(payload.sessionId, {
        id: assistantMessageId,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: {
          id: assistantMessageId,
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('[IPC] opencode:sendMessage error:', error);
      throw error;
    }
  });

  // Get session messages
  ipcMain.handle('opencode:getSessionMessages', async (_, sessionId: string) => {
    console.log('[IPC] opencode:getSessionMessages called:', sessionId);
    try {
      const session = await loadSession(sessionId);
      return session?.messages || [];
    } catch (error) {
      console.error('[IPC] opencode:getSessionMessages error:', error);
      return [];
    }
  });

  // Summarize session
  ipcMain.handle('opencode:summarizeSession', async (_, sessionId: string) => {
    console.log('[IPC] opencode:summarizeSession called:', sessionId);
    try {
      const session = await loadSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      // Generate a summary based on the first user message
      const firstUserMessage = session.messages.find((m: { role: string }) => m.role === 'user');
      return firstUserMessage?.content.slice(0, 50) || 'New Chat';
    } catch (error) {
      console.error('[IPC] opencode:summarizeSession error:', error);
      throw error;
    }
  });

  console.log('[IPC] OpenCode handlers registered');
}
