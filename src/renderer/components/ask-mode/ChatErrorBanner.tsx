import React from 'react';
import { ErrorType, classifyError, ErrorRecovery } from '../../utils/errorClassifier';
import { ClockIcon, WarningIcon, LightningIcon, XCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

interface ChatErrorBannerProps {
  error: string;
  onRetry?: () => void;
  onNewChat?: () => void;
  onEditQuery?: () => void;
}

/** Decorative: the banner already states the failure in text and `role="alert"`. */
function ErrorGlyph({ type }: { type: ErrorType }) {
  switch (type) {
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

  return (
    <div className="chat-error-banner error-banner-enter" role="alert" aria-live="assertive">
      <div className="chat-error-content">
        <div className="chat-error-icon error-icon-shake" aria-hidden="true">
          <ErrorGlyph type={errorData.type} />
        </div>
        <div className="chat-error-body">
          <div className="chat-error-title">{errorData.title}</div>
          <div className="chat-error-message">{errorData.message}</div>

          {/* Recovery Actions */}
          {errorData.recoveryActions.length > 0 && (
            <div className="chat-error-actions">
              {errorData.recoveryActions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant={action.primary ? 'destructive' : 'outline'}
                  size="xs"
                  onClick={action.action}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
