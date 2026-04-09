import React, { useState } from 'react';

interface ChatMessageActionsProps {
  messageContent: string;
  hasCode?: boolean;
  onCopy: (content: string) => void;
  onExplain: (content: string) => void;
  onShowCode: (content: string) => void;
  onRegenerate?: () => void;
  isVisible: boolean;
  isActionInProgress?: boolean;
}

export function ChatMessageActions({
  messageContent,
  hasCode = false,
  onCopy,
  onExplain,
  onShowCode,
  onRegenerate,
  isVisible,
  isActionInProgress = false,
}: ChatMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy(messageContent);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleAction = (action: () => void) => {
    if (isActionInProgress) return;
    action();
  };

  return (
    <div 
      className={`chat-message-actions ${isVisible ? 'visible' : ''}`}
      role="toolbar"
      aria-label="Message actions"
    >
      {/* Copy Button */}
      <button
        className="chat-action-btn"
        onClick={() => handleAction(handleCopy)}
        disabled={isActionInProgress}
        title="Copy to clipboard"
        aria-label="Copy message"
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <span className="action-label">{copied ? 'Copied!' : 'Copy'}</span>
      </button>

      {/* Explain Button */}
      <button
        className="chat-action-btn"
        onClick={() => handleAction(() => onExplain(messageContent))}
        disabled={isActionInProgress}
        title="Explain this in simpler terms"
        aria-label="Explain message"
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span className="action-label">Explain</span>
      </button>

      {/* Show Code Button (conditional) */}
      {hasCode && (
        <button
          className="chat-action-btn"
          onClick={() => handleAction(() => onShowCode(messageContent))}
          disabled={isActionInProgress}
          title="Show more code examples"
          aria-label="Show code examples"
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2"/>
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="action-label">Show code</span>
        </button>
      )}

      {/* Regenerate Button */}
      {onRegenerate && (
        <button
          className="chat-action-btn"
          onClick={() => handleAction(onRegenerate)}
          disabled={isActionInProgress}
          title="Generate alternative response"
          aria-label="Regenerate response"
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="action-label">Regenerate</span>
        </button>
      )}

      {/* More Actions Dropdown */}
      <div className="chat-action-more">
        <button
          className="chat-action-more-btn"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isActionInProgress}
          title="More actions"
          aria-label="More actions"
          aria-expanded={showDropdown}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {showDropdown && (
          <div className="chat-action-dropdown" role="menu">
            <button
              className="chat-action-dropdown-item"
              onClick={() => {
                // Share functionality
                if (navigator.share) {
                  navigator.share({
                    title: 'AI Chat Message',
                    text: messageContent,
                  });
                } else {
                  // Fallback: copy to clipboard
                  handleCopy();
                }
                setShowDropdown(false);
              }}
              role="menuitem"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Share...
            </button>
            <button
              className="chat-action-dropdown-item"
              onClick={() => {
                // Save to notes (placeholder)
                console.log('Save to notes:', messageContent);
                setShowDropdown(false);
              }}
              role="menuitem"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Save to Notes
            </button>
            <button
              className="chat-action-dropdown-item"
              onClick={() => {
                // Feedback (placeholder)
                console.log('Give feedback for:', messageContent);
                setShowDropdown(false);
              }}
              role="menuitem"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Give Feedback
            </button>
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isActionInProgress && (
        <div className="action-loading-overlay" aria-label="Action in progress">
          <div className="loading-spinner-small" />
        </div>
      )}
    </div>
  );
}
