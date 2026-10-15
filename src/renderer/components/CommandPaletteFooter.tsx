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
          // Row rhythm: --padding-block-section is the footer's rung, px-4 is the surface gutter.
          'flex items-center justify-between px-4 py-[var(--padding-block-section)]',
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

        <div className="flex items-center gap-[var(--gap-inline)]">
          <Button
            variant="ghost"
            // The icon variant owns the box; --target-min (32px) is the floor, so the
            // size never gets restated as an h-/w- override against the primitive here.
            size="icon-lg"
            onClick={handleToggleShortcuts}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <Question className="h-4 w-4" aria-hidden="true" />
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
