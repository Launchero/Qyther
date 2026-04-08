import React from 'react';
import { ThemeToggle } from './ThemeToggle';

export interface CommandPaletteFooterProps {
  showFooter: boolean;
  footerRef: React.RefObject<HTMLDivElement | null>;
}

export function CommandPaletteFooter({
  showFooter,
  footerRef,
}: CommandPaletteFooterProps) {
  if (!showFooter) {
    return null;
  }

  return (
    <div ref={footerRef} className="command-palette-footer">
      <div className="footer-section">
        <div className="shortcut-hint">
          <kbd>↑↓</kbd> Navigate
        </div>
        <div className="shortcut-hint">
          <kbd>Enter</kbd> Execute
        </div>
        <div className="shortcut-hint">
          <kbd>Esc</kbd> Close
        </div>
      </div>
      <div className="footer-divider" />
      <div className="footer-section">
        <div className="shortcut-hint">
          <kbd>Home</kbd><kbd>End</kbd> Jump
        </div>
        <div className="shortcut-hint">
          <kbd>PgUp</kbd><kbd>PgDn</kbd> Page
        </div>
      </div>
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
