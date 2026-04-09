import { useState, useEffect, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  model: string;
}

interface UseChatSessionReturn {
  sessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  sendMessage: (content: string) => Promise<void>;
  createNewSession: (title?: string) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  listSessions: () => Promise<ChatSession[]>;
  clearHistory: () => Promise<void>;
  initializeChat: () => Promise<void>;
}

export function useChatSession(): UseChatSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize chat on mount
  useEffect(() => {
    initializeChat();
  }, []);

  // Set up streaming listener
  useEffect(() => {
    const cleanup = window.electronAPI.chat.onStreamChunk((data: { chunk: string; isComplete: boolean }) => {
      if (data.isComplete) {
        // Mark last message as complete
        setMessages(prev => prev.map((msg, idx) => 
          idx === prev.length - 1 ? { ...msg, isStreaming: false } : msg
        ));
        setIsLoading(false);
      } else {
        // Append chunk to last message
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updated = [...prev];
            updated[prev.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + data.chunk,
            };
            return updated;
          }
          return prev;
        });
      }
    });

    return cleanup;
  }, []);

  const initializeChat = async () => {
    try {
      const result = await window.electronAPI.chat.initialize();
      setIsReady(result.ready);
      
      if (result.ready) {
        // Try to load existing session or create new one
        const sessions = await listSessions();
        if (sessions.length > 0) {
          await loadSession(sessions[0].id);
        } else {
          await createNewSession();
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize chat';
      setError(errorMsg);
      console.error('[useChatSession] Initialization error:', err);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // Add user message immediately
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      // Create streaming assistant message
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Send to backend
      const result = await window.electronAPI.chat.sendMessage(content.trim(), sessionId || undefined);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMsg);
      setIsLoading(false);
      
      // Remove the streaming message on error
      setMessages(prev => prev.filter(msg => !msg.isStreaming));
    }
  };

  const createNewSession = async (title?: string): Promise<string> => {
    try {
      // Close browser session before creating new chat
      await window.electronAPI.browser.closeSession('');
      
      const result = await window.electronAPI.chat.createSession(title);
      if (result.success && result.sessionId) {
        setSessionId(result.sessionId);
        setMessages([]);
        return result.sessionId;
      }
      throw new Error('Failed to create session');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create session';
      setError(errorMsg);
      throw err;
    }
  };

  const loadSession = async (sessionIdToLoad: string) => {
    try {
      // Close browser session when switching conversations
      await window.electronAPI.browser.closeSession('');
      
      const session = await window.electronAPI.chat.getSession(sessionIdToLoad);
      if (session) {
        setSessionId(sessionIdToLoad);
        setMessages(session.messages);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load session';
      setError(errorMsg);
      throw err;
    }
  };

  const deleteSession = async (sessionIdToDelete: string) => {
    try {
      await window.electronAPI.chat.deleteSession(sessionIdToDelete);
      if (sessionIdToDelete === sessionId) {
        setSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete session';
      setError(errorMsg);
      throw err;
    }
  };

  const listSessions = async (): Promise<ChatSession[]> => {
    try {
      return await window.electronAPI.chat.listSessions();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to list sessions';
      setError(errorMsg);
      return [];
    }
  };

  const clearHistory = async () => {
    try {
      await window.electronAPI.chat.clearHistory();
      setMessages([]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear history';
      setError(errorMsg);
      throw err;
    }
  };

  return {
    sessionId,
    messages,
    isLoading,
    error,
    isReady,
    sendMessage,
    createNewSession,
    loadSession,
    deleteSession,
    listSessions,
    clearHistory,
    initializeChat,
  };
}
