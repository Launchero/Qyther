import { useState, useEffect, useCallback } from 'react';
import {
  StoredSession,
  StoredMessage,
  StoredToolCall,
  saveSessionToDB,
  loadSessionFromDB,
  deleteSessionFromDB,
  getSessionHistoryFromDB,
  addMessageToSessionInDB,
  updateMessageInDB,
  getMostRecentSession,
  isIndexedDBAvailable,
} from './indexeddb';

/**
 * Session history hook for managing sessions in IndexedDB
 */
export function useSessionHistory() {
  const [sessions, setSessions] = useState<Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // Check IndexedDB availability on mount
  useEffect(() => {
    setIsAvailable(isIndexedDBAvailable());
    if (!isIndexedDBAvailable()) {
      setError('IndexedDB is not available');
      setIsLoading(false);
    }
  }, []);

  // Load session history
  const loadHistory = useCallback(async () => {
    if (!isAvailable) return;

    setIsLoading(true);
    setError(null);

    try {
      const history = await getSessionHistoryFromDB(50);
      setSessions(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session history');
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable]);

  // Load history on mount
  useEffect(() => {
    if (isAvailable) {
      loadHistory();
    }
  }, [isAvailable, loadHistory]);

  // Save a session
  const saveSession = useCallback(async (session: StoredSession): Promise<void> => {
    if (!isAvailable) {
      throw new Error('IndexedDB is not available');
    }

    try {
      await saveSessionToDB(session);
      await loadHistory(); // Refresh the list
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save session';
      setError(message);
      throw err;
    }
  }, [isAvailable, loadHistory]);

  // Load a session
  const loadSession = useCallback(async (sessionId: string): Promise<StoredSession | null> => {
    if (!isAvailable) {
      throw new Error('IndexedDB is not available');
    }

    try {
      return await loadSessionFromDB(sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session';
      setError(message);
      throw err;
    }
  }, [isAvailable]);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    if (!isAvailable) {
      throw new Error('IndexedDB is not available');
    }

    try {
      await deleteSessionFromDB(sessionId);
      await loadHistory(); // Refresh the list
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      setError(message);
      throw err;
    }
  }, [isAvailable, loadHistory]);

  // Add a message to a session
  const addMessage = useCallback(async (
    sessionId: string,
    message: StoredMessage
  ): Promise<StoredSession | null> => {
    if (!isAvailable) {
      throw new Error('IndexedDB is not available');
    }

    try {
      return await addMessageToSessionInDB(sessionId, message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add message';
      setError(message);
      throw err;
    }
  }, [isAvailable]);

  // Update a message in a session
  const updateMessage = useCallback(async (
    sessionId: string,
    messageId: string,
    updates: Partial<StoredMessage>
  ): Promise<StoredSession | null> => {
    if (!isAvailable) {
      throw new Error('IndexedDB is not available');
    }

    try {
      return await updateMessageInDB(sessionId, messageId, updates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update message';
      setError(message);
      throw err;
    }
  }, [isAvailable]);

  // Get most recent session
  const getRecent = useCallback(async (): Promise<StoredSession | null> => {
    if (!isAvailable) {
      return null;
    }

    try {
      return await getMostRecentSession();
    } catch (err) {
      return null;
    }
  }, [isAvailable]);

  // Create a new session
  const createSession = useCallback(async (title: string = 'New Chat'): Promise<StoredSession> => {
    // Create session in memory if IndexedDB is not available
    const session: StoredSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      mcpServers: [],
      lastAccessed: Date.now(),
    };

    if (isAvailable) {
      try {
        await saveSessionToDB(session);
        await loadHistory();
      } catch (err) {
        console.warn('[useSessionHistory] Failed to save session to IndexedDB:', err);
        // Continue anyway - session will be in-memory only
      }
    } else {
      console.log('[useSessionHistory] IndexedDB not available, using in-memory session');
    }

    return session;
  }, [isAvailable, loadHistory]);

  // Refresh history
  const refresh = useCallback(async () => {
    await loadHistory();
    return sessions;
  }, [loadHistory, sessions]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sessions,
    isLoading,
    error,
    isAvailable,
    saveSession,
    loadSession,
    deleteSession,
    addMessage,
    updateMessage,
    getRecent,
    createSession,
    refresh,
    clearError,
  };
}

/**
 * Hook for streaming session updates
 */
export function useStreamingSession(sessionId: string | null) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Load session messages when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }

    loadSessionFromDB(sessionId).then(session => {
      if (session) {
        setMessages(session.messages);
      }
    }).catch(console.error);
  }, [sessionId]);

  // Start streaming
  const startStreaming = useCallback((messageId: string) => {
    setIsStreaming(true);
    setCurrentMessage('');
    // Add a placeholder message that will be updated
    const placeholder: StoredMessage = {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, placeholder]);
  }, []);

  // Add chunk to current message
  const addChunk = useCallback((chunk: string) => {
    setCurrentMessage(prev => prev + chunk);
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = currentMessage + chunk;
      }
      return newMessages;
    });
  }, [currentMessage]);

  // End streaming
  const endStreaming = useCallback(async () => {
    setIsStreaming(false);
    // Message is already updated in addChunk
  }, []);

  // Add tool call
  const addToolCall = useCallback((toolCall: StoredToolCall) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg) {
        if (!lastMsg.toolCalls) {
          lastMsg.toolCalls = [];
        }
        lastMsg.toolCalls.push(toolCall);
      }
      return newMessages;
    });
  }, []);

  // Update tool call
  const updateToolCall = useCallback((toolCallId: string, updates: Partial<StoredToolCall>) => {
    setMessages(prev => {
      const newMessages = [...prev];
      for (const msg of newMessages) {
        if (msg.toolCalls) {
          const toolCall = msg.toolCalls.find(tc => tc.id === toolCallId);
          if (toolCall) {
            Object.assign(toolCall, updates);
            break;
          }
        }
      }
      return newMessages;
    });
  }, []);

  return {
    messages,
    currentMessage,
    isStreaming,
    startStreaming,
    addChunk,
    endStreaming,
    addToolCall,
    updateToolCall,
  };
}