import React from 'react';
import { GlobeIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SearchWebToggleProps {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

export function SearchWebToggle({ enabled, onToggle, className }: SearchWebToggleProps) {
  return (
    <Button
      type="button"
      variant={enabled ? 'default' : 'outline'}
      size="xs"
      className={cn('search-web-toggle', className)}
      onClick={onToggle}
      aria-label={enabled ? 'Disable web search' : 'Enable web search'}
      aria-pressed={enabled}
      title="Search web for answers"
    >
      <GlobeIcon weight="regular" aria-hidden="true" />
      Search web
    </Button>
  );
}
