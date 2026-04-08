import { useEffect, useCallback } from 'react';
import type { SearchResult } from '../components/ResultsList';

export interface UseKeyboardOptions {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  results: SearchResult[];
  onExecute: (result: SearchResult) => Promise<void>;
  onClose: () => Promise<void>;
}

export function useKeyboard({
  selectedIndex,
  setSelectedIndex,
  results,
  onExecute,
  onClose,
}: UseKeyboardOptions) {
  // Handle keyboard navigation
  const handleKeyDown = useCallback(async (event: KeyboardEvent) => {
    const NAVIGATION_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    const isNavigationKey = NAVIGATION_KEYS.includes(event.key);
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
    const isTextInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

    // Skip navigation handling when modifier keys are pressed (for text editing shortcuts)
    if (hasModifier) {
      return;
    }

    // Handle navigation keys with special logic for text inputs
    if (isNavigationKey) {
      // Only prevent default and navigate if we have results
      if (results.length > 0) {
        // Special handling for textarea - only navigate at boundaries
        if (event.target instanceof HTMLTextAreaElement) {
          const textarea = event.target as HTMLTextAreaElement;
          const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
          const atEnd = textarea.selectionStart === textarea.value.length;
          
          // Only navigate if at appropriate boundary or using non-arrow keys
          const shouldNavigate = 
            (event.key === 'ArrowUp' && atStart) ||
            (event.key === 'ArrowDown' && atEnd) ||
            event.key === 'Home' || 
            event.key === 'End' ||
            event.key === 'PageUp' || 
            event.key === 'PageDown';
          
          if (!shouldNavigate) {
            return; // Let textarea handle cursor movement
          }
        }
        
        // Prevent default to stop cursor movement in input
        event.preventDefault();
        
        // Execute navigation logic
        switch (event.key) {
          case 'ArrowDown':
            setSelectedIndex((selectedIndex + 1) % results.length);
            break;
          case 'ArrowUp':
            setSelectedIndex(selectedIndex === 0 ? results.length - 1 : selectedIndex - 1);
            break;
          case 'Home':
            setSelectedIndex(0);
            break;
          case 'End':
            setSelectedIndex(results.length - 1);
            break;
          case 'PageUp':
            setSelectedIndex(Math.max(0, selectedIndex - 5));
            break;
          case 'PageDown':
            setSelectedIndex(Math.min(results.length - 1, selectedIndex + 5));
            break;
        }
      }
      return;
    }

    // Handle non-navigation keys
    if (isTextInput && event.key !== 'Escape') {
      // Special case: Allow Enter to execute results only in input (not textarea)
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && results.length > 0 && results[selectedIndex]) {
        event.preventDefault();
        await onExecute(results[selectedIndex]);
      }
      return;
    }

    // Handle remaining non-navigation keys (when not in text input)
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (results.length > 0 && results[selectedIndex]) {
          await onExecute(results[selectedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        await onClose();
        break;

      default:
        // Let the input handle other keys
        break;
    }
  }, [selectedIndex, results, setSelectedIndex, onExecute, onClose]);

  useEffect(() => {
    // Add global keyboard listener
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
