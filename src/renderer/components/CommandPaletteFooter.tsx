import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import type { SearchMode } from './SearchBar';

export interface CommandPaletteFooterProps {
  showFooter: boolean;
  footerRef: React.RefObject<HTMLDivElement | null>;
  searchMode?: SearchMode;
  windowMode?: 'expanded' | 'compact' | 'custom';
}

export function CommandPaletteFooter({
  showFooter,
  footerRef,
  searchMode = 'file',
  windowMode = 'expanded',
}: CommandPaletteFooterProps) {
  if (!showFooter) {
    return null;
  }

  const isAiMode = searchMode === 'ai';
  const isExpandedWindow = windowMode === 'expanded';

  return (
    <div ref={footerRef} className="command-palette-footer">
      <div className="footer-section">
        <div className="shortcut-hint">
          <kbd>↑↓</kbd> Navigate
        </div>
        <div className="shortcut-hint">
          <kbd>Enter</kbd> {isAiMode && isExpandedWindow ? 'Send' : 'Execute'}
        </div>
        {isAiMode && (
          <div className="shortcut-hint">
            <kbd>⇧</kbd><kbd>Enter</kbd> New line
          </div>
        )}
        <div className="shortcut-hint">
          <kbd>Esc</kbd> {isExpandedWindow ? 'Minimize' : 'Close'}
        </div>
      </div>
      {!isAiMode && (
        <>
          <div className="footer-divider" />
          <div className="footer-section">
            <div className="shortcut-hint">
              <kbd>Home</kbd><kbd>End</kbd> Jump
            </div>
            <div className="shortcut-hint">
              <kbd>PgUp</kbd><kbd>PgDn</kbd> Page
            </div>
          </div>
        </>
      )}
      <div className="footer-section footer-section-right">
        <div className="shortcut-hint">
          <kbd>Alt+Shift+M</kbd> Mode
        </div>
        <div className="shortcut-hint">
          <kbd>Alt+Shift+T</kbd> Theme
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
