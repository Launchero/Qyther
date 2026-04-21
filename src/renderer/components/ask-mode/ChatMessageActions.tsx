import React from 'react';
import { Button } from '@/components/ui/button';
import { CopyIcon, QuestionIcon, CodeIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';

interface ChatMessageActionsProps {
  onCopy?: () => void;
  onExplain?: () => void;
  onShowCode?: () => void;
  onRegenerate?: () => void;
}

export function ChatMessageActions({ 
  onCopy, 
  onExplain, 
  onShowCode, 
  onRegenerate 
}: ChatMessageActionsProps) {
  return (
    <div className="flex gap-1.5 mt-3 pt-2 border-t border-border/30">
      {onCopy && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <CopyIcon className="h-3 w-3 mr-1" />
          Copy
        </Button>
      )}
      {onExplain && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onExplain}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <QuestionIcon className="h-3 w-3 mr-1" />
          Explain
        </Button>
      )}
      {onShowCode && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowCode}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <CodeIcon className="h-3 w-3 mr-1" />
          Code
        </Button>
      )}
      {onRegenerate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowsClockwiseIcon className="h-3 w-3 mr-1" />
          Regenerate
        </Button>
      )}
    </div>
  );
}