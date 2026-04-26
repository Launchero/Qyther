import React, { useState, useEffect, useReducer, useCallback, useRef } from 'react';
import { useChatSession, type ChatSession } from '../hooks/useChatSession';
import { MCPToolModal } from './MCPToolModal';
import { useMCPKeyboardShortcuts } from '../hooks/useMCPKeyboardShortcuts';
import { ToastProvider } from '../contexts/ToastContext';
import { ChatMessagesList } from './ask-mode/ChatMessagesList';
import { BrowserProgressPanel } from './ask-mode/BrowserProgressPanel';
import { UnifiedCommandBar } from './ask-mode/UnifiedCommandBar';
import { browserReducer, initialBrowserState } from '../hooks/useBrowserState';
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
}: AskModeExpandedProps) {
  const {
    messages,
    isLoading,
    error,
    isReady,
    sendMessage,
    submitForm,
    createNewSession,
    loadSession,
    listSessions,
  } = useChatSession();

  const [showMCPModal, setShowMCPModal] = useState(false);
  const [welcomeState, setWelcomeState] = useState(true);
  const [historyItems, setHistoryItems] = useState<ChatSession[]>([]);
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Notify parent when hasSentMessage changes
  useEffect(() => {
    onHasSentMessageChange?.(hasSentMessage);
  }, [hasSentMessage, onHasSentMessageChange]);

  // Browser automation state with useReducer
  const [browserState, dispatch] = useReducer(browserReducer, initialBrowserState);

  // Browser automation event listeners
  useEffect(() => {
    const handleBrowserProgress = (data: { sessionId: string; progress: BrowserProgress }) => {
      dispatch({ type: 'SET_PROGRESS', progress: data.progress });
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

  // Poll browser session status
  useEffect(() => {
    const pollStatus = async () => {
      if (browserState.enabled) {
        try {
          const status = await window.electronAPI.browser.getSessionStatus();
          dispatch({ type: 'SET_SESSION_URL', url: status.url || null });
          dispatch({ type: 'SET_SESSION_ACTIVE', active: status.active });
        } catch (error) {
          logError('[AskModeExpanded] Error polling status:', error);
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserState.enabled, browserState.sessionActive]);

  const loadHistory = async () => {
    try {
      const sessions = await listSessions();
      setHistoryItems(sessions.slice(0, 10));
    } catch (err) {
      logError('[AskModeExpanded] Failed to load history:', err);
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewChat = useCallback(async () => {
    onClearAttachments?.();
    await createNewSession();
    setWelcomeState(true);
    setHasSentMessage(false);
    loadHistory(); // Refresh list after creating a new session
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
    loadHistory(); // Refresh list after switching sessions
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
    handleSendMessage(`Please explain this in simpler terms: ${content.slice(0, 200)}`);
  }, [handleSendMessage]);

  const handleShowCode = useCallback((content: string) => {
    handleSendMessage(`Please show me code examples related to: ${content.slice(0, 200)}`);
  }, [handleSendMessage]);

  const handleRegenerate = useCallback(() => {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      handleSendMessage(lastUserMessage.content);
    }
  }, [messages, handleSendMessage]);

  const handleRelatedQuestion = useCallback((question: string) => {
    handleSendMessage(question);
  }, [handleSendMessage]);

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

  const handlePauseBrowser = useCallback(async () => {
    try {
      dispatch({ type: 'SET_PAUSED', paused: true });
      logInfo('[AskModeExpanded] Browser automation paused');
    } catch (error) {
      logError('[AskModeExpanded] Failed to pause browser:', error);
    }
  }, []);

  const handleResumeBrowser = useCallback(async () => {
    try {
      dispatch({ type: 'SET_PAUSED', paused: false });
      logInfo('[AskModeExpanded] Browser automation resumed');
    } catch (error) {
      logError('[AskModeExpanded] Failed to resume browser:', error);
    }
  }, []);

  // MCP keyboard shortcuts
  useMCPKeyboardShortcuts({
    onOpenMCPModal: () => setShowMCPModal(true),
    closeModal: () => setShowMCPModal(false),
    isModalOpen: showMCPModal,
  });

  // Note: Query transfer from header to expanded Ask mode is handled by parent
  // The UnifiedCommandBar handles sending via Enter key - no auto-send needed here
  // Auto-send during typing causes race conditions with isLoading state

  // Map history to inline sessions
  const recentSessions: InlineChatSession[] = historyItems.map(item => ({
    id: item.id,
    title: item.title,
  }));

  if (!isReady) {
    return (
      <div className="ask-mode-expanded">
        <div className="chat-loading-state">
          <div className="loading-spinner" />
          <p>Initializing AI assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="ask-mode-expanded flex flex-col flex-1 min-h-0 overflow-hidden" style={{ position: 'relative' }}>
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
              estimatedTokens: Math.floor(browserState.elapsedMs / 100),
              confidence: Math.max(70, 100 - Math.floor(browserState.elapsedMs / 1000)),
            }}
            onPause={handlePauseBrowser}
            onResume={handleResumeBrowser}
            onStop={handleCloseBrowserSession}
            isPaused={browserState.isPaused}
          />
        )}

        {/* Main Chat Area with Welcome State and Messages */}
        <div className="chat-body">
          <ChatMessagesList
            messages={messages}
            isLoading={isLoading}
            welcomeState={welcomeState}
            browserModeEnabled={browserState.enabled}
            onSendExample={(query) => {
              handleSendMessage(query);
              setWelcomeState(false);
            }}
            onEnableBrowserMode={handleToggleBrowserMode}
            onCopy={handleCopy}
            onExplain={handleExplain}
            onShowCode={handleShowCode}
            onRegenerate={handleRegenerate}
            onRelatedQuestion={handleRelatedQuestion}
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
        />

        {/* MCP Tool Modal */}
        {showMCPModal && (
          <MCPToolModal onClose={() => setShowMCPModal(false)} />
        )}
      </div>
    </ToastProvider>
  );
}
