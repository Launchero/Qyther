import React from 'react';
import { CopyIcon, QuestionIcon, CodeIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ChatMessageActionsProps {
  onCopy?: () => void;
  onExplain?: () => void;
  onShowCode?: () => void;
  onRegenerate?: () => void;
  className?: string;
}

export function ChatMessageActions({
  onCopy,
  onExplain,
  onShowCode,
  onRegenerate,
  className,
}: ChatMessageActionsProps) {
  const buttonClass = 'chat-message-action-btn';

  return (
    <div className={cn('chat-message-actions', className)}>
      {onCopy && (
        <button
          className={buttonClass}
          onClick={onCopy}
          aria-label="Copy response"
        >
          <CopyIcon className="chat-message-action-icon" />
          Copy
        </button>
      )}
      {onExplain && (
        <button
          className={buttonClass}
          onClick={onExplain}
          aria-label="Explain response"
        >
          <QuestionIcon className="chat-message-action-icon" />
          Explain
        </button>
      )}
      {onShowCode && (
        <button
          className={buttonClass}
          onClick={onShowCode}
          aria-label="Show code"
        >
          <CodeIcon className="chat-message-action-icon" />
          Code
        </button>
      )}
      {onRegenerate && (
        <button
          className={buttonClass}
          onClick={onRegenerate}
          aria-label="Regenerate response"
        >
          <ArrowsClockwiseIcon className="chat-message-action-icon" />
          Regenerate
        </button>
      )}
    </div>
  );
}