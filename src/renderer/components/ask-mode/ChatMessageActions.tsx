import React, { useEffect, useRef, useState } from 'react';
import { CopyIcon, QuestionIcon, CodeIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatMessageActionsProps {
  onCopy?: () => void;
  onExplain?: () => void;
  onShowCode?: () => void;
  onRegenerate?: () => void;
  className?: string;
}

interface Action {
  label: string;
  ariaLabel: string;
  shortcutHint?: string;
  Icon: typeof CopyIcon;
  run?: () => void;
}

export function ChatMessageActions({
  onCopy,
  onExplain,
  onShowCode,
  onRegenerate,
  className,
}: ChatMessageActionsProps) {
  // Copy success is silent by default in a transient overlay window, which is
  // indistinguishable from failure — so the Copy button confirms inline, the
  // same way CodeBlock's own copy button does.
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const actions: Action[] = [
    {
      label: 'Copy',
      ariaLabel: 'Copy response',
      shortcutHint: 'Ctrl+Shift+C',
      Icon: CopyIcon,
      run: onCopy
        ? () => {
            onCopy();
            setCopied(true);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
          }
        : undefined,
    },
    { label: 'Explain', ariaLabel: 'Explain response', Icon: QuestionIcon, run: onExplain },
    { label: 'Code', ariaLabel: 'Show code', Icon: CodeIcon, run: onShowCode },
    { label: 'Regenerate', ariaLabel: 'Regenerate response', shortcutHint: 'Ctrl+Shift+R', Icon: ArrowsClockwiseIcon, run: onRegenerate },
  ];

  return (
    <div className={cn('chat-message-actions', className)}>
      {actions.filter((action) => action.run).map(({ label, ariaLabel, shortcutHint, Icon, run }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="xs"
          className="chat-message-action-btn"
          onClick={run}
          aria-label={ariaLabel}
          title={shortcutHint ? `${ariaLabel} (${shortcutHint})` : ariaLabel}
        >
          <Icon className="chat-message-action-icon" aria-hidden="true" />
          {label === 'Copy' && copied ? (
            <span role="status" aria-live="polite">Copied!</span>
          ) : (
            label
          )}
        </Button>
      ))}
    </div>
  );
}
