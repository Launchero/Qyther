import { useEffect, useCallback, useRef, startTransition } from 'react';
import { usesMetaKey } from '@/utils/shortcuts';
import { getActionsForItem } from '@/utils/fileActions';
import type { SearchResult } from '../components/ResultsList';
import type { SearchMode } from '../components/ModeTabs';

const MODE_ORDER: SearchMode[] = ['file', 'ai'];

/**
 * Home and End are caret movement while the user is typing — never steal them from a field.
 */
function isCaretKey(event: KeyboardEvent, isTextInput: boolean): boolean {
  return isTextInput && (event.key === 'Home' || event.key === 'End');
}

/**
 * A floating surface in this document owns Escape. Radix dismisses its own surface on Escape
 * unless the event is defaultPrevented, and this hook listens on `document` — which runs
 * before any child `window` listener (useMCPKeyboardShortcuts.ts binds to `window`), so a
 * DOM check is the only backstop that holds for every modal the palette can open.
 *
 * `[role="dialog"]` alone was too narrow: `DropdownMenu` content carries `role="menu"` and a
 * `Tooltip` carries no role at all, so Escape hid the whole window with the menu still open.
 * `[data-radix-popper-content-wrapper]` is the anchor Radix gives every popped surface
 * (tooltip, popover, dropdown), and it only exists while one is mounted.
 */
const ESCAPE_OWNERS =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]';

function isDialogOpen(): boolean {
  return document.querySelector(ESCAPE_OWNERS) !== null;
}

/**
 * Tier-1 precondition: a surface owns the key. App-tracked controlled dialogs
 * (`isModalOpen`) are checked first so a mounted-but-query-missed dialog can
 * never fall through to tier-2/3; the DOM query remains the backstop for
 * Radix-managed surfaces App never sees (menus, tooltips, popovers).
 */
function dialogOwnsKey(modalOpen: boolean): boolean {
  return modalOpen || isDialogOpen();
}

/**
 * The keydown target is inside a native-clickable surface. Keyboard Enter/1-9
 * must not also fire onExecute there — the native click already handles it,
 * and firing both executes the row twice (Ask-button double-fire).
 */
function isInteractiveTarget(event: KeyboardEvent): boolean {
  return (
    event.target instanceof HTMLElement &&
    event.target.closest('button,a,[role="button"]') !== null
  );
}

export interface UseKeyboardOptions {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  results: SearchResult[];
  searchQuery: string;
  onClearQuery: () => void;
  onExecute: (result: SearchResult) => Promise<void>;
  onClose: () => Promise<void>;
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  onAskAbout?: (result: SearchResult) => void;
  onToggleHelp?: () => void;
  onOpenActionPanel?: (result: SearchResult) => void;
  onToggleSettings?: () => void;
  onNavigateHistory?: (direction: 'up' | 'down') => void;
  /** App-tracked controlled dialogs (action panel, settings, shortcuts). See dialogOwnsKey. */
  isModalOpen?: boolean;
}

