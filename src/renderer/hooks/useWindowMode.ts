import { useState, useEffect, useCallback, useRef } from 'react';
import { SearchMode } from '../types/commandPalette';
import { logInfo, logError } from '../utils/debugLogger';
import { motionDurationMs } from '../utils/motion';

export type WindowMode = 'compact' | 'expanded' | 'custom';

interface UseWindowModeOptions {
  searchQuery?: string;
  searchMode?: SearchMode;
}

const AUTO_EXPAND_CHAR_THRESHOLD = 2;
const AUTO_EXPAND_DEBOUNCE_MS = 150;
/** The token `.collapse-flash` animates on (`--animate-collapse-flash` composes `--duration-500`).
 *  Read per flash rather than frozen at import, so the flag is gone the moment the class is — and
 *  under reduced motion, where the scale is zeroed, the flag does not hold for 500ms of nothing. */
const COLLAPSE_FLASH_DURATION = '--duration-500';

/**
 * The renderer's mirror of the window mode — a read-only projection of main.
 *
 * **Main owns the value.** It is written in exactly one place (`adopt`), fed by the mount snapshot
 * and by `window:modeChanged` pushes. This hook also *requests* modes (auto-expand on typing, AI
 * mode), but a request never writes state: the previous shape set `windowMode` optimistically
 * before the IPC round-tripped, so the palette laid out for a height main had not agreed to and
 * two owners existed for one fact — with main's echo then discarded by `mode !== windowMode`,
 * because the renderer had already guessed it. Requesting without adopting is what makes main's
 * answer the thing the UI actually renders.
 *
 * Nothing here re-fetches on visibility either. That resync used to overwrite the mode every time
 * the window came up, clobbering a change that was still in flight; main pushes `modeChanged`
 * whether or not the window is visible, so the push is the sync.
 */
export function useWindowMode(options: UseWindowModeOptions = {}) {
  const { searchQuery = '', searchMode } = options;

  const [windowMode, setWindowMode] = useState<WindowMode>('compact');
  const [isCollapsing, setIsCollapsing] = useState(false);
  /** Policy, not state: an expansion main announced is not auto-collapsed by an empty query. */
  const [announcedExpanded, setAnnouncedExpanded] = useState(false);
  // Mirrors for the effects that must not re-subscribe when the value changes.
  const modeRef = useRef<WindowMode>('compact');
  /**
   * The last mode this hook asked main for, so main's echo of it is not mistaken for the user
   * taking over. Dropping the optimistic write means every auto-expand now arrives as a push, and a
   * push is exactly what marks an expansion "manual" — without this the palette would expand on two
   * keystrokes and then never collapse again, because its own request would have muted the policy
   * forever. (The old code got this right by accident: it wrote state first, so `mode !== windowMode`
   * discarded the echo before the manual flag was set.)
   */
  const requestedRef = useRef<WindowMode | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  const adopt = useCallback((mode: WindowMode) => {
    if (mode === modeRef.current) return;
    if (mode === 'compact' && modeRef.current === 'expanded') {
      setIsCollapsing(true);
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = setTimeout(
        () => setIsCollapsing(false),
        motionDurationMs(COLLAPSE_FLASH_DURATION, 500),
      );
    }
    const selfRequested = requestedRef.current === mode;
    requestedRef.current = null;
    modeRef.current = mode;
    setWindowMode(mode);
    // A mode main moved on its own (Alt+Shift+M, a tray action) survives the query; one the policy
    // asked for does not.
    if (!selfRequested) setAnnouncedExpanded(mode === 'expanded');
  }, []);

  // Snapshot on mount, then the pushes are the only other writer.
  useEffect(() => {
    window.electronAPI.window
      .getMode()
      .then((mode) => {
        logInfo('[useWindowMode] Initial window mode:', mode);
        // The state starts at 'compact', so adopting 'compact' would be a no-op and the ref would
        // never learn the restored mode. Seed the ref from the answer, not from the guard.
        modeRef.current = mode;
        setWindowMode(mode);
        setAnnouncedExpanded(mode === 'expanded');
      })
      .catch((error) => logError('[useWindowMode] Failed to load window mode:', error));
  }, []);

  useEffect(() => {
    const handleModeChanged = (event: Event) => {
      adopt((event as CustomEvent<WindowMode>).detail);
    };
    window.addEventListener('electron-window-mode-changed', handleModeChanged);
    return () => {
      window.removeEventListener('electron-window-mode-changed', handleModeChanged);
    };
  }, [adopt]);

  // A view swap re-arms the auto-expand policy from scratch.
  useEffect(() => {
    setAnnouncedExpanded(false);
  }, [searchMode]);

  // Auto-expand/collapse policy: it asks main, it never decides.
  useEffect(() => {
    const queryLength = searchQuery.trim().length;

    if (announcedExpanded) {
      // An expansion main announced survives the query, so there is nothing to request: the value
      // is already 'expanded', because the only writer of that flag is the same path that adopted
      // the mode.
      return;
    }

    const targetMode = searchMode === 'ai' || queryLength >= AUTO_EXPAND_CHAR_THRESHOLD ? 'expanded' : 'compact';
    if (modeRef.current === targetMode) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      requestedRef.current = targetMode;
      logInfo(`[useWindowMode] requesting ${targetMode} (query "${searchQuery}", mode ${searchMode})`);
      window.electronAPI.window
        .setMode(targetMode)
        .catch((e) => logError('[useWindowMode] Failed to request mode:', e));
    }, AUTO_EXPAND_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchQuery, searchMode, announcedExpanded]);

  return { windowMode, isCollapsing };
}
