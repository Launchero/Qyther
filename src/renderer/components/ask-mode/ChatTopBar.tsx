import React, { useRef, useState } from 'react';
import { ChatHistoryPanel, ChatSession } from './ChatHistoryPanel';
import { BrowserModeTooltip } from './BrowserModeTooltip';

interface ChatTopBarProps {
  selectedModel: string;
  onModelSelect: (model: string) => void;
  historySessions: ChatSession[];
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  browserModeEnabled: boolean;
  browserSessionActive: boolean;
  browserSessionUrl: string | null;
  onToggleBrowserMode: () => void;
  onCloseBrowserSession: () => void;
  onBrowserExample?: (example: string) => void;
}

export function ChatTopBar({
  selectedModel,
  onModelSelect,
  historySessions,
  onSelectSession,
  onNewChat,
  browserModeEnabled,
  browserSessionActive,
  browserSessionUrl,
  onToggleBrowserMode,
  onCloseBrowserSession,
  onBrowserExample,
}: ChatTopBarProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showBrowserTooltip, setShowBrowserTooltip] = useState(false);
  const browserToggleRef = useRef<HTMLButtonElement>(null);

  const models = ['Qwen', 'Claude 4.6', 'GPT-5'];

  return (
    <>
      <div className="chat-command-bar">
        {/* Browser Mode Toggle Button */}
        <div className="browser-mode-container">
          <div className="browser-mode-header">
            <button 
              ref={browserToggleRef}
              className={`browser-mode-toggle ${browserModeEnabled ? 'active' : ''}`}
              onClick={() => {
                onToggleBrowserMode();
                setShowBrowserTooltip(!showBrowserTooltip);
              }}
              onMouseEnter={() => setShowBrowserTooltip(true)}
              onMouseLeave={() => setShowBrowserTooltip(false)}
              title="Toggle Browser Automation (Ctrl+Shift+B)"
              aria-pressed={browserModeEnabled}
              aria-label="Toggle browser automation mode"
            >
              <svg className="browser-mode-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
              </svg>
              <span className="browser-mode-label">Browser</span>
              {browserModeEnabled && <span className="browser-mode-badge">ON</span>}
            </button>
            
            {/* Browser Mode Tooltip */}
            <BrowserModeTooltip
              isVisible={showBrowserTooltip}
              onClose={() => setShowBrowserTooltip(false)}
              onTryExample={onBrowserExample}
              anchorRef={browserToggleRef}
            />
            
            {/* Close Session Button */}
            {browserSessionActive && (
              <button 
                className="browser-close-btn"
                onClick={onCloseBrowserSession}
                title="Close Browser Session (Ctrl+Shift+X)"
                aria-label="Close browser session"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
          
          {/* Session Status Indicator */}
          {browserModeEnabled && browserSessionUrl && (
            <div className="browser-session-indicator">
              <svg className="browser-session-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
              </svg>
              <span className="browser-session-url" title={browserSessionUrl}>
                {browserSessionUrl}
              </span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Model Selector */}
        <div 
          className="chat-model-selector"
          onClick={() => setShowModelDropdown(!showModelDropdown)}
          role="button"
          tabIndex={0}
          aria-label="Select AI model"
          aria-expanded={showModelDropdown}
        >
          <span className="chat-model-name">{selectedModel}</span>
          <svg className="chat-model-dropdown" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>

          {showModelDropdown && (
            <div className="chat-model-dropdown-menu" role="menu">
              {models.map((model) => (
                <button
                  key={model}
                  className={`chat-model-option ${selectedModel === model ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onModelSelect(model);
                    setShowModelDropdown(false);
                  }}
                  role="menuitem"
                >
                  {model}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* History Button */}
        <div 
          className={`chat-history-btn ${showHistory ? 'active' : ''}`}
          onClick={() => setShowHistory(!showHistory)}
          role="button"
          tabIndex={0}
          aria-label="View chat history"
          aria-expanded={showHistory}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          
          {showHistory && (
            <ChatHistoryPanel
              sessions={historySessions}
              onSelectSession={(sessionId) => {
                onSelectSession(sessionId);
                setShowHistory(false);
              }}
              onNewChat={onNewChat}
              isVisible={showHistory}
            />
          )}
        </div>

        {/* Keyboard Shortcut Hint */}
        <div className="chat-keyboard-shortcut">
          <div className="chat-shortcut-key">⌘</div>
          <div className="chat-shortcut-key">K</div>
        </div>
      </div>
    </>
  );
}
