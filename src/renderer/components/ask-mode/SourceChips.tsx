import React from 'react';
import { cn } from '@/lib/utils';

interface Source {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  confidence?: number;
  accessedAt?: Date;
  isWebSource?: boolean;
}

interface SourceChipsProps {
  sources: Source[];
  onNavigate?: (url: string) => void;
  className?: string;
}

export function SourceChips({ sources, onNavigate, className }: SourceChipsProps) {
  if (sources.length === 0) return null;

  const handleClick = (source: Source) => {
    if (onNavigate) {
      onNavigate(source.url);
    } else {
      window.open(source.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={cn('source-chips', className)}>
      {sources.map((source, index) => (
        <button
          key={source.id}
          className={cn('source-chip', source.isWebSource && 'web-source')}
          onClick={() => handleClick(source)}
          aria-label={`Source ${index + 1}: ${source.title}`}
          title={source.title}
        >
          <span className="source-chip-num">{index + 1}</span>
          {source.title}
        </button>
      ))}
    </div>
  );
}
