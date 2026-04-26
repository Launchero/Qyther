import { useState, useEffect, useCallback, useRef } from 'react';
import { SearchMode } from '../types/commandPalette';
import { logInfo, logError } from '../utils/debugLogger';

export type WindowMode = 'compact' | 'expanded' | 'custom';

interface UseWindowModeOptions {
  searchQuery?: string;
  searchMode?: SearchMode;
}

const AUTO_EXPAND_CHAR_THRESHOLD = 2;
const AUTO_EXPAND_DEBOUNCE_MS = 150;

/**
 * Hook for managing window mode state
 * Uses IPC events instead of polling for mode change detection
 */
export function useWindowMode(options: UseWindowModeOptions = {}) {
  const { searchQuery = '', searchMode } = options;

  const [windowMode, setWindowMode] = useState<WindowMode>('compact');
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousModeRef = useRef<WindowMode>('compact');

  // Load current window mode on mount
  useEffect(() => {
    async function loadWindowMode() {
      try {
        const mode = await window.electronAPI.window.getMode();
        logInfo('[useWindowMode] Initial window mode:', mode);
        setWindowMode(mode);
      } catch (error) {
        logError('[useWindowMode] Failed to load window mode:', error);
      }
    }
    
    loadWindowMode();
  }, []);
  
  // Listen for mode changes from main process via IPC event (replaces polling)
  useEffect(() => {
    const handleModeChanged = (event: Event) => {
      const mode = (event as CustomEvent<WindowMode>).detail;
      if (mode !== windowMode) {
        // Trigger collapse flash when transitioning to compact from expanded
        if (mode === 'compact' && previousModeRef.current === 'expanded') {
          setIsCollapsing(true);
          setTimeout(() => setIsCollapsing(false), 600);
        }
        previousModeRef.current = mode;
        logInfo(`[useWindowMode] IPC mode change: ${windowMode} -> ${mode}`);
        // When mode is changed from main process (manual toggle), treat it as manual
        if (mode === 'expanded') {
          setIsManuallyExpanded(true);
        } else if (mode === 'compact') {
          setIsManuallyExpanded(false);
        }
        setWindowMode(mode);
      }
    };
    
    window.addEventListener('electron-window-mode-changed', handleModeChanged);
    return () => {
      window.removeEventListener('electron-window-mode-changed', handleModeChanged);
    };
  }, [windowMode]);
  
  // Sync state when window becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const mode = await window.electronAPI.window.getMode();
          if (mode === 'compact') {
            setIsManuallyExpanded(false);
          } else if (mode === 'expanded') {
            setIsManuallyExpanded(true);
          }
          setWindowMode(mode);
          logInfo(`[useWindowMode] Window shown - restored mode: ${mode}`);
        } catch (error) {
          logError('[useWindowMode] Failed to load window mode on visibility change:', error);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Clear manual expansion flag when search mode changes to allow fresh auto-expand/collapse logic
  useEffect(() => {
    setIsManuallyExpanded(false);
  }, [searchMode]);
  
  // Auto-expand/collapse logic with debounce and character threshold
  useEffect(() => {
    const queryLength = searchQuery.trim().length;
    
    // If user manually expanded, keep expanded regardless of query
    if (isManuallyExpanded) {
      if (windowMode !== 'expanded') {
        logInfo(`[useWindowMode] Manually expanded: forcing expanded`);
        setWindowMode('expanded');
        window.electronAPI.window.setMode('expanded').catch((e) => logError('[useWindowMode] Failed to set expanded mode:', e));
      }
      return;
    }
    
    // In AI mode, always expand immediately
    // In other modes, require minimum character threshold before expanding
    const isAskMode = searchMode === 'ai';
    const hasQuery = queryLength >= AUTO_EXPAND_CHAR_THRESHOLD;
    const targetMode = isAskMode || hasQuery ? 'expanded' : 'compact';

    // Debounce the mode change to prevent rapid toggling during typing
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (windowMode !== targetMode) {
      const willCollapse = targetMode === 'compact';
      debounceTimerRef.current = setTimeout(() => {
        logInfo(`[useWindowMode] Search query: "${searchQuery}", searchMode: ${searchMode}, targetMode: ${targetMode}`);
        // Flash collapse indicator so users understand what happened
        if (willCollapse && previousModeRef.current === 'expanded') {
          setIsCollapsing(true);
          setTimeout(() => setIsCollapsing(false), 600);
        }
        previousModeRef.current = targetMode;
        setWindowMode(targetMode);
        window.electronAPI.window.setMode(targetMode).catch((e) => logError('[useWindowMode] Failed to set mode:', e));
      }, AUTO_EXPAND_DEBOUNCE_MS);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, searchMode, isManuallyExpanded, windowMode]);

  const setMode = useCallback(async (mode: WindowMode) => {
    setWindowMode(mode);
    await window.electronAPI.window.setMode(mode);
  }, []);

  const toggleMode = useCallback(async () => {
    const newMode = windowMode === 'expanded' ? 'compact' : 'expanded';
    await setMode(newMode);
  }, [windowMode, setMode]);

  const setExpandedManually = useCallback((expanded: boolean) => {
    setIsManuallyExpanded(expanded);
  }, []);

  return {
    windowMode,
    isManuallyExpanded,
    isCollapsing,
    setIsManuallyExpanded: setExpandedManually,
    setWindowMode: setMode,
    toggleMode,
  };
}
