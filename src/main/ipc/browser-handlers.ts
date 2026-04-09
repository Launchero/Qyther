import { ipcMain } from 'electron';
import { statefulBrowserAgent, BrowserTaskProgress } from '../services/browser/stateful-browser-agent';
import { browserSessionManager } from '../services/browser/browser-session-manager';
import { langChainAgent } from '../services/langchain/agent';

export function registerBrowserHandlers(): void {
  // Initialize browser agent
  ipcMain.handle('browser:initialize', async (_, config?: { headed?: boolean }) => {
    try {
      await statefulBrowserAgent.initialize(config);
      return { 
        success: true,
        message: 'Browser agent initialized successfully',
      };
    } catch (error) {
      console.error('[BrowserHandlers] Initialization failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Create new browser session
  ipcMain.handle('browser:createSession', async (_, config?: { headed?: boolean }) => {
    try {
      const sessionId = await browserSessionManager.createSession(config);
      return { 
        success: true,
        sessionId,
      };
    } catch (error) {
      console.error('[BrowserHandlers] Create session failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Execute browser task with streaming
  ipcMain.handle('browser:executeTask', async (event, task: string, sessionId: string) => {
    try {
      if (!statefulBrowserAgent.isReady()) {
        throw new Error('Browser agent not initialized');
      }

      // Update session activity
      await browserSessionManager.updateSessionActivity(sessionId, {
        status: 'active',
      });

      let accumulatedResponse = '';

      // Progress callback to send updates to renderer
      const onProgress = (progress: BrowserTaskProgress) => {
        event.sender.send('browser:progress', {
          sessionId,
          progress,
        });
      };

      // Execute task and stream results
      const stream = await statefulBrowserAgent.executeTask(task, sessionId, onProgress);

      for await (const chunk of stream) {
        accumulatedResponse += chunk;
        
        // Send chunk to renderer for streaming display
        event.sender.send('browser:chunk', {
          sessionId,
          chunk,
        });
      }

      // Mark session as idle after completion
      await browserSessionManager.updateSessionActivity(sessionId, {
        status: 'idle',
      });

      return {
        success: true,
        response: accumulatedResponse,
      };
    } catch (error) {
      console.error('[BrowserHandlers] Execute task failed:', error);
      
      // Send error to renderer
      event.sender.send('browser:error', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Close browser session
  ipcMain.handle('browser:closeSession', async (_, sessionId?: string) => {
    try {
      // Use langChainAgent's close method which handles the current session
      await langChainAgent.closeBrowserSession();
      
      return {
        success: true,
        message: 'Session closed successfully',
      };
    } catch (error) {
      console.error('[BrowserHandlers] Close session failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Toggle browser mode
  ipcMain.handle('browser:setMode', async (_, enabled: boolean) => {
    try {
      langChainAgent.setBrowserModeEnabled(enabled);
      return { 
        success: true, 
        enabled,
      };
    } catch (error) {
      console.error('[BrowserHandlers] Set mode failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get browser mode status
  ipcMain.handle('browser:getMode', async () => {
    const enabled = langChainAgent.isBrowserModeEnabled();
    return {
      success: true,
      enabled,
    };
  });

  // Get session status
  ipcMain.handle('browser:getSessionStatus', async () => {
    const status = browserSessionManager.getSessionStatus();
    return {
      success: true,
      ...status,
    };
  });

  // Cleanup all browser resources
  ipcMain.handle('browser:cleanup', async () => {
    try {
      await statefulBrowserAgent.cleanup();
      await browserSessionManager.closeSession();
      
      return {
        success: true,
        message: 'Cleanup completed',
      };
    } catch (error) {
      console.error('[BrowserHandlers] Cleanup failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
  
  // Extract all links from current page
  ipcMain.handle('browser:extractLinks', async () => {
    try {
      const sessionId = langChainAgent.getCurrentBrowserSessionId();
      if (!sessionId) {
        return { success: false, error: 'No active browser session' };
      }
      
      const links = await statefulBrowserAgent.extractAllLinks(sessionId);
      return { success: true, links };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}
