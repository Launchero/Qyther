import { useCallback, useEffect, useRef } from 'react';
import type { SearchMode } from '../components/ModeTabs';

export interface FocusManagerConfig {
  searchMode: SearchMode;
  windowMode: 'compact' | 'expanded' | 'custom';
}

type InputRegistry = Map<string, React.RefObject<HTMLElement | null>>;

/**
 * The single input the palette owns per mode, resolved against what is actually mounted:
 * - file mode (any windowMode) -> SearchBar's `#search-input`
 * - ai mode -> the UnifiedCommandBar textarea. In compact/custom that textarea is not
 *   mounted yet (useWindowMode auto-expands Ask mode behind a 150ms debounce), so the
 *   request stays pending until the component registers itself.
 */
function resolveTargetName(searchMode: SearchMode): string {
  return searchMode === 'ai' ? 'unified-command' : 'searchbar';
}

/**
 * A parked focus node is only restorable when it is a live, editable element of this
 * document and not `<body>`. When the frame is not the foreground window at hide time the
 * active element IS `<body>`, and `document.body.focus()` is a no-op that would swallow
 * the whole show.
 */
function isRestorableFocus(node: Element | null): node is HTMLElement {
  if (!(node instanceof HTMLElement) || node === document.body || !document.contains(node)) {
    return false;
  }
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    node.isContentEditable
  );
}

/**
 * Centralized focus manager for mode switching and window show/hide.
 *
 * The `electron-window-shown` / `electron-window-will-hide` routing lives here rather than
 * in SearchBar, because the header unmounts SearchBar in Ask mode — a listener there can
 * never focus the Ask textarea.
 */
export function useFocusManager({ searchMode, windowMode }: FocusManagerConfig) {
  const registryRef = useRef<InputRegistry>(new Map());
  const parkedFocusRef = useRef<Element | null>(null);
  const pendingFocusRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  /**
   * The last editable element that actually held focus, captured while it was still connected.
   * A surface closing (mode swap, Ask unmount, an overlay dismissing) hands focus back to
   * `<body>`, and the mode-landing effect below restores from here instead of re-requesting a
   * target the user never left. Separate from `parkedFocusRef`, which is the window hide/show
   * park and must not be overwritten by an in-window swap.
   */
  const lastFocusedRef = useRef<Element | null>(null);
  const targetNameRef = useRef<string>(resolveTargetName(searchMode));
  targetNameRef.current = resolveTargetName(searchMode);

  /** Focus the input the active mode owns. False means it is not mounted yet. */
  const focusInput = useCallback((): boolean => {
    const node = registryRef.current.get(targetNameRef.current)?.current;
    if (node && document.contains(node)) {
      node.focus();
      pendingFocusRef.current = false;
      return true;
    }
    return false;
  }, []);

  /** Focus on the next frame, or the moment the target input registers itself. */
  const requestFocus = useCallback(() => {
    pendingFocusRef.current = true;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (pendingFocusRef.current) {
        focusInput();
      }
    });
  }, [focusInput]);

  const registerInput = useCallback(
    (name: string, ref: React.RefObject<HTMLElement | null>) => {
      registryRef.current.set(name, ref);
      if (pendingFocusRef.current && name === targetNameRef.current) {
        pendingFocusRef.current = false;
        ref.current?.focus();
      }
      return () => {
        registryRef.current.delete(name);
      };
    },
    [],
  );

  // Show/hide focus contract: summoning the palette must land the caret in the input of
  // the current mode, never leave it on `<body>` where the keystrokes go to the app behind.
  useEffect(() => {
    const handleWindowWillHide = () => {
      const active = document.activeElement;
      parkedFocusRef.current = active && active !== document.body ? active : null;
      pendingFocusRef.current = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const handleWindowShown = () => {
      const parked = parkedFocusRef.current;
      if (isRestorableFocus(parked)) {
        parked.focus();
        return;
      }
      requestFocus();
    };

    window.addEventListener('electron-window-will-hide', handleWindowWillHide);
    window.addEventListener('electron-window-shown', handleWindowShown);
    return () => {
      window.removeEventListener('electron-window-will-hide', handleWindowWillHide);
      window.removeEventListener('electron-window-shown', handleWindowShown);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [requestFocus]);

  // Capture the live focus owner after every commit. Runs before the effect below on the same
  // commit, and a swap that unmounted the focused element leaves `activeElement` as `<body>`,
  // which `isRestorableFocus` rejects, so the snapshot keeps the last element that was real.
  useEffect(() => {
    if (isRestorableFocus(document.activeElement)) {
      lastFocusedRef.current = document.activeElement;
    }
  });

  // Re-assert focus when the mode actually lands: the shown event can fire while the
  // compact->expanded IPC is still debounced, i.e. before the Ask textarea exists.
  useEffect(() => {
    const dropped = document.activeElement === null || document.activeElement === document.body;
    const previous = lastFocusedRef.current;
    if (dropped && isRestorableFocus(previous)) {
      // A surface closed and its input survived the swap: hand focus back instead of
      // re-pointing at the mode default. Only fires when focus actually fell to `<body>`,
      // so it can never pull the caret out of a dialog that still holds it.
      previous.focus();
      pendingFocusRef.current = false;
      return;
    }
    requestFocus();
  }, [searchMode, windowMode, requestFocus]);

  return { registerInput, focusInput, requestFocus };
}
