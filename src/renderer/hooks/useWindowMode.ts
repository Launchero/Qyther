import { useState, useEffect, useCallback, useRef } from 'react';
import { SearchMode } from '../types/commandPalette';

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
  
  const [windowMode, setWindowMode] = useState<WindowMode>('expanded');
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current window mode on mount
  useEffect(() => {
    async function loadWindowMode() {
      try {
        const mode = await window.electronAPI.window.getMode();
        console.log('[useWindowMode] Initial window mode:', mode);
        setWindowMode(mode);
      } catch (error) {
        console.error('Failed to load window mode:', error);
      }
    }
    
    loadWindowMode();
  }, []);
  
  // Listen for mode changes from main process via IPC event (replaces polling)
  useEffect(() => {
    const handleModeChanged = (event: Event) => {
      const mode = (event as CustomEvent<WindowMode>).detail;
      if (mode !== windowMode) {
        console.log(`[useWindowMode] IPC mode change: ${windowMode} -> ${mode}`);
        setWindowMode(mode);
        setIsManuallyExpanded(mode === 'expanded');
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
          console.log(`[useWindowMode] Window shown - restored mode: ${mode}`);
        } catch (error) {
          console.error('Failed to load window mode on visibility change:', error);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  // Auto-expand/collapse logic with debounce and character threshold
  useEffect(() => {
    const queryLength = searchQuery.trim().length;
    
    // If user manually expanded, keep expanded regardless of query
    if (isManuallyExpanded) {
      if (windowMode !== 'expanded') {
        console.log(`[useWindowMode] Manually expanded: forcing expanded`);
        setWindowMode('expanded');
        window.electronAPI.window.setMode('expanded').catch(console.error);
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
      debounceTimerRef.current = setTimeout(() => {
        console.log(`[useWindowMode] Search query: "${searchQuery}", searchMode: ${searchMode}, targetMode: ${targetMode}`);
        setWindowMode(targetMode);
        window.electronAPI.window.setMode(targetMode).catch(console.error);
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
    setIsManuallyExpanded: setExpandedManually,
    setWindowMode: setMode,
    toggleMode,
  };
}
