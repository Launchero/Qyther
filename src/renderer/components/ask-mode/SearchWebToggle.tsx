import React from 'react';
import { GlobeIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface SearchWebToggleProps {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

export function SearchWebToggle({ enabled, onToggle, className }: SearchWebToggleProps) {
  return (
    <button
      className={cn('search-web-toggle', enabled && 'active', className)}
      onClick={onToggle}
      aria-label={enabled ? 'Disable web search' : 'Enable web search'}
      aria-pressed={enabled}
      title="Search web for answers"
    >
      <GlobeIcon weight="regular" />
      Search web
    </button>
  );
}
