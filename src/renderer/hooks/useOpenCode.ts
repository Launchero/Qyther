import { useState, useEffect, useCallback } from 'react';

/**
 * OpenCode React hook
 * Provides OpenCode SDK functionality to React components
 */
export function useOpenCode() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Check initialization status on mount
  useEffect(() => {
    window.electronAPI.opencode.getConfig().then((config) => {
      setIsInitialized(config.configured);
      console.log('[useOpenCode] Initialization status:', config);
    }).catch((err) => {
      console.error('[useOpenCode] Error checking config:', err);
      setError('Failed to check OpenCode configuration');
    });
  }, []);

  /**
   * Initialize OpenCode client
   */
  const initialize = useCallback(async (config: { baseUrl: string; enabled: boolean }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.opencode.initialize(config);
      if (result.success) {
        setIsInitialized(true);
        console.log('[useOpenCode] Initialized successfully');
      } else {
        throw new Error(result.error || 'Initialization failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize';
      setError(errorMessage);
      console.error('[useOpenCode] Initialization error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new session
   */
  const createSession = useCallback(async (title?: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await window.electronAPI.opencode.createSession(title);
      setSessionId(session.id);
      console.log('[useOpenCode] Session created:', session.id);
      return session.id;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create session';
      setError(errorMessage);
      console.error('[useOpenCode] Create session error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get or create session from cache
   */
  const getOrCreateSession = useCallback(async (key: string, title?: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const sessionId = await window.electronAPI.opencode.getOrCreateSession(key, title);
      setSessionId(sessionId);
      console.log('[useOpenCode] Session ready:', sessionId);
      return sessionId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get or create session';
      setError(errorMessage);
      console.error('[useOpenCode] Get or create session error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Send a message to a session
   */
  const sendMessage = useCallback(async (
    sessionId: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<any> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.opencode.sendMessage({
        sessionId,
        messages,
      });
      console.log('[useOpenCode] Message sent successfully');
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      console.error('[useOpenCode] Send message error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get session messages
   */
  const getSessionMessages = useCallback(async (sessionId: string): Promise<any[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const messages = await window.electronAPI.opencode.getSessionMessages(sessionId);
      console.log('[useOpenCode] Retrieved', messages.length, 'messages');
      return messages;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get messages';
      setError(errorMessage);
      console.error('[useOpenCode] Get messages error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fork a session
   */
  const forkSession = useCallback(async (
    sessionId: string,
    fromMessageId?: string
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const forkedSessionId = await window.electronAPI.opencode.forkSession({
        sessionId,
        fromMessageId,
      });
      console.log('[useOpenCode] Session forked to:', forkedSessionId);
      return forkedSessionId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fork session';
      setError(errorMessage);
      console.error('[useOpenCode] Fork session error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Summarize a session
   */
  const summarizeSession = useCallback(async (sessionId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await window.electronAPI.opencode.summarizeSession(sessionId);
      console.log('[useOpenCode] Session summarized');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to summarize session';
      setError(errorMessage);
      console.error('[useOpenCode] Summarize session error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Stream a message with real-time chunks
   */
  const streamMessage = useCallback(async (
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
    model?: string
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);

    return new Promise((resolve, reject) => {
      let fullContent = '';

      // Set up streaming listener
      const unsubscribe = window.electronAPI.opencode.onStreamChunk((chunk) => {
        if (chunk.sessionId === sessionId) {
          fullContent += chunk.delta;
          onChunk(chunk.delta);
        }
      });

      // Send the message
      window.electronAPI.opencode.sendMessage({
        sessionId,
        messages,
        model,
      })
        .then((result) => {
          unsubscribe();
          setIsLoading(false);
          resolve(result.message?.content || fullContent);
        })
        .catch((err) => {
          unsubscribe();
          const errorMessage = err instanceof Error ? err.message : 'Failed to stream message';
          setError(errorMessage);
          console.error('[useOpenCode] Stream message error:', err);
          setIsLoading(false);
          reject(err);
        });
    });
  }, []);

  /**
   * Get MCP servers
   */
  const getMCPServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const servers = await window.electronAPI.opencode.getMCPServers();
      console.log('[useOpenCode] Retrieved MCP servers:', servers.length);
      return servers;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get MCP servers';
      setError(errorMessage);
      console.error('[useOpenCode] Get MCP servers error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get available AI models
   */
  const getModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const models = await window.electronAPI.opencode.getModels();
      console.log('[useOpenCode] Retrieved models:', models.length);
      return models;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get models';
      setError(errorMessage);
      console.error('[useOpenCode] Get models error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * List sessions (history)
   */
  const listSessions = useCallback(async (limit?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const sessions = await window.electronAPI.opencode.listSessions(limit);
      console.log('[useOpenCode] Retrieved sessions:', sessions.length);
      return sessions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list sessions';
      setError(errorMessage);
      console.error('[useOpenCode] List sessions error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await window.electronAPI.opencode.deleteSession(sessionId);
      console.log('[useOpenCode] Session deleted:', sessionId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete session';
      setError(errorMessage);
      console.error('[useOpenCode] Delete session error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isInitialized,
    isLoading,
    error,
    sessionId,
    initialize,
    createSession,
    getOrCreateSession,
    sendMessage,
    streamMessage,
    getSessionMessages,
    forkSession,
    summarizeSession,
    clearError,
    getMCPServers,
    getModels,
    listSessions,
    deleteSession,
    setSessionId,
  };
}