export function useKeyboard({
  selectedIndex,
  setSelectedIndex,
  results,
  searchQuery,
  onClearQuery,
  onExecute,
  onClose,
  searchMode,
  setSearchMode,
  onAskAbout,
  onToggleHelp,
  onOpenActionPanel,
  onToggleSettings,
  onNavigateHistory,
  isModalOpen = false,
}: UseKeyboardOptions) {
  // Use refs to avoid re-registering the event listener on every state change
  const selectedIndexRef = useRef(selectedIndex);
  const resultsRef = useRef(results);
  const searchQueryRef = useRef(searchQuery);
  const onClearQueryRef = useRef(onClearQuery);
  const onExecuteRef = useRef(onExecute);
  const onCloseRef = useRef(onClose);
  const searchModeRef = useRef(searchMode);
  const setSearchModeRef = useRef(setSearchMode);
  const onAskAboutRef = useRef(onAskAbout);
  const onToggleHelpRef = useRef(onToggleHelp);
  const onOpenActionPanelRef = useRef(onOpenActionPanel);
  const onToggleSettingsRef = useRef(onToggleSettings);
  const onNavigateHistoryRef = useRef(onNavigateHistory);
  const isModalOpenRef = useRef(isModalOpen);

  selectedIndexRef.current = selectedIndex;
  resultsRef.current = results;
  searchQueryRef.current = searchQuery;
  onClearQueryRef.current = onClearQuery;
  onExecuteRef.current = onExecute;
  onCloseRef.current = onClose;
  searchModeRef.current = searchMode;
  setSearchModeRef.current = setSearchMode;
  onAskAboutRef.current = onAskAbout;
  onToggleHelpRef.current = onToggleHelp;
  onOpenActionPanelRef.current = onOpenActionPanel;
  onToggleSettingsRef.current = onToggleSettings;
  onNavigateHistoryRef.current = onNavigateHistory;
  isModalOpenRef.current = isModalOpen;

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
    // Plain Tab always performs normal focus navigation.
    // A dialog owns Tab for focus nav — cycle nothing while one is open.
    if (event.key === 'Tab' && event.shiftKey && !event.altKey) {
      if (dialogOwnsKey(isModalOpenRef.current)) {
        return;
      }
      event.preventDefault();
      const currentIndex = MODE_ORDER.indexOf(searchModeRef.current);
      const newIndex = event.ctrlKey || event.metaKey
        ? (currentIndex - 1 + MODE_ORDER.length) % MODE_ORDER.length
        : (currentIndex + 1) % MODE_ORDER.length;
      setSearchModeRef.current(MODE_ORDER[newIndex]);
      return;
    }

    // Ctrl/Cmd+Shift+Enter: instantly switch to AI mode and ask about selected result (handle before modifier guard)
    // Blocked while a dialog is open — the dialog owns Enter.
    if (event.key === 'Enter' && modifierKey && event.shiftKey && resultsRef.current.length > 0 && resultsRef.current[selectedIndexRef.current]) {
      if (dialogOwnsKey(isModalOpenRef.current)) {
        return;
      }
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
    }

    // Ctrl/Cmd+K: open action panel (inside and outside text input).
    // Bails while a dialog is open so panels never stack modals.
    if (modifierKey && !event.altKey && !event.shiftKey && event.key === 'k') {
      if (dialogOwnsKey(isModalOpenRef.current)) {
        return;
      }
      event.preventDefault();
      if (resultsRef.current.length > 0 && resultsRef.current[selectedIndexRef.current]) {
        onOpenActionPanelRef.current?.(resultsRef.current[selectedIndexRef.current]);
      }
      return;
    }

    // Ctrl/Cmd+/: toggle shortcuts help. Unlike the block above it also fires inside a text
    // field: the palette keeps focus in its own input and no editor binds Ctrl+/.
    if (modifierKey && !event.altKey && !event.shiftKey && event.key === '/') {
      event.preventDefault();
      onToggleHelpRef.current?.();
      return;
    }

    // Ctrl/Cmd+,: toggle settings (not while typing in a field — settings is a global action).
    if (modifierKey && !event.altKey && !event.shiftKey && event.key === ',') {
      event.preventDefault();
      onToggleSettingsRef.current?.();
      return;
    }

    // Ctrl/Cmd+Shift+Q: quit the application.
    if (modifierKey && event.shiftKey && event.key === 'Q') {
      event.preventDefault();
      void window.electronAPI.quit();
      return;
    }

    // Ctrl/Cmd+Shift+C: copy path/URL of the selected result (file mode only).
    // Ctrl/Cmd+Shift+F: reveal the selected result in its folder (file mode only).
    // Both sit before the modifier guard and bail when a dialog owns the key,
    // so typing in a modal never copies or reveals the background selection.
    // In AI mode AskModeExpanded owns Ctrl+Shift+C for copying the last response.
    if (modifierKey && event.shiftKey && (event.key === 'C' || event.key === 'F')) {
      if (searchModeRef.current !== 'file' || dialogOwnsKey(isModalOpenRef.current)) {
        return;
      }
      const selected = resultsRef.current[selectedIndexRef.current];
      if (selected) {
        event.preventDefault();
        const wantedId = event.key === 'C'
          ? (selected.type === 'url' ? 'copy-url' : selected.type === 'command' ? 'copy-name' : 'copy-path')
          : 'reveal-in-folder';
        const action = getActionsForItem(selected).find((a) => a.id === wantedId);
        await action?.handler(selected);
      }
      return;
    }

    // Skip navigation handling when modifier keys are pressed (for text editing shortcuts)
    if (hasModifier) {
      return;
    }

    // Handle navigation keys with special logic for text inputs.
    // A dialog owns the list while open — background navigation stays put.
    if (isNavigationKey) {
      if (dialogOwnsKey(isModalOpenRef.current)) {
        return;
      }
      const currentResults = resultsRef.current;
      // Inside a field, Home/End belong to the caret — the list must not hijack them
      if (isCaretKey(event, isTextInput)) {
        return;
      }

      // Search history navigation: in file mode only, when input is empty and the
      // user presses ArrowUp/Down, cycle through previous searches instead of
      // navigating results. AI mode owns ArrowUp on empty input for editing the
      // last user message (AskModeExpanded), so this branch must not fire there.
      if (isTextInput && searchModeRef.current === 'file' && searchQueryRef.current.trim() === '' && 
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        onNavigateHistoryRef.current?.(event.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }

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
        if (dialogOwnsKey(isModalOpenRef.current)) {
          return;
        }
        if (isInteractiveTarget(event)) {
          return;
        }
        event.preventDefault();
        await onExecuteRef.current(resultsRef.current[selectedIndexRef.current]);
      }
      return;
    }

    // Handle 1-9 for quick selection and execution (when not in text input).
    // Skipped while a dialog is open; a clickable target owns the key.
    if (!isTextInput && /^[1-9]$/.test(event.key) && resultsRef.current.length > 0) {
      if (dialogOwnsKey(isModalOpenRef.current)) {
        return;
      }
      if (isInteractiveTarget(event)) {
        return;
      }
      const index = parseInt(event.key) - 1;
      if (resultsRef.current[index]) {
        event.preventDefault();
        await onExecuteRef.current(resultsRef.current[index]);
      }
      return;
    }

    // Handle remaining non-navigation keys (when not in text input)
    switch (event.key) {
      case 'j': // Vim down (outside text input; skipped while a dialog is open)
        if (dialogOwnsKey(isModalOpenRef.current)) {
          return;
        }
        if (resultsRef.current.length > 0) {
          event.preventDefault();
          startTransition(() => setSelectedIndex((selectedIndexRef.current + 1) % resultsRef.current.length));
        }
        break;
      case 'k': // Vim up (outside text input; skipped while a dialog is open)
        if (dialogOwnsKey(isModalOpenRef.current)) {
          return;
        }
        if (resultsRef.current.length > 0) {
          event.preventDefault();
          startTransition(() => setSelectedIndex(selectedIndexRef.current === 0 ? resultsRef.current.length - 1 : selectedIndexRef.current - 1));
        }
        break;
      case 'Enter':
        if (dialogOwnsKey(isModalOpenRef.current)) {
          return;
        }
        if (isInteractiveTarget(event)) {
          return;
        }
        event.preventDefault();
        if (resultsRef.current.length > 0 && resultsRef.current[selectedIndexRef.current]) {
          await onExecuteRef.current(resultsRef.current[selectedIndexRef.current]);
        }
        break;

      case 'Escape': {
        // Escape ordering: an open dialog owns the key, then the query, then the window.
        // Bail without preventDefault so Radix closes its own dialog; otherwise a single
        // keystroke would dismiss the dialog AND hide the palette.
        if (dialogOwnsKey(isModalOpenRef.current)) {
          return;
        }
        event.preventDefault();
        if (searchQueryRef.current.trim().length > 0) {
          onClearQueryRef.current();
          return;
        }
        // Not a dialog: Escape still ends in onClose -> window.electronAPI.window.hide()
        await onCloseRef.current();
        break;
      }

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