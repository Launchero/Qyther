import { useState, useEffect } from 'react';

import type { GenerativeUIType } from '../components/ask-mode/GenerativeUI';

export interface ThinkingStep {
  type: string;
  step: string;
  status: string;
  detail: string;
  data?: any;
  update?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  hasStructuredData?: boolean;
  dataType?: GenerativeUIType;
  structuredData?: any;
  thinkingSteps?: ThinkingStep[];
  metrics?: any;
  reasoning?: { steps: Array<{ stepNumber: number; action: string; reasoning: string; confidence: number }> };
  sources?: Array<{
    id: string;
    url: string;
    title: string;
    excerpt: string;
    confidence?: number;
    accessedAt?: Date;
    isWebSource?: boolean;
  }>;
  selfCorrected?: boolean;
  iterationsUsed?: number;
  validationScore?: number;
  confidence?: number;
  verified?: boolean;
  uiPayloadPending?: boolean;
  uiPayloadType?: GenerativeUIType;
  uiGenerationProgress?: number;
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
  thinkingSteps: ThinkingStep[];
  confidence: number | null;
  sendMessage: (content: string, attachmentPaths?: Array<{ name: string; path: string; type: string }>) => Promise<void>;
  submitForm: (formTitle: string, formData: Record<string, unknown>) => Promise<void>;
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
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);

  useEffect(() => {
    initializeChat();
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onStreamChunk((data: {
      chunk: string;
      isComplete: boolean;
      metrics?: any;
      reasoning?: any;
      thinkingSteps?: any[];
      selfCorrected?: boolean;
      iterationsUsed?: number;
      validationScore?: number;
      confidence?: number;
      verificationSkipped?: boolean;
      fullContent?: string | null;
      uiPayloads?: Array<{ type: string; title: string; data: any; node: string }>;
    }) => {
      if (data.isComplete) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            const updated = [...prev];
            updated[prev.length - 1] = {
              ...lastMsg,
              isStreaming: false,
              content: data.fullContent || lastMsg.content,
              ...(data.metrics && { metrics: data.metrics }),
              ...(data.reasoning && { reasoning: data.reasoning }),
              ...(data.thinkingSteps && data.thinkingSteps.length > 0 && { thinkingSteps: data.thinkingSteps }),
              ...(data.selfCorrected !== undefined && { selfCorrected: data.selfCorrected }),
              ...(data.iterationsUsed !== undefined && { iterationsUsed: data.iterationsUsed }),
              ...(data.validationScore !== undefined && { validationScore: data.validationScore }),
              ...(data.confidence !== undefined && { confidence: data.confidence }),
              ...(data.verificationSkipped !== undefined && { verified: !data.verificationSkipped }),
              ...(data.uiPayloads && data.uiPayloads.length > 0 && {
                hasStructuredData: true,
                dataType: data.uiPayloads[0].type as GenerativeUIType,
                structuredData: data.uiPayloads[0].data,
              }),
            };
            return updated;
          }
          return prev;
        });
        setIsLoading(false);
        console.log('[useChatSession] Stream complete');
      } else {
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
          console.warn('[useChatSession] Cannot find streaming assistant message to update');
          return prev;
        });
      }
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onStreamReplace((data: {
      content: string;
      isComplete: boolean;
    }) => {
      if (!data.isComplete) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updated = [...prev];
            updated[prev.length - 1] = {
              ...lastMsg,
              content: data.content,
            };
            return updated;
          }
          return prev;
        });
      }
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onThinkingStep((data: ThinkingStep) => {
      setThinkingSteps(prev => {
        let updated: ThinkingStep[];
        if (data.update) {
          const idx = prev.findIndex(s => s.step === data.step && s.status === 'in_progress');
          if (idx !== -1) {
            updated = [...prev];
            updated[idx] = { ...updated[idx], ...data, update: undefined };
          } else {
            updated = [...prev, { ...data, update: undefined }];
          }
        } else {
          updated = [...prev, { ...data, update: undefined }];
        }

        setMessages(msgs => {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updatedMsgs = [...msgs];
            updatedMsgs[msgs.length - 1] = {
              ...lastMsg,
              thinkingSteps: updated,
            };
            return updatedMsgs;
          }
          return msgs;
        });

        return updated;
      });
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onUIPayloadStarted((data: { type: string }) => {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          const updated = [...prev];
          updated[prev.length - 1] = {
            ...lastMsg,
            uiPayloadPending: true,
            uiPayloadType: data.type as GenerativeUIType || 'table',
          };
          return updated;
        }
        return prev;
      });
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onUIPayloadProgress((data: { progress: number; message: string }) => {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          const updated = [...prev];
          updated[prev.length - 1] = {
            ...lastMsg,
            uiGenerationProgress: data.progress,
          };
          return updated;
        }
        return prev;
      });
    });

    return cleanup;
  }, []);

  const initializeChat = async () => {
    try {
      const result = await window.electronAPI.chat.initialize();
      setIsReady(result.ready);
      
      if (result.ready) {
        await createNewSession();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize chat';
      setError(errorMsg);
      console.error('[useChatSession] Initialization error:', err);
    }
  };

  const sendMessage = async (content: string, attachmentPaths?: Array<{ name: string; path: string; type: string }>) => {
    if (!content.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setThinkingSteps([]);

    try {
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        thinkingSteps: [],
      };
      setMessages(prev => [...prev, assistantMessage]);

      const result = await window.electronAPI.chat.sendStreamMessage(content.trim(), sessionId || undefined, attachmentPaths);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      console.error('[useChatSession] Error:', errorMsg);
      setError(errorMsg);
      setIsLoading(false);
      
      setMessages(prev => prev.filter(msg => !msg.isStreaming));
    }
  };

  const createNewSession = async (title?: string): Promise<string> => {
    try {
      await window.electronAPI.browser.closeSession('');
      
      const result = await window.electronAPI.chat.createSession(title);
      if (result.success && result.sessionId) {
        setSessionId(result.sessionId);
        setMessages([]);
        setThinkingSteps([]);
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
      await window.electronAPI.browser.closeSession('');
      
      const session = await window.electronAPI.chat.getSession(sessionIdToLoad);
      if (session) {
        setSessionId(sessionIdToLoad);
        setMessages(session.messages);
        setThinkingSteps([]);
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
        setThinkingSteps([]);
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
      setThinkingSteps([]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear history';
      setError(errorMsg);
      throw err;
    }
  };

  const submitForm = async (formTitle: string, formData: Record<string, unknown>) => {
    const formSummary = Object.entries(formData)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `Form confirmed: **${formTitle}**\n\n${formSummary}`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    await sendMessage(`Here is the confirmed configuration for "${formTitle}":\n\n${formSummary}\n\nPlease acknowledge and proceed with applying these settings.`);
  };

  return {
    sessionId,
    messages,
    isLoading,
    error,
    isReady,
    thinkingSteps,
    confidence,
    sendMessage,
    submitForm,
    createNewSession,
    loadSession,
    deleteSession,
    listSessions,
    clearHistory,
    initializeChat,
  };
}
