import React from 'react';
import { ErrorType, classifyError, ErrorRecovery } from '../../utils/errorClassifier';
import { ClockIcon, WarningIcon, LightningIcon, XCircleIcon } from '@phosphor-icons/react';

interface ChatErrorBannerProps {
  error: string;
  onRetry?: () => void;
  onNewChat?: () => void;
  onEditQuery?: () => void;
}

export function ChatErrorBanner({
  error,
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
        return <ClockIcon />;
      case ErrorType.BROWSER_NAVIGATION_FAILED:
      case ErrorType.BROWSER_ELEMENT_NOT_FOUND:
        return <WarningIcon />;
      case ErrorType.NETWORK_ERROR:
        return <LightningIcon />;
      default:
        return <XCircleIcon />;
    }
  };

  return (
    <div className="chat-error-banner error-banner-enter" role="alert" aria-live="assertive">
      <div className="chat-error-content">
        <div className="chat-error-icon error-icon-shake">{getIcon()}</div>
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
