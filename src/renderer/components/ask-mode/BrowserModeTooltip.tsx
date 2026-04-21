import React, { useEffect, useRef } from 'react';
import { ShortcutCombo } from '@/components/common/ShortcutKeys';
import { XIcon } from '@phosphor-icons/react';

interface BrowserModeTooltipProps {
  isVisible: boolean;
  onClose: () => void;
  onTryExample?: (example: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function BrowserModeTooltip({ 
  isVisible, 
  onClose, 
  onTryExample,
  anchorRef 
}: BrowserModeTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isVisible, onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onClose, anchorRef]);

  // Position tooltip relative to anchor
  useEffect(() => {
    if (isVisible && anchorRef.current && tooltipRef.current) {
      const anchor = anchorRef.current;
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Default position: below anchor
      let top = anchorRect.bottom + 8;
      let left = anchorRect.left;

      // Adjust if tooltip goes off right edge
      if (left + tooltipRect.width > viewportWidth) {
        left = viewportWidth - tooltipRect.width - 16;
      }

      // Adjust if tooltip goes off bottom edge (show above instead)
      if (top + tooltipRect.height > viewportHeight) {
        top = anchorRect.top - tooltipRect.height - 8;
      }

      // Ensure doesn't go off left edge
      if (left < 16) {
        left = 16;
      }

      tooltipRef.current.style.top = `${top}px`;
      tooltipRef.current.style.left = `${left}px`;
    }
  }, [isVisible, anchorRef]);

  if (!isVisible) return null;

  const exampleQueries = [
    "Search for TypeScript tutorials and summarize the top 3",
    "Extract pricing from https://example.com/pricing",
  ];

  return (
    <div 
      ref={tooltipRef}
      className="browser-mode-tooltip"
      role="tooltip"
      aria-labelledby="browser-tooltip-title"
    >
      <div className="browser-mode-tooltip-header">
        <h4 id="browser-tooltip-title">Browser Automation</h4>
        <button 
          className="browser-tooltip-close"
          onClick={onClose}
          aria-label="Close tooltip"
        >
          <XIcon />
        </button>
      </div>

      <div className="browser-mode-tooltip-content">
        <p className="browser-tooltip-intro">When enabled, I can:</p>
        <ul className="browser-tooltip-features">
          <li>
            <span className="feature-icon">🔍</span>
            <span>Navigate to any URL and extract content</span>
          </li>
          <li>
            <span className="feature-icon">📝</span>
            <span>Fill out forms and submit data</span>
          </li>
          <li>
            <span className="feature-icon">📸</span>
            <span>Take screenshots of web pages</span>
          </li>
          <li>
            <span className="feature-icon">⚡</span>
            <span>Automate multi-step workflows</span>
          </li>
        </ul>

        <div className="browser-tooltip-examples">
          <strong className="examples-title">Try asking:</strong>
          {exampleQueries.map((example, index) => (
            <button
              key={index}
              className="example-query-btn"
              onClick={() => {
                onTryExample?.(example);
                onClose();
              }}
              title="Click to use this example"
            >
              <code>{example}</code>
            </button>
          ))}
        </div>

        <div className="browser-tooltip-hint">
          <span>Toggle with</span>
          <ShortcutCombo keys={["modifier", "Shift", "B"]} />
        </div>
      </div>
    </div>
  );
}
