import { useCallback, useEffect, useRef, useState } from 'react';
import { logDebug, logError, logInfo, logWarn } from '../utils/debugLogger';

import type { ChatSessionSummary } from '../../shared/ipc/sessions';
import type { ThinkingStep } from '../../shared/ipc/thinking-step';
import { isCurrentTurnEvent, type TurnEnvelope } from '../../shared/ipc/turn';
import type { GenerativeUIType } from '../components/ask-mode/GenerativeUI';

export interface UIPayload {
  type: GenerativeUIType;
  title: string;
  data: Record<string, unknown>;
  node: string;
}

export interface ChatMetrics {
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  durationMs: number;
  model: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  hasStructuredData?: boolean;
  dataType?: GenerativeUIType;
  structuredData?: Record<string, unknown>;
  uiPayloads?: UIPayload[];
  thinkingSteps?: ThinkingStep[];
  metrics?: ChatMetrics;
  sources?: Array<{
    id: string;
    url: string;
    title: string;
    excerpt: string;
  }>;
  agent?: { label: string } | null;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Array<{ id?: string; role: string; content: string; timestamp: Date | string }>;
  createdAt: Date | string;
  updatedAt: Date | string;
  model: string;
}

export interface ChatNotReady {
  reason: string;
  /** False when the cause is configuration that needs a restart, so the UI never offers a dead retry. */
  retryable: boolean;
}

interface UseChatSessionReturn {
  sessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  isInitializing: boolean;
  notReady: ChatNotReady | null;
  sendMessage: (content: string, attachmentPaths?: Array<{ name: string; path: string; type: string }>) => Promise<void>;
  submitForm: (formTitle: string, formData: Record<string, unknown>) => Promise<void>;
  cancelTurn: () => Promise<void>;
  createNewSession: (title?: string) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  listSessions: () => Promise<import('../types').ChatSession[]>;
  /** Main's pushed list — the only source the history UI reads. */
  sessions: ChatSessionSummary[];
  clearHistory: () => Promise<void>;
  initializeChat: () => Promise<void>;
}

/**
 * Fold one `chat:thinking-step` push into the streaming assistant message. `messages` is the only
 * owner of the steps: the hook used to keep a second copy in its own `thinkingSteps` state and
 * write that copy into the message from *inside* the `setThinkingSteps` updater — an impure updater
 * React may invoke twice, and a second owner of a fact the transcript already reads off the
 * message. Exported pure so the fold is testable without mounting anything.
 */
export function withThinkingStep(
  messages: ChatMessage[],
  step: ThinkingStep & { update?: boolean },
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || !last.isStreaming) return messages;

  const incoming: ThinkingStep = { ...step, update: undefined };
  const existing = last.thinkingSteps ?? [];
  if (!step.update) return [...messages.slice(0, -1), { ...last, thinkingSteps: [...existing, incoming] }];

  const idx = existing.findIndex((s) => s.step === step.step && s.status === 'in_progress');
  const thinkingSteps = idx === -1
    ? [...existing, incoming]
    : existing.map((s, i) => (i === idx ? { ...s, ...incoming } : s));

  return [...messages.slice(0, -1), { ...last, thinkingSteps }];
}

/** Fold `chat:agent-change` into the message the agent indicator is actually rendered from. */
export function withAgentLabel(messages: ChatMessage[], label: string): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || !last.isStreaming) return messages;
  return [...messages.slice(0, -1), { ...last, agent: { label } }];
}

