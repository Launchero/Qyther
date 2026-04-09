import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { langChainAgent, ChatSession } from '../services/langchain/agent';

export function registerChatHandlers(): void {
  // Initialize LangChain agent on first chat request
  ipcMain.handle('chat:initialize', async () => {
    try {
      await langChainAgent.initialize();
      return { success: true, ready: langChainAgent.isReady() };
    } catch (error) {
      console.error('[Chat IPC] Initialization error:', error);
      return { 
        success: false, 
        ready: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Send message and get streaming response
  ipcMain.handle('chat:sendMessage', async (
    event: IpcMainInvokeEvent,
    { content, sessionId }: { content: string; sessionId?: string }
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    try {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 💬 Chat: Processing message: "${content.slice(0, 50)}..."`);

      // Check for slash commands
      if (content === '/browser-close') {
        await langChainAgent.closeBrowserSession();
        return { 
          success: true, 
          response: 'Browser session closed. Enable browser mode and ask a question to start a new session.'
        };
      }

      // Switch to session if provided
      if (sessionId) {
        await langChainAgent.switchSession(sessionId);
      }

      let fullResponse = '';
      
      // Send message with streaming callback
      const response = await langChainAgent.sendMessage(content, (chunk: string) => {
        // Send chunks to renderer via webContents
        event.sender.send('chat:stream-chunk', { chunk, isComplete: false });
      });

      // Send completion signal
      event.sender.send('chat:stream-chunk', { chunk: '', isComplete: true });

      return { success: true, response };
    } catch (error) {
      console.error('[Chat IPC] Error sending message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Create new chat session
  ipcMain.handle('chat:createSession', async (
    _event: IpcMainInvokeEvent,
    title?: string
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    try {
      const sessionId = await langChainAgent.createSession(title);
      return { success: true, sessionId };
    } catch (error) {
      console.error('[Chat IPC] Error creating session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Get current session
  ipcMain.handle('chat:getCurrentSession', async (): Promise<ChatSession | null> => {
    return await langChainAgent.getCurrentSession();
  });

  // Get specific session
  ipcMain.handle('chat:getSession', async (
    _event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<ChatSession | null> => {
    return await langChainAgent.getSession(sessionId);
  });

  // List all sessions
  ipcMain.handle('chat:listSessions', async (): Promise<ChatSession[]> => {
    return await langChainAgent.listSessions();
  });

  // Switch to a session
  ipcMain.handle('chat:switchSession', async (
    _event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await langChainAgent.switchSession(sessionId);
      return { success: true };
    } catch (error) {
      console.error('[Chat IPC] Error switching session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Delete a session
  ipcMain.handle('chat:deleteSession', async (
    _event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await langChainAgent.deleteSession(sessionId);
      return { success: true };
    } catch (error) {
      console.error('[Chat IPC] Error deleting session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Clear chat history
  ipcMain.handle('chat:clearHistory', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await langChainAgent.clearHistory();
      return { success: true };
    } catch (error) {
      console.error('[Chat IPC] Error clearing history:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Check if chat is ready
  ipcMain.handle('chat:isReady', async (): Promise<boolean> => {
    return langChainAgent.isReady();
  });
}
