import { useEffect, useCallback, useRef, startTransition } from 'react';
import { usesMetaKey } from '@/utils/shortcuts';
import type { SearchResult } from '../components/ResultsList';
import type { SearchMode } from '../components/ModeTabs';

const MODE_ORDER: SearchMode[] = ['file', 'ai'];

export interface UseKeyboardOptions {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  results: SearchResult[];
  onExecute: (result: SearchResult) => Promise<void>;
  onClose: () => Promise<void>;
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  onAskAbout?: (result: SearchResult) => void;
  onToggleHelp?: () => void;
  onOpenActionPanel?: (result: SearchResult) => void;
}

export function useKeyboard({
  selectedIndex,
  setSelectedIndex,
  results,
  onExecute,
  onClose,
  searchMode,
  setSearchMode,
  onAskAbout,
  onToggleHelp,
  onOpenActionPanel,
}: UseKeyboardOptions) {
  // Use refs to avoid re-registering the event listener on every state change
  const selectedIndexRef = useRef(selectedIndex);
  const resultsRef = useRef(results);
  const onExecuteRef = useRef(onExecute);
  const onCloseRef = useRef(onClose);
  const searchModeRef = useRef(searchMode);
  const setSearchModeRef = useRef(setSearchMode);
  const onAskAboutRef = useRef(onAskAbout);
  const onToggleHelpRef = useRef(onToggleHelp);
  const onOpenActionPanelRef = useRef(onOpenActionPanel);

  selectedIndexRef.current = selectedIndex;
  resultsRef.current = results;
  onExecuteRef.current = onExecute;
  onCloseRef.current = onClose;
  searchModeRef.current = searchMode;
  setSearchModeRef.current = setSearchMode;
  onAskAboutRef.current = onAskAbout;
  onToggleHelpRef.current = onToggleHelp;
  onOpenActionPanelRef.current = onOpenActionPanel;

  // Handle keyboard navigation
  const handleKeyDown = useCallback(async (event: KeyboardEvent) => {
    // Ignore events during IME composition (critical for Windows/macOS CJK input)
    if (event.isComposing) {
      return;
    }

    const NAVIGATION_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    const isNavigationKey = NAVIGATION_KEYS.includes(event.key);
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
    const isTextInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    const modifierKey = usesMetaKey() ? event.metaKey : event.ctrlKey;

    // Handle Tab key for mode cycling (Shift+Tab / Shift+Ctrl+Tab only)
    // Plain Tab always performs normal focus navigation
    if (event.key === 'Tab' && event.shiftKey && !event.altKey) {
      event.preventDefault();
      const currentIndex = MODE_ORDER.indexOf(searchModeRef.current);
      const newIndex = event.ctrlKey || event.metaKey
        ? (currentIndex - 1 + MODE_ORDER.length) % MODE_ORDER.length
        : (currentIndex + 1) % MODE_ORDER.length;
      setSearchModeRef.current(MODE_ORDER[newIndex]);
      return;
    }

    // Ctrl/Cmd+Shift+Enter: instantly switch to AI mode and ask about selected result (handle before modifier guard)
    if (event.key === 'Enter' && modifierKey && event.shiftKey && resultsRef.current.length > 0 && resultsRef.current[selectedIndexRef.current]) {
      event.preventDefault();
      onAskAboutRef.current?.(resultsRef.current[selectedIndexRef.current]);
      return;
    }

    // Ctrl/Cmd+N or Ctrl/Cmd+P: Emacs-style navigation (outside text input)
    if (modifierKey && !event.altKey && !event.shiftKey && !isTextInput) {
      if (event.key === 'n' && resultsRef.current.length > 0) {
        event.preventDefault();
        startTransition(() => setSelectedIndex((selectedIndexRef.current + 1) % resultsRef.current.length));
        return;
      }
      if (event.key === 'p' && resultsRef.current.length > 0) {
        event.preventDefault();
        startTransition(() => setSelectedIndex(selectedIndexRef.current === 0 ? resultsRef.current.length - 1 : selectedIndexRef.current - 1));
        return;
      }
      // Ctrl/Cmd+K: open action panel (outside text input)
      if (event.key === 'k') {
        event.preventDefault();
        if (resultsRef.current.length > 0 && resultsRef.current[selectedIndexRef.current]) {
          onOpenActionPanelRef.current?.(resultsRef.current[selectedIndexRef.current]);
        }
        return;
      }
      // Ctrl/Cmd+/: toggle shortcuts help (outside text input)
      if (event.key === '/') {
        event.preventDefault();
        onToggleHelpRef.current?.();
        return;
      }
    }

    // Skip navigation handling when modifier keys are pressed (for text editing shortcuts)
    if (hasModifier) {
      return;
    }

    // Handle navigation keys with special logic for text inputs
    if (isNavigationKey) {
      const currentResults = resultsRef.current;
      // Only prevent default and navigate if we have results
      if (currentResults.length > 0) {
        // Skip j/k navigation entirely when in text input - they should type normally
        if ((event.key === 'j' || event.key === 'k') && isTextInput) {
          return;
        }
        
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
        
        const currentSelectedIndex = selectedIndexRef.current;
        const currentResultsLength = currentResults.length;
        
        switch (event.key) {
          case 'ArrowDown':
            startTransition(() => setSelectedIndex((currentSelectedIndex + 1) % currentResultsLength));
            break;
          case 'ArrowUp':
            startTransition(() => setSelectedIndex(currentSelectedIndex === 0 ? currentResultsLength - 1 : currentSelectedIndex - 1));
            break;
          case 'Home':
            startTransition(() => setSelectedIndex(0));
            break;
          case 'End':
            startTransition(() => setSelectedIndex(currentResultsLength - 1));
            break;
          case 'PageUp':
            startTransition(() => setSelectedIndex(Math.max(0, currentSelectedIndex - 5)));
            break;
          case 'PageDown':
            startTransition(() => setSelectedIndex(Math.min(currentResultsLength - 1, currentSelectedIndex + 5)));
            break;
        }
      }
      return;
    }

    // Handle non-navigation keys
    if (isTextInput && event.key !== 'Escape') {
      // Special case: Allow Enter to execute results only in input (not textarea)
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && resultsRef.current.length > 0 && resultsRef.current[selectedIndexRef.current]) {
        event.preventDefault();
        await onExecuteRef.current(resultsRef.current[selectedIndexRef.current]);
      }
      return;
    }

    // Handle 1-9 for quick selection and execution (when not in text input)
    if (!isTextInput && /^[1-9]$/.test(event.key) && resultsRef.current.length > 0) {
      const index = parseInt(event.key) - 1;
      if (resultsRef.current[index]) {
        event.preventDefault();
        await onExecuteRef.current(resultsRef.current[index]);
      }
      return;
    }

    // Handle remaining non-navigation keys (when not in text input)
    switch (event.key) {
      case 'j': // Vim down (outside text input)
        if (resultsRef.current.length > 0) {
          event.preventDefault();
          startTransition(() => setSelectedIndex((selectedIndexRef.current + 1) % resultsRef.current.length));
        }
        break;
      case 'k': // Vim up (outside text input)
        if (resultsRef.current.length > 0) {
          event.preventDefault();
          startTransition(() => setSelectedIndex(selectedIndexRef.current === 0 ? resultsRef.current.length - 1 : selectedIndexRef.current - 1));
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (resultsRef.current.length > 0 && resultsRef.current[selectedIndexRef.current]) {
          await onExecuteRef.current(resultsRef.current[selectedIndexRef.current]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        // Note: child handlers (modals, overlays) should call e.stopPropagation()
        // on Escape before this global handler fires. See useMCPKeyboardShortcuts.ts,
        // RegionSelector.tsx for examples.
        await onCloseRef.current();
        break;

      default:
        // Let the input handle other keys
        break;
    }
  }, [setSelectedIndex]);

  useEffect(() => {
    // Add global keyboard listener
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}