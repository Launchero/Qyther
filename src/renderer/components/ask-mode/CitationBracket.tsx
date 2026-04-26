import React from 'react';
import { cn } from '@/lib/utils';

interface CitationBracketProps {
  number: number;
  onClick?: () => void;
  className?: string;
}

export function CitationBracket({ number, onClick, className }: CitationBracketProps) {
  return (
    <span
      className={cn('inline-citation', className)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Source ${number}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      [{number}]
    </span>
  );
}
