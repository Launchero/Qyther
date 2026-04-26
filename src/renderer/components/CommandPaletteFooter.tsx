import React, { useState } from 'react';
import type { SearchMode } from './ModeTabs';
import { ThemeToggle } from './ThemeToggle';
import { FooterTips } from './FooterTips';
import { ShortcutsReference } from './ShortcutsReference';
import { useRotatingTips } from '@/hooks/useRotatingTips';
import { cn } from '@/lib/utils';
import { Question } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

export interface CommandPaletteFooterProps {
  showFooter: boolean;
  footerRef: React.RefObject<HTMLDivElement | null>;
  searchMode?: SearchMode;
  searchQuery?: string;
  showShortcuts?: boolean;
  onToggleShortcuts?: () => void;
}

export function CommandPaletteFooter({
  showFooter,
  footerRef,
  searchMode = 'file',
  searchQuery = '',
  showShortcuts: parentShowShortcuts,
  onToggleShortcuts,
}: CommandPaletteFooterProps) {
  const [localShowShortcuts, setLocalShowShortcuts] = useState(false);
  const showShortcuts = parentShowShortcuts !== undefined ? parentShowShortcuts : localShowShortcuts;
  const handleToggleShortcuts = onToggleShortcuts ?? (() => setLocalShowShortcuts(prev => !prev));

  const hasQuery = searchQuery.trim().length > 0;
  const { currentTip, isPaused, hoverHandlers } = useRotatingTips(searchMode, hasQuery);

  if (!showFooter) {
    return null;
  }

  return (
    <>
      <div
        ref={footerRef}
        {...hoverHandlers}
        className={cn(
          'flex items-center justify-between px-4 py-2.5',
          'bg-muted border-t border-border',
          'rounded-b-[var(--radius-command-palette)]',
          'min-h-[var(--container-input-height)]'
        )}
      >
        <div className="flex items-center">
          <FooterTips
            tip={currentTip}
            isPaused={isPaused}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggleShortcuts}
            title="Keyboard shortcuts"
          >
            <Question className="h-4 w-4" />
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <ShortcutsReference
        open={showShortcuts}
        onOpenChange={handleToggleShortcuts}
      />
    </>
  );
}
