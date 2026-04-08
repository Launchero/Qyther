import { useState, useEffect, useCallback } from 'react';

export type WindowMode = 'compact' | 'expanded' | 'custom';

interface UseWindowModeOptions {
  searchQuery?: string;
}

/**
 * Hook for managing window mode state
 * Consolidates window mode polling, visibility sync, and auto-expand logic
 */
export function useWindowMode(options: UseWindowModeOptions = {}) {
  const { searchQuery = '' } = options;
  
  const [windowMode, setWindowMode] = useState<WindowMode>('expanded');
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);

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
  
  // Sync state when window becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const mode = await window.electronAPI.window.getMode();
          // Set isManuallyExpanded based on whether the mode is expanded
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
  
  // Listen for window mode changes (e.g., from Alt+Shift+M toggle)
  // Using polling with reduced frequency to avoid excessive IPC calls
  useEffect(() => {
    const checkModeChange = setInterval(async () => {
      try {
        const currentMode = await window.electronAPI.window.getMode();
        if (currentMode !== windowMode) {
          // Mode was changed externally (e.g., by keyboard shortcut)
          console.log(`[useWindowMode] Detected mode change: ${windowMode} -> ${currentMode}`);
          setWindowMode(currentMode);
          // Update isManuallyExpanded based on the new mode
          setIsManuallyExpanded(currentMode === 'expanded');
        }
      } catch (error) {
        // Ignore errors
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(checkModeChange);
  }, [windowMode]);
  
  // Auto-expand/collapse logic
  useEffect(() => {
    const hasQuery = searchQuery.trim().length > 0;
    
    // If user manually expanded, keep expanded regardless of query
    if (isManuallyExpanded) {
      if (windowMode !== 'expanded') {
        console.log(`[useWindowMode] Manually expanded: forcing expanded`);
        setWindowMode('expanded');
        window.electronAPI.window.setMode('expanded').catch(console.error);
      }
      return;
    }
    
    // Auto-expand when there's a query (but respect manual collapse)
    // If no query and not manually expanded, use compact mode
    const targetMode = hasQuery ? 'expanded' : 'compact';
    if (windowMode !== targetMode) {
      console.log(`[useWindowMode] Search query: "${searchQuery}", targetMode: ${targetMode}`);
      setWindowMode(targetMode);
      window.electronAPI.window.setMode(targetMode).catch(console.error);
    }
  }, [searchQuery, isManuallyExpanded]);

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
