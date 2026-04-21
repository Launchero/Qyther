import { useEffect, useRef, useCallback } from 'react';

/**
 * Lightweight focus trap hook for overlays and modals.
 * Cycles Tab/Shift+Tab within the container's focusable elements
 * and optionally focuses an initial element on mount.
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, options?: {
  onEscape?: () => void;
  initialFocusSelector?: string;
}) {
  const previousActiveElement = useRef<Element | null>(null);

  const getFocusableElements = useCallback(() => {
    const container = containerRef.current;
    if (!container) return [];
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]',
    ].join(', ');
    return Array.from(container.querySelectorAll<HTMLElement>(selector));
  }, [containerRef]);

  useEffect(() => {
    previousActiveElement.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Focus initial element
    if (options?.initialFocusSelector) {
      const el = container.querySelector<HTMLElement>(options.initialFocusSelector);
      el?.focus();
    } else {
      const focusable = getFocusableElements();
      focusable[0]?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        options?.onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // capture phase

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Restore focus to previously focused element
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [containerRef, options, getFocusableElements]);
}
