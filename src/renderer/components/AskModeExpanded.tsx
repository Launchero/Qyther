import React, { useState, useEffect, useReducer, useCallback, useRef } from 'react';
import { useChatSession } from '../hooks/useChatSession';
import { MCPToolModal } from './MCPToolModal';
import { useMCPKeyboardShortcuts } from '../hooks/useMCPKeyboardShortcuts';
import { Button } from '@/components/ui/button';
import { ToastProvider } from '../contexts/ToastContext';
import { ChatMessagesList } from './ask-mode/ChatMessagesList';
import { BrowserProgressPanel } from './ask-mode/BrowserProgressPanel';
import { UnifiedCommandBar } from './ask-mode/UnifiedCommandBar';
import { browserReducer, initialBrowserState } from '../hooks/useBrowserState';
import { desktopReducer, initialDesktopState } from '../hooks/useDesktopState';
import { usesMetaKey } from '@/utils/shortcuts';
import type { BrowserProgress } from './ask-mode/BrowserProgressPanel';
import type { InlineChatSession } from './ask-mode/RecentChatsInline';
import type { AttachedFile } from '@/types/ask-types';
import { logInfo, logWarn, logError } from '../utils/debugLogger';

export interface AskModeExpandedProps {
  sessionId?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRegisterSendMessage?: (_fn: ((message?: string, files?: AttachedFile[]) => void) | null) => void;
  onHasSentMessageChange?: (hasSent: boolean) => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  onAttachFile?: () => void;
  onAttachFolder?: () => void;
  onClearAttachments?: () => void;
  onAddFile?: (file: AttachedFile) => void;
  recentSearchResults?: Array<{ title: string; type: string }>;
  mcpCount?: number;
  onExitAskMode?: () => void;
  registerInput?: (name: string, ref: React.RefObject<HTMLElement | null>) => () => void;
}

