import React from 'react';
import { ErrorType, classifyError, ErrorRecovery } from '../../utils/errorClassifier';

interface ChatErrorBannerProps {
  error: string;
  onRetry?: () => void;
  onNewChat?: () => void;
  onEditQuery?: () => void;
}

export function ChatErrorBanner({
  error,
  browserModeEnabled,
  onRetry,
  onNewChat,
  onEditQuery,
}: ChatErrorBannerProps) {
  // Classify the error and get recovery actions
  const errorData: ErrorRecovery = classifyError(error, {
    onRetry,
    onEditQuery,
    onNewChat,
  });

  // Get icon based on error type
  const getIcon = () => {
    switch (errorData.type) {
      case ErrorType.BROWSER_TIMEOUT:
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        );
      case ErrorType.BROWSER_NAVIGATION_FAILED:
      case ErrorType.BROWSER_ELEMENT_NOT_FOUND:
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case ErrorType.NETWORK_ERROR:
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        );
    }
  };

  return (
    <div className="chat-error-banner" role="alert" aria-live="assertive">
      <div className="chat-error-content">
        <div className="chat-error-icon">{getIcon()}</div>
        <div className="chat-error-body">
          <div className="chat-error-title">{errorData.title}</div>
          <div className="chat-error-message">{errorData.message}</div>
          
          {/* Recovery Actions */}
          {errorData.recoveryActions.length > 0 && (
            <div className="chat-error-actions">
              {errorData.recoveryActions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className={`chat-error-action-btn ${action.primary ? 'primary' : ''}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