export function useChatSession(): UseChatSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** Main's pushed session list. Nothing polls for it — see the `chat:sessions-changed` listener. */
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [notReady, setNotReady] = useState<ChatNotReady | null>(null);

  // Main names each turn before streaming it. The id is what `chat:cancelTurn` needs, and it
  // is also what makes a stale event rejectable: `chat:turn-started` is the first push of a
  // turn, so by the time any token lands the ref already holds the newest turn, and anything
  // stamped with an older one is dropped instead of appended to this transcript.
  const activeTurnIdRef = useRef<string | null>(null);
  // Sequence is tracked PER CHANNEL, not globally: main shares one counter across
  // stream-chunk / thinking-step / agent-change, but those are separate IPC channels and the
  // renderer may receive them interleaved. Rejecting on a shared counter would drop a valid
  // chunk that simply arrived after a higher-numbered step on another channel.
  const lastSeqByChannel = useRef<Record<string, number>>({});

  const acceptEvent = useCallback((channel: string, env: TurnEnvelope): boolean => {
    if (!env.threadId) {
      // Accepted on purpose: the pre-turn failure path in main sends a terminal chunk
      // before any turn exists, and dropping that would strand `isLoading` forever. But
      // every live producer IS stamped, so seeing one here means a new push site bypassed
      // `beginTurn` — surface it instead of silently correlating by position again.
      logWarn(`[useChatSession] Unstamped event on ${channel} — a push site is bypassing beginTurn`);
      return true;
    }
    if (!isCurrentTurnEvent(env, { threadId: activeTurnIdRef.current, sessionId: null })) {
      logDebug('[useChatSession] Dropped event from a superseded turn:', channel, env.threadId);
      return false;
    }
    if (typeof env.seq === 'number') {
      const previous = lastSeqByChannel.current[channel] ?? 0;
      if (env.seq <= previous) return false;
      lastSeqByChannel.current[channel] = env.seq;
    }
    return true;
  }, []);

  /**
   * Tokens are appended in bulk, once per animation frame — never one `setMessages` per chunk.
   *
   * `chat:stream-chunk` arrives as fast as the model emits, which is far faster than the 60 Hz the
   * page can paint. Each commit re-rendered the whole transcript and re-parsed the whole growing
   * answer, so the work was O(chunks × content) for output that could not be seen any sooner than
   * the next frame anyway. The buffer is a plain string: order is IPC-delivery order, and the fold
   * below appends it to the same message a per-chunk update would have touched, so nothing about
   * the resulting text changes — only how often it is committed.
   *
   * There is no timer fallback, deliberately. rAF stops while the palette is hidden, and that is
   * the right behaviour: the tokens keep accumulating and the reveal paints them in one commit.
   * The terminal chunk flushes synchronously first (see `flushPendingChunks`), so no text can be
   * stranded in the buffer when a turn ends.
   */
  const pendingChunksRef = useRef('');
  const pendingFrameRef = useRef<number | null>(null);

  const flushPendingChunks = useCallback(() => {
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
    const text = pendingChunksRef.current;
    if (!text) return;
    pendingChunksRef.current = '';
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (!(lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming)) {
        logWarn('[useChatSession] Cannot find streaming assistant message to update');
        return prev;
      }
      const updated = [...prev];
      updated[prev.length - 1] = { ...lastMsg, content: lastMsg.content + text };
      return updated;
    });
  }, []);

  const scheduleChunkFlush = useCallback(() => {
    if (pendingFrameRef.current !== null) return;
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      flushPendingChunks();
    });
  }, [flushPendingChunks]);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onTurnStarted(({ threadId }) => {
      activeTurnIdRef.current = threadId;
      lastSeqByChannel.current = {};
    });
    return cleanup;
  }, []);

  useEffect(() => {
    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initializeChat calls IPC only, safe on mount
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onStreamChunk((data: {
      chunk: string;
      isComplete: boolean;
      error?: string;
      metrics?: ChatMetrics;
      reasoning?: { steps: Array<{ stepNumber: number; action: string; reasoning: string; confidence: number }> };
      thinkingSteps?: ThinkingStep[];
      selfCorrected?: boolean;
      iterationsUsed?: number;
      validationScore?: number;
      confidence?: number;
      qualityScore?: number;
      verificationSkipped?: boolean;
      fullContent?: string | null;
      uiPayloads?: Array<{ type: string; title: string; data: Record<string, unknown>; node: string }>;
      sources?: Array<{ url: string; title: string; excerpt: string }>;
      threadId?: string;
      sessionId?: string | null;
      seq?: number;
    }) => {
      if (!acceptEvent('chat:stream-chunk', data)) return;
      if (data.isComplete) {
        // Anything still buffered belongs to this turn's text and the terminal write below reads
        // `lastMsg.content`, so it lands first rather than being dropped with the frame.
        flushPendingChunks();
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
        setIsLoading(false);
        logInfo('[useChatSession] Stream complete');
      } else {
        pendingChunksRef.current += data.chunk;
        scheduleChunkFlush();
      }
    });

    return () => {
      // A turn that was cancelled, or a component unmounted mid-stream, must not leave a frame
      // scheduled against a dead listener — the buffer is dropped with the subscription.
      if (pendingFrameRef.current !== null) {
        cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
      pendingChunksRef.current = '';
      cleanup();
    };
  }, [acceptEvent, flushPendingChunks, scheduleChunkFlush]);

  useEffect(() => {
    const cleanup = window.electronAPI.chat.onThinkingStep((data: ThinkingStep & TurnEnvelope) => {
      if (!acceptEvent('chat:thinking-step', data)) return;
      setMessages(prev => withThinkingStep(prev, data));
    });

    return cleanup;
  }, [acceptEvent]);

  // Agent change listener — tracks which LangGraph agent is currently active
  useEffect(() => {
    const cleanup = window.electronAPI.chat.onAgentChange((data: { label: string } & TurnEnvelope) => {
      if (!acceptEvent('chat:agent-change', data)) return;
      setMessages(prev => withAgentLabel(prev, data.label));
    });

    return cleanup;
  }, [acceptEvent]);

  /**
   * The session list arrives from main. `chat:initialize` publishes the current list and every
   * mutation that can change it publishes again, so there is nothing to fetch here and nothing to
   * poll: the component that used to call `listSessions()` from `useEffect(loadHistory, [loadHistory])`
   * re-ran it on every render because the callback identity changed, each call re-rendering it again.
   */
  useEffect(() => {
    const cleanup = window.electronAPI.chat.onSessionsChanged(setSessions);
    return cleanup;
  }, []);

  const initializeChat = async () => {
    setIsInitializing(true);
    setNotReady(null);
    try {
      const result = await window.electronAPI.chat.initialize();
      setIsReady(!!result.ready);

      if (result.ready) {
        await createNewSession();
      } else {
        setNotReady({
          reason: result.error ?? 'The model is not available yet.',
          retryable: result.retryable !== false,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize chat';
      setError(errorMsg);
      setIsReady(false);
      setNotReady({ reason: errorMsg, retryable: true });
      logError('[useChatSession] Initialization error:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  const sendMessage = async (content: string, attachmentPaths?: Array<{ name: string; path: string; type: string }>) => {
    if (!content.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

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
        return result.sessionId;
      }
      throw new Error('Failed to create session');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create session';
      setError(errorMsg);
      throw err;
    }
  };

  const cancelTurn = async () => {
    const threadId = activeTurnIdRef.current;
    activeTurnIdRef.current = null;
    if (!threadId) {
      logWarn('[useChatSession] No active turn to cancel');
      return;
    }

    try {
      await window.electronAPI.chat.cancelTurn(threadId);
    } catch (err) {
      logError('[useChatSession] Failed to cancel turn:', err);
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
        const normalizedMessages = session.messages.map((m) => ({
          ...m,
          id: m.id || `msg-${Date.now()}`,
          timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
          isStreaming: false,
          role: m.role as 'user' | 'assistant',
        }));
        setMessages(normalizedMessages);
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

  // Must stay referentially stable: `AskModeExpanded` builds `loadHistory` from this and runs
  // it from `useEffect(loadHistory, [loadHistory])`. A fresh closure per render therefore made
  // the effect fire after every render, each firing a `chat:list-sessions` IPC and a
  // `setHistoryItems` with a new array — an unbounded render/IPC loop while Ask mode was open.
  // Must stay referentially stable: `AskModeExpanded` builds `loadHistory` from this and runs
  // it from `useEffect(loadHistory, [loadHistory])`. A fresh closure per render therefore made
  // the effect fire after every render, each firing a `chat:list-sessions` IPC and a
  // `setHistoryItems` with a new array — an unbounded render/IPC loop while Ask mode was open.
  const listSessions = useCallback(async () => {
    try {
      const sessions = await window.electronAPI.chat.listSessions();
      return sessions;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to list sessions';
      setError(errorMsg);
      return [];
    }
  }, []);

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
    isInitializing,
    notReady,
    sendMessage,
    submitForm,
    cancelTurn,
    createNewSession,
    loadSession,
    deleteSession,
    listSessions,
    sessions,
    clearHistory,
    initializeChat,
  };
}
