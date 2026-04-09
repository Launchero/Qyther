import React, { useState, useEffect } from 'react';
import { ChatInputArea } from './ChatInputArea';
import { useChatSession } from '../hooks/useChatSession';
import { MCPToolModal } from './MCPToolModal';
import { useMCPKeyboardShortcuts } from '../hooks/useMCPKeyboardShortcuts';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { ChatTopBar } from './ask-mode/ChatTopBar';
import { ChatMessagesList } from './ask-mode/ChatMessagesList';
import { ChatErrorBanner } from './ask-mode/ChatErrorBanner';
import { BrowserProgressPanel } from './ask-mode/BrowserProgressPanel';
import { ChatSession as ChatSessionType } from './ask-mode/ChatHistoryPanel';
import './BrowserAutomation.css';

export interface AskModeExpandedProps {
  sessionId?: string;
}

interface BrowserProgress {
  step: number;
  maxSteps: number;
  status: 'navigating' | 'clicking' | 'typing' | 'extracting' | 'complete' | 'error';
  url?: string;
  message: string;
}

export function AskModeExpanded({ sessionId: _sessionId }: AskModeExpandedProps) {
  const {
    messages,
    isLoading,
    error,
    isReady,
    sendMessage,
    createNewSession,
    loadSession,
    listSessions,
  } = useChatSession();

  const [selectedModel, setSelectedModel] = useState('Qwen');
  const [showMCPModal, setShowMCPModal] = useState(false);
  const [welcomeState, setWelcomeState] = useState(true);
  const [historyItems, setHistoryItems] = useState<ChatSessionType[]>([]);
  
  // Browser automation state
  const [browserModeEnabled, setBrowserModeEnabled] = useState(false);
  const [browserSessionActive, setBrowserSessionActive] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<BrowserProgress | null>(null);
  const [browserSessionUrl, setBrowserSessionUrl] = useState<string | null>(null);
  const [isBrowserPaused, setIsBrowserPaused] = useState(false);
  const [browserStartTime, setBrowserStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  
  // Tooltip preference (reserved for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_browserTooltipDismissed, _setBrowserTooltipDismissed] = useLocalStorage('browserTooltipDismissed', false);
  
  // Browser automation event listeners
  useEffect(() => {
    const handleBrowserProgress = (data: { sessionId: string; progress: BrowserProgress }) => {
      console.log('[AskModeExpanded] Browser progress:', data);
      setBrowserStatus(data.progress);
      setBrowserSessionActive(data.progress.status !== 'complete' && data.progress.status !== 'error');
      
      // Start timer on first progress update
      if (!browserStartTime && data.progress.step === 1) {
        setBrowserStartTime(Date.now());
      }
    };
    
    const handleBrowserChunk = (data: { sessionId: string; chunk: string }) => {
      console.log('[AskModeExpanded] Browser chunk:', data.chunk.slice(0, 50));
    };
    
    const handleBrowserError = (data: { sessionId: string; error: string }) => {
      console.error('[AskModeExpanded] Browser error:', data.error);
      setBrowserSessionActive(false);
      setBrowserStatus(null);
    };
    
    const cleanupProgress = window.electronAPI.browser.onProgress(handleBrowserProgress);
    const cleanupChunk = window.electronAPI.browser.onChunk(handleBrowserChunk);
    const cleanupError = window.electronAPI.browser.onError(handleBrowserError);
    
    return () => {
      cleanupProgress();
      cleanupChunk();
      cleanupError();
    };
  }, [browserStartTime]);
  
  // Poll browser session status
  useEffect(() => {
    const pollStatus = async () => {
      if (browserModeEnabled) {
        try {
          const status = await window.electronAPI.browser.getSessionStatus();
          setBrowserSessionUrl(status.url || null);
          setBrowserSessionActive(status.active);
        } catch (error) {
          console.error('[AskModeExpanded] Error polling status:', error);
        }
      }
    };
    
    pollStatus();
    const interval = setInterval(pollStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [browserModeEnabled]);
  
  // Timer for elapsed time
  useEffect(() => {
    if (browserSessionActive && browserStartTime && !isBrowserPaused) {
      const timer = setInterval(() => {
        setElapsedMs(Date.now() - browserStartTime);
      }, 100);
      
      return () => clearInterval(timer);
    }
  }, [browserSessionActive, browserStartTime, isBrowserPaused]);

  // Keyboard shortcut for browser mode toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        handleToggleBrowserMode();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        handleCloseBrowserSession();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserModeEnabled, browserSessionActive]);

  const loadHistory = async () => {
    try {
      const sessions = await listSessions();
      setHistoryItems(sessions.slice(0, 10)); // Limit to 10 recent chats
    } catch (err) {
      console.error('[AskModeExpanded] Failed to load history:', err);
    }
  };

  // Load history when needed
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewChat = async () => {
    await createNewSession();
    setWelcomeState(true);
  };

  const handleRetry = () => {
    // Get last user message and resend
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      sendMessage(lastUserMessage.content);
    }
  };

  const handleEditQuery = () => {
    // Focus the input area and keep the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      // In a real implementation, this would populate the input field
      console.log('[AskModeExpanded] Edit query:', lastUserMessage.content);
    }
  };

  const handleSelectHistory = async (sessionIdToLoad: string) => {
    await loadSession(sessionIdToLoad);
    setWelcomeState(false);
  };

  const handleCopy = (content: string) => {
    console.log('[AskModeExpanded] Content copied:', content.slice(0, 50));
  };

  const handleExplain = (content: string) => {
    sendMessage(`Please explain this in simpler terms: ${content.slice(0, 200)}`);
  };

  const handleShowCode = (content: string) => {
    sendMessage(`Please show me code examples related to: ${content.slice(0, 200)}`);
  };

  const handleRegenerate = () => {
    // Get last user message and resend
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      sendMessage(lastUserMessage.content);
    }
  };

  const handleToggleBrowserMode = async () => {
    const newEnabled = !browserModeEnabled;
    setBrowserModeEnabled(newEnabled);
    
    try {
      const result = await window.electronAPI.browser.setMode(newEnabled);
      console.log('[AskModeExpanded] Browser mode:', result);
      
      if (newEnabled && !browserSessionActive) {
        // Initialize browser agent on first enable
        await window.electronAPI.browser.initializeAgent();
      }
    } catch (error) {
      console.error('[AskModeExpanded] Failed to toggle browser mode:', error);
    }
  };
  
  const handleCloseBrowserSession = async () => {
    try {
      await window.electronAPI.browser.closeSession('');
      setBrowserSessionActive(false);
      setBrowserSessionUrl(null);
      console.log('[AskModeExpanded] Browser session closed');
    } catch (error) {
      console.error('[AskModeExpanded] Failed to close browser session:', error);
    }
  };
  
  const handlePauseBrowser = async () => {
    try {
      // In a real implementation, this would call IPC to pause
      setIsBrowserPaused(true);
      console.log('[AskModeExpanded] Browser automation paused');
    } catch (error) {
      console.error('[AskModeExpanded] Failed to pause browser:', error);
    }
  };
  
  const handleResumeBrowser = async () => {
    try {
      // In a real implementation, this would call IPC to resume
      setIsBrowserPaused(false);
      console.log('[AskModeExpanded] Browser automation resumed');
    } catch (error) {
      console.error('[AskModeExpanded] Failed to resume browser:', error);
    }
  };
  

  // MCP keyboard shortcuts
  useMCPKeyboardShortcuts({
    onOpenMCPModal: () => setShowMCPModal(true),
    closeModal: () => setShowMCPModal(false),
    isModalOpen: showMCPModal,
  });

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
    <div className="ask-mode-expanded">
      {/* Compact Top Bar with Browser Controls, Model Selector, and History */}
      <ChatTopBar
        selectedModel={selectedModel}
        onModelSelect={setSelectedModel}
        historySessions={historyItems}
        onSelectSession={handleSelectHistory}
        onNewChat={handleNewChat}
        browserModeEnabled={browserModeEnabled}
        browserSessionActive={browserSessionActive}
        browserSessionUrl={browserSessionUrl}
        onToggleBrowserMode={handleToggleBrowserMode}
        onCloseBrowserSession={handleCloseBrowserSession}
        onBrowserExample={sendMessage}
      />

      {/* Browser Session Status Indicator */}
      {browserSessionActive && browserStatus && (
        <BrowserProgressPanel
          progress={browserStatus}
          reasoning={browserStatus.status === 'navigating' ? 'Accessing the requested page to gather information' : undefined}
          upcomingSteps={
            browserStatus.status === 'navigating' 
              ? ['Extract content from page', 'Process and format results', 'Present findings']
              : undefined
          }
          metrics={{
            elapsedMs,
            estimatedTokens: Math.floor(elapsedMs / 100), // Rough estimate
            confidence: Math.max(70, 100 - Math.floor(elapsedMs / 1000)), // Decreases over time
          }}
          onPause={handlePauseBrowser}
          onResume={handleResumeBrowser}
          onStop={handleCloseBrowserSession}
          isPaused={isBrowserPaused}
        />
      )}

      {/* Main Chat Area with Welcome State and Messages */}
      <ChatMessagesList
        messages={messages}
        isLoading={isLoading}
        welcomeState={welcomeState}
        browserModeEnabled={browserModeEnabled}
        onSendExample={sendMessage}
        onEnableBrowserMode={handleToggleBrowserMode}
        onCopy={handleCopy}
        onExplain={handleExplain}
        onShowCode={handleShowCode}
        onRegenerate={handleRegenerate}
      />

      {/* Input Area */}
      <ChatInputArea
        onSend={sendMessage}
        placeholder="Reply to AI..."
        disabled={!isReady}
        isLoading={isLoading}
      />

      {/* Error Display with Smart Recovery */}
      {error && (
        <ChatErrorBanner
          error={error}
          onRetry={handleRetry}
          onNewChat={handleNewChat}
          onEditQuery={handleEditQuery}
        />
      )}

      {/* MCP Tool Modal */}
      {showMCPModal && (
        <MCPToolModal onClose={() => setShowMCPModal(false)} />
      )}
    </div>
  );
}