export function AskModeExpanded({
  sessionId: _sessionId,
  searchQuery,
  onSearchChange,
  onRegisterSendMessage,
  onHasSentMessageChange,
  attachedFiles = [],
  onRemoveFile = () => {},
  onAttachFile = () => {},
  onAttachFolder,
  onClearAttachments,
  onAddFile,
  recentSearchResults = [],
  mcpCount = 0,
  onExitAskMode,
  registerInput,
}: AskModeExpandedProps) {
  const {
    messages,
    isLoading,
    error,
    isReady,
    isInitializing,
    notReady,
    initializeChat,
    sendMessage,
    submitForm,
    createNewSession,
    loadSession,
    sessions,
    cancelTurn,
  } = useChatSession();

  const [showMCPModal, setShowMCPModal] = useState(false);
  const [welcomeState, setWelcomeState] = useState(true);
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Notify parent when hasSentMessage changes
  useEffect(() => {
    onHasSentMessageChange?.(hasSentMessage);
  }, [hasSentMessage, onHasSentMessageChange]);

  // Browser automation state with useReducer
  const [browserState, dispatch] = useReducer(browserReducer, initialBrowserState);

  // Desktop automation state with useReducer
  const [desktopState, desktopDispatch] = useReducer(desktopReducer, initialDesktopState);

  const handleStopTurn = useCallback(() => {
    void cancelTurn();
  }, [cancelTurn]);

  // Browser automation event listeners
  useEffect(() => {
    const handleBrowserProgress = (data: { sessionId: string; progress: unknown }) => {
      const progress = data.progress as BrowserProgress;
      dispatch({ type: 'SET_PROGRESS', progress });
    };

    const handleBrowserError = (data: { sessionId: string; error: string }) => {
      logError('[AskModeExpanded] Browser error:', data.error);
      dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
    };

    const cleanupProgress = window.electronAPI.browser.onProgress(handleBrowserProgress);
    const cleanupError = window.electronAPI.browser.onError(handleBrowserError);

    return () => {
      cleanupProgress();
      cleanupError();
    };
  }, []);

  // Desktop automation event listeners
  useEffect(() => {
    // Note: desktop events come through the chat session stream, not separate IPC
    // The progress is emitted by the Pi desktop agent and forwarded via chat:thinking-step
    // We handle desktop progress through the existing chat streaming mechanism

    return () => {
      // No cleanup needed - desktop events flow through chat session
    };
  }, []);

  // Poll browser session status
  useEffect(() => {
    let inFlight = false;
    const pollStatus = async () => {
      if (inFlight) return;
      if (browserState.enabled) {
        inFlight = true;
        try {
          const status = await window.electronAPI.browser.getSessionStatus();
          dispatch({ type: 'SET_SESSION_URL', url: status.url || null });
          dispatch({ type: 'SET_SESSION_ACTIVE', active: status.active });
        } catch (error) {
          logError('[AskModeExpanded] Error polling status:', error);
        } finally {
          inFlight = false;
        }
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [browserState.enabled]);

  // Timer for elapsed time
  useEffect(() => {
    if (browserState.sessionActive && browserState.startTime && !browserState.isPaused) {
      const timer = setInterval(() => {
        dispatch({ type: 'SET_ELAPSED', elapsedMs: Date.now() - browserState.startTime! });
      }, 100);

      return () => clearInterval(timer);
    }
  }, [browserState.sessionActive, browserState.startTime, browserState.isPaused]);

  // Keyboard shortcut for browser mode toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const metaOrCtrl = usesMetaKey() ? e.metaKey : e.ctrlKey;
      if (metaOrCtrl && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        handleToggleBrowserMode();
      }
      if (metaOrCtrl && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        handleCloseBrowserSession();
      }
      if (metaOrCtrl && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        handleToggleDesktopMode();
      }
      // Ctrl/Cmd+Shift+N: new chat session
      if (metaOrCtrl && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewChat();
      }
      // Ctrl/Cmd+Shift+C: copy last AI message to clipboard
      if (metaOrCtrl && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        const lastAiMessage = messages.filter(m => m.role === 'assistant').pop();
        if (lastAiMessage) {
          handleCopy(lastAiMessage.content);
        }
      }
      // Ctrl/Cmd+Shift+R: regenerate response
      if (metaOrCtrl && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        handleRegenerate();
      }
      // Ctrl/Cmd+Shift+S: stop the current response (works while typing)
      if (metaOrCtrl && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleStopTurn();
      }
      // ArrowUp on empty ask input: edit last user message. Textarea-only so
      // result-list navigation and modal inputs never populate the ask box.
      if (e.key === 'ArrowUp' && !e.shiftKey && !metaOrCtrl && !e.altKey) {
        if (e.target instanceof HTMLTextAreaElement && searchQuery.trim().length === 0) {
          const lastUserMessage = messages.filter(m => m.role === 'user').pop();
          if (lastUserMessage) {
            e.preventDefault();
            onSearchChange(lastUserMessage.content);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserState.enabled, browserState.sessionActive, desktopState.enabled, desktopState.sessionActive, handleStopTurn, messages, searchQuery]);

  const handleNewChat = useCallback(async () => {
    onClearAttachments?.();
    await createNewSession();
    setWelcomeState(true);
    setHasSentMessage(false);
    // No list refresh: main publishes the list whenever it can change, and a brand-new session has
    // no messages yet, so it is not in the visible list until the first message lands.
  }, [createNewSession, onClearAttachments]);

  // Keep a ref to the latest searchQuery so the registered callback always has current value
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  // Keep a ref to the current attachedFiles so the registered callback always has the latest
  const attachedFilesRef = useRef(attachedFiles);
  attachedFilesRef.current = attachedFiles;

  const handleSendMessage = useCallback((message: string, files?: AttachedFile[]) => {
    setHasSentMessage(true);
    setWelcomeState(false);
    sendMessage(message, files);
  }, [sendMessage]);

  // Keep a ref to the latest handleSendMessage so the registered callback uses the current version
  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;

  // Register send function with parent - stable registration that uses passed message
  // The callback receives the message from UnifiedCommandBar, falling back to searchQueryRef if no message passed
  useEffect(() => {
    onRegisterSendMessage?.((message) => {
      const queryToSend = message?.trim() || searchQueryRef.current.trim();
      if (queryToSend) {
        logInfo('[AskModeExpanded] Sending message with attachments:', attachedFilesRef.current.map(f => f.name));
        handleSendMessageRef.current(queryToSend, attachedFilesRef.current);
      } else {
        logWarn('[AskModeExpanded] No query to send!');
      }
    });
    return () => {
      onRegisterSendMessage?.(null);
    };
  }, [onRegisterSendMessage]); // Only depends on onRegisterSendMessage, refs are updated during render

  const handleRetry = useCallback(() => {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      handleSendMessage(lastUserMessage.content);
    }
  }, [messages, handleSendMessage]);

  const handleEditQuery = useCallback(() => {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      onSearchChange(lastUserMessage.content);
      logInfo('[AskModeExpanded] Edit query populated:', lastUserMessage.content);
    }
  }, [messages, onSearchChange]);

  const handleSelectHistory = useCallback(async (sessionIdToLoad: string) => {
    await loadSession(sessionIdToLoad);
    setWelcomeState(false);
  }, [loadSession]);

  const handleCopy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      logInfo('[AskModeExpanded] Content copied to clipboard');
    } catch (err) {
      logError('[AskModeExpanded] Failed to copy content:', err);
    }
  }, []);

  const handleExplain = useCallback((content: string) => {
    handleSendMessage(`Please explain this in simpler terms: ${content}`);
  }, [handleSendMessage]);

  const handleShowCode = useCallback((content: string) => {
    handleSendMessage(`Please show me code examples related to: ${content}`);
  }, [handleSendMessage]);

  const handleRegenerate = useCallback(() => {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      handleSendMessage(lastUserMessage.content);
    }
  }, [messages, handleSendMessage]);

  const handleToggleBrowserMode = useCallback(async () => {
    const newEnabled = !browserState.enabled;
    dispatch({ type: 'TOGGLE_MODE', enabled: newEnabled });

    try {
      const result = await window.electronAPI.browser.setMode(newEnabled);
      logInfo('[AskModeExpanded] Browser mode:', result);

      if (newEnabled && !browserState.sessionActive) {
        await window.electronAPI.browser.initializeAgent();
      }
    } catch (error) {
      logError('[AskModeExpanded] Failed to toggle browser mode:', error);
    }
  }, [browserState.enabled, browserState.sessionActive]);

  const handleCloseBrowserSession = useCallback(async () => {
    try {
      await window.electronAPI.browser.closeSession('');
      dispatch({ type: 'SET_SESSION_ACTIVE', active: false });
      dispatch({ type: 'SET_SESSION_URL', url: null });
      logInfo('[AskModeExpanded] Browser session closed');
    } catch (error) {
      logError('[AskModeExpanded] Failed to close browser session:', error);
    }
  }, []);

  // Desktop mode handlers
  const handleToggleDesktopMode = useCallback(async () => {
    const newEnabled = !desktopState.enabled;
    desktopDispatch({ type: 'TOGGLE_MODE', enabled: newEnabled });
    logInfo('[AskModeExpanded] Desktop mode toggled:', newEnabled ? 'enabled' : 'disabled');
  }, [desktopState.enabled]);

  // Desktop elapsed time timer
  useEffect(() => {
    if (desktopState.sessionActive && desktopState.startTime && !desktopState.isPaused) {
      const timer = setInterval(() => {
        desktopDispatch({ type: 'SET_ELAPSED', elapsedMs: Date.now() - desktopState.startTime! });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [desktopState.sessionActive, desktopState.startTime, desktopState.isPaused]);

  // MCP keyboard shortcuts
  useMCPKeyboardShortcuts({
    onToggleMCP: () => setShowMCPModal((prev) => !prev),
    onOpenMCPModal: () => setShowMCPModal(true),
    closeModal: () => setShowMCPModal(false),
    isModalOpen: showMCPModal,
  });

  // Note: Query transfer from header to expanded Ask mode is handled by parent
  // The UnifiedCommandBar handles sending via Enter key - no auto-send needed here
  // Auto-send during typing causes race conditions with isLoading state

  // The list main pushed; capped where the UI wanted ten, not where the transport decided.
  const recentSessions: InlineChatSession[] = sessions.slice(0, 10).map(item => ({
    id: item.id,
    title: item.title,
  }));

  // The live agent pill reads the same folded truth the finished turns show:
  // the agent label main attributed to the currently streaming message.
  // No streaming message with an agent means no pill — never a placeholder.
  const activeAgent = isLoading
    ? messages.filter((m) => m.isStreaming && m.agent).map((m) => m.agent ?? null).pop() ?? null
    : null;

  if (isInitializing) {
    return (
      <div key="initializing" className="ask-mode-expanded">
        <div className="view-enter chat-loading-state" role="status" aria-live="polite">
          <div className="loading-spinner" aria-hidden="true" />
          <p>Connecting to the model…</p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div key="not-ready" className="ask-mode-expanded">
        <div className="view-enter chat-not-ready" role="alert" tabIndex={-1} autoFocus>
          <h2 className="chat-not-ready-title">Ask mode isn&apos;t connected</h2>
          <p className="chat-not-ready-body">
            {notReady?.reason ?? 'The model could not be reached.'}
          </p>
          {/* The variable list is the fix for a missing key only — a thrown init
              failure has a different cause and must not be told it is configuration. */}
          {notReady && !notReady.retryable && (
            <ul className="chat-not-ready-list">
              <li><code>API_KEY</code> — required</li>
              <li><code>MODEL</code> — optional, defaults to the built-in model</li>
              <li><code>BASE_URL</code> — optional, only for a non-default provider</li>
            </ul>
          )}
          <div className="chat-not-ready-actions">
            {notReady?.retryable && (
              <Button size="sm" onClick={() => { void initializeChat(); }}>
                Try again
              </Button>
            )}
            {onExitAskMode && (
              <Button size="sm" variant="outline" onClick={onExitAskMode}>
                Back to Files
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div key="ready" className="view-enter ask-mode-expanded flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Browser Session Status Indicator */}
        {browserState.sessionActive && browserState.progress && (
          <BrowserProgressPanel
            progress={browserState.progress}
            reasoning={browserState.progress.status === 'navigating' ? 'Accessing the requested page to gather information' : undefined}
            upcomingSteps={
              browserState.progress.status === 'navigating'
                ? ['Extract content from page', 'Process and format results', 'Present findings']
                : undefined
            }
            metrics={{
              elapsedMs: browserState.elapsedMs,
            }}
            onStop={() => { void cancelTurn(); handleCloseBrowserSession(); }}
          />
        )}

        {/* Desktop Session Status Indicator */}
        {desktopState.sessionActive && desktopState.progress && (
          <BrowserProgressPanel
            progress={desktopState.progress as unknown as BrowserProgress}
            reasoning={desktopState.progress.status === 'capturing' ? 'Capturing screen to understand current state' : undefined}
            upcomingSteps={
              desktopState.progress.status === 'capturing'
                ? ['Analyze screen content', 'Plan next action', 'Execute interaction']
                : undefined
            }
            metrics={{
              elapsedMs: desktopState.elapsedMs,
            }}
            onStop={() => { void cancelTurn(); desktopDispatch({ type: 'RESET' }); }}
          />
        )}

        {/* Main Chat Area with Welcome State and Messages */}
        <div className="chat-body">
          <ChatMessagesList
            messages={messages}
            isLoading={isLoading}
            welcomeState={welcomeState}
            browserModeEnabled={browserState.enabled}
            desktopModeEnabled={desktopState.enabled}
            activeAgent={activeAgent}
            onSendExample={(query) => {
              handleSendMessage(query);
              setWelcomeState(false);
            }}
            onEnableBrowserMode={handleToggleBrowserMode}
            onCopy={handleCopy}
            onExplain={handleExplain}
            onShowCode={handleShowCode}
            onRegenerate={handleRegenerate}
            recentSessions={recentSessions}
            onSelectSession={handleSelectHistory}
            onNewChat={handleNewChat}
            error={error}
            onRetry={handleRetry}
            onEditQuery={handleEditQuery}
            onFormSubmit={submitForm}
            recentSearchResults={recentSearchResults}
          />
        </div>

        {/* Bottom input */}
        <UnifiedCommandBar
          value={searchQuery}
          onChange={onSearchChange}
          onSend={(message) => handleSendMessage(message)}
          onStop={handleStopTurn}
          windowMode="expanded"
          hasSentMessage={hasSentMessage}
          isLoading={isLoading}
          attachedFiles={attachedFiles}
          onRemoveFile={onRemoveFile}
          onAttachFile={onAttachFile}
          onAttachFolder={onAttachFolder}
          onAddFile={onAddFile}
          mcpCount={mcpCount}
          onOpenMCPModal={() => setShowMCPModal(true)}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={() => setWebSearchEnabled(prev => !prev)}
          registerInput={registerInput}
        />

        {/* MCP Tool Modal */}
        {showMCPModal && (
          <MCPToolModal onClose={() => setShowMCPModal(false)} />
        )}
      </div>
    </ToastProvider>
  );
}
