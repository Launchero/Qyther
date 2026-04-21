import React from 'react';
import { cn } from '@/lib/utils';
import { Lightbulb } from '@phosphor-icons/react';

interface FooterTipsProps {
  tip: string;
  isPaused: boolean;
  className?: string;
}

export function FooterTips({ tip, isPaused, className }: FooterTipsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Lightbulb className="h-4 w-4 text-muted-foreground flex-shrink-0" />

      <span
        className={cn(
          'text-xs text-muted-foreground',
          'transition-opacity',
          'duration-[var(--duration-200)]',
          'ease-[var(--easing-smooth)]',
          isPaused ? 'opacity-100' : 'opacity-80'
        )}
      >
        {tip}
      </span>
    </div>
  );
}
