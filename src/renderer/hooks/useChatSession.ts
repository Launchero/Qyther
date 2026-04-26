import { useState, useEffect } from 'react';
import { logInfo, logWarn, logError } from '../utils/debugLogger';

import type { GenerativeUIType } from '../components/ask-mode/GenerativeUI';

export interface ThinkingStep {
  type: string;
  step: string;
  status: string;
  detail: string;
  data?: any;
  update?: boolean;
}

export interface UIPayload {
  type: GenerativeUIType;
  title: string;
  data: Record<string, unknown>;
  node: string;
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
  uiPayloads?: UIPayload[];
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
  qualityScore?: number;
  confidence?: number;
  verified?: boolean;
  uiPayloadPending?: boolean;
  uiPayloadType?: GenerativeUIType;
  uiGenerationProgress?: number;
  uiProgressMessage?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  model: string;
}

interface DesktopConfirmationState {
  threadId: string;
  action: string;
  description: string;
  planActions: Array<{ type: string; description: string; success: boolean; result?: string }>;
}

interface UseChatSessionReturn {
  sessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  thinkingSteps: ThinkingStep[];
  confidence: number | null;
  desktopConfirmation: DesktopConfirmationState | null;
  sendMessage: (content: string, attachmentPaths?: Array<{ name: string; path: string; type: string }>) => Promise<void>;
  submitForm: (formTitle: string, formData: Record<string, unknown>) => Promise<void>;
  confirmDesktopAction: (confirmed: boolean) => Promise<void>;
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
  const [desktopConfirmation, setDesktopConfirmation] = useState<DesktopConfirmationState | null>(null);

  useEffect(() => {
    initializeChat();
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onStreamChunk((data: {
      chunk: string;
      isComplete: boolean;
      error?: string;
      metrics?: any;
      reasoning?: any;
      thinkingSteps?: any[];
      selfCorrected?: boolean;
      iterationsUsed?: number;
      validationScore?: number;
      confidence?: number;
      qualityScore?: number;
      verificationSkipped?: boolean;
      fullContent?: string | null;
      uiPayloads?: Array<{ type: string; title: string; data: any; node: string }>;
      sources?: Array<{ url: string; title: string; excerpt: string }>;
    }) => {
      if (data.isComplete) {
        // Handle error completion
        if (data.error) {
          logError('[useChatSession] Stream error:', data.error);
          setError(data.error);
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
              const updated = [...prev];
              updated[prev.length - 1] = {
                ...lastMsg,
                isStreaming: false,
                content: lastMsg.content || `Error: ${data.error}`,
              };
              return updated;
            }
            return prev;
          });
          setIsLoading(false);
          return;
        }

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
              ...(data.qualityScore !== undefined && { qualityScore: data.qualityScore }),
              ...(data.verificationSkipped !== undefined && { verified: !data.verificationSkipped }),
              ...(data.sources && data.sources.length > 0 && {
                sources: data.sources.map((s, i) => ({
                  id: `source-${i}`,
                  url: s.url,
                  title: s.title,
                  excerpt: s.excerpt,
                })),
              }),
              ...(data.uiPayloads && data.uiPayloads.length > 0 && {
                uiPayloads: data.uiPayloads as UIPayload[],
                hasStructuredData: true,
                dataType: data.uiPayloads[0].type as GenerativeUIType,
                structuredData: data.uiPayloads[0].data,
              }),
              ...(data.qualityScore !== undefined && { qualityScore: data.qualityScore }),
            };
            return updated;
          }
          return prev;
        });
        if (data.confidence !== undefined) {
          setConfidence(data.confidence);
        }
        setIsLoading(false);
        logInfo('[useChatSession] Stream complete');
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
          logWarn('[useChatSession] Cannot find streaming assistant message to update');
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
      if (data.isComplete) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updated = [...prev];
            updated[prev.length - 1] = {
              ...lastMsg,
              content: data.content,
              isStreaming: false,
            };
            return updated;
          }
          return prev;
        });
        setIsLoading(false);
      } else {
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
            uiProgressMessage: data.message,
          };
          return updated;
        }
        return prev;
      });
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onUIPayloadReset(() => {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          const updated = [...prev];
          updated[prev.length - 1] = {
            ...lastMsg,
            uiPayloadPending: false,
            uiPayloadType: undefined,
            uiGenerationProgress: undefined,
            uiProgressMessage: undefined,
          };
          return updated;
        }
        return prev;
      });
    });

    return cleanup;
  }, []);

  // Desktop confirmation request listener
  useEffect(() => {
    const cleanup = window.electronAPI.chat.onDesktopConfirmationRequest((data: {
      threadId: string;
      interruptPayload: { type: string; action: string; description: string };
      pendingAction: { id: string; type: string; description: string };
      planActions: Array<{ type: string; description: string; success: boolean; result?: string }>;
    }) => {
      logInfo('[useChatSession] Desktop confirmation requested:', data.interruptPayload);
      // Store pending confirmation state for the UI to render
      setDesktopConfirmation({
        threadId: data.threadId,
        action: data.interruptPayload.action,
        description: data.interruptPayload.description,
        planActions: data.planActions,
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
      logError('[useChatSession] Initialization error:', err);
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
      logError('[useChatSession] Error:', errorMsg);
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

  const confirmDesktopAction = async (confirmed: boolean) => {
    if (!desktopConfirmation) {
      logWarn('[useChatSession] No pending desktop confirmation to confirm');
      return;
    }

    const { threadId } = desktopConfirmation;
    setDesktopConfirmation(null);
    setIsLoading(true);

    try {
      const result = await window.electronAPI.chat.resumeGraph(threadId, { confirmed });
      if (!result.success) {
        throw new Error(result.error || 'Failed to resume graph execution');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to resume graph';
      logError('[useChatSession] Resume graph error:', err);
      setError(errorMsg);
      setIsLoading(false);
      setMessages(prev => prev.filter(msg => !msg.isStreaming));
    }
  };

  const loadSession = async (sessionIdToLoad: string) => {
    try {
      await window.electronAPI.browser.closeSession('');
      
      // Switch the backend session so subsequent graph calls use the correct history
      await window.electronAPI.chat.switchSession(sessionIdToLoad);
      
      const session = await window.electronAPI.chat.getSession(sessionIdToLoad);
      if (session) {
        setSessionId(sessionIdToLoad);
        // Normalize Date fields which may arrive as strings over IPC
        const normalizedMessages = session.messages.map((m: ChatMessage) => ({
          ...m,
          timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
        }));
        setMessages(normalizedMessages);
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
    desktopConfirmation,
    sendMessage,
    submitForm,
    confirmDesktopAction,
    createNewSession,
    loadSession,
    deleteSession,
    listSessions,
    clearHistory,
    initializeChat,
  };
}
