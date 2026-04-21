import React from 'react';

interface CitationBracketProps {
  number: number;
  onClick?: () => void;
  className?: string;
}

export function CitationBracket({ number, onClick, className }: CitationBracketProps) {
  return (
    <span
      className={`inline-citation ${className || ''}`}
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
