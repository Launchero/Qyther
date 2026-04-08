import React from 'react';
import { CommandPalette } from './components/CommandPalette';
import { useKeyboard } from './hooks/useKeyboard';
import { useSearch } from './hooks/useSearch';
import { useFileSearch } from './hooks/useFileSearch';
import type { SearchResult } from './components/ResultsList';
import { useTheme } from './context/ThemeProvider';

// Import WindowMode type from preload types
type WindowMode = 'compact' | 'expanded' | 'custom';
type SearchMode = 'file' | 'ai' | 'code';
// Default commands for the palette
const DEFAULT_COMMANDS: SearchResult[] = [
  {
    id: 'cmd-quit',
    title: 'Quit App',
    subtitle: 'Close the application',
    icon: '⌘',
    type: 'command',
    action: 'quit',
  },
  {
    id: 'cmd-hide',
    title: 'Hide Window',
    subtitle: 'Hide this window',
    icon: '👁',
    type: 'command',
    action: 'hide',
  }
];

export function App() {
  const { toggleTheme } = useTheme();
  const [apps, setApps] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [windowMode, setWindowMode] = React.useState<WindowMode>('expanded');
  const [isManuallyExpanded, setIsManuallyExpanded] = React.useState(false);
  const [executingId, setExecutingId] = React.useState<string | null>(null);
  const [searchMode, setSearchMode] = React.useState<SearchMode>('file');
  
  // Debug: Log on mount
  React.useEffect(() => {
    const hasElectronAPI = !!window.electronAPI;
    const hasWindowProp = !!window.electronAPI?.window;
    const hasAppsProp = !!window.electronAPI?.apps;
    
    console.log('[App] Mounted! window.electronAPI exists:', hasElectronAPI);
    console.log('[App] window.electronAPI.window exists:', hasWindowProp);
    console.log('[App] window.electronAPI.apps exists:', hasAppsProp);
    
    // Debug logging to external server disabled
  }, []);
  
  // Fetch current window mode on mount
  React.useEffect(() => {
    async function loadWindowMode() {
      try {
        console.log('[App] About to call window.electronAPI.window.getMode()');
        fetch('http://127.0.0.1:7593/ingest/711a8501-3d31-485b-8bdd-ee2778fa3e69',{
          method:'POST',
          headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0162f'},
          body:JSON.stringify({
            sessionId:'e0162f',
            id:`loadWindowMode_${Date.now()}`,
            timestamp:Date.now(),
            location:'App.tsx:55',
            message:'About to load window mode',
            data: { has_electronAPI: !!window.electronAPI, has_window: !!window.electronAPI?.window },
            runId:'initial',
            hypothesisId:'B'
          })
        }).catch(()=>{});
        
        const mode = await window.electronAPI.window.getMode();
        console.log('[App] Initial window mode:', mode);
        setWindowMode(mode);
      } catch (error) {
        console.error('Failed to load window mode:', error);
        fetch('http://127.0.0.1:7593/ingest/711a8501-3d31-485b-8bdd-ee2778fa3e69',{
          method:'POST',
          headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0162f'},
          body:JSON.stringify({
            sessionId:'e0162f',
            id:`loadWindowMode_error_${Date.now()}`,
            timestamp:Date.now(),
            location:'App.tsx:62',
            message:'Failed to load window mode',
            data: { error: String(error), has_electronAPI: !!window.electronAPI, has_window: !!window.electronAPI?.window },
            runId:'initial',
            hypothesisId:'B'
          })
        }).catch(()=>{});
      }
    }
    
    loadWindowMode();
  }, []);
  
  // Sync state when window becomes visible
  React.useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Load the current window mode from main process to sync state
        try {
          const mode = await window.electronAPI.window.getMode();
          // Set isManuallyExpanded based on whether the mode is expanded and there's no query
          // We check the window mode directly rather than relying on local state
          if (mode === 'compact') {
            setIsManuallyExpanded(false);
          } else if (mode === 'expanded') {
            setIsManuallyExpanded(true);
          }
          setWindowMode(mode);
          console.log(`[App] Window shown - restored mode: ${mode}`);
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
  React.useEffect(() => {
    const checkModeChange = setInterval(async () => {
      try {
        const currentMode = await window.electronAPI.window.getMode();
        if (currentMode !== windowMode) {
          // Mode was changed externally (e.g., by keyboard shortcut)
          console.log(`[App] Detected mode change: ${windowMode} -> ${currentMode}`);
          setWindowMode(currentMode);
          // Update isManuallyExpanded based on the new mode
          setIsManuallyExpanded(currentMode === 'expanded');
        }
      } catch (error) {
        // Ignore errors
      }
    }, 500); // Check every 500ms instead of 100ms to reduce IPC traffic
    
    return () => clearInterval(checkModeChange);
  }, [windowMode]);
  
  // Listen for theme toggle shortcut (Alt+Shift+T)
  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Check for Alt+Shift+T
      if (event.altKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        toggleTheme();
        console.log('[App] Theme toggled via keyboard shortcut');
      }
      
      // Check for mode switching shortcuts (⌘1, ⌘2, ⌘3 or Ctrl+1/2/3)
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        if (event.key === '1') {
          event.preventDefault();
          console.log('[App] Switching to File Search mode');
          // Mode switching handled by SearchBar component
        } else if (event.key === '2') {
          event.preventDefault();
          console.log('[App] Switching to AI Assistant mode');
          // Mode switching handled by SearchBar component
        } else if (event.key === '3') {
          event.preventDefault();
          console.log('[App] Switching to Code Search mode');
          // Mode switching handled by SearchBar component
        }
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [toggleTheme]);
  
  // Fetch installed applications on mount
  React.useEffect(() => {
    async function loadApps() {
      try {
        console.log('[App] About to call window.electronAPI.apps.list()');
        fetch('http://127.0.0.1:7593/ingest/711a8501-3d31-485b-8bdd-ee2778fa3e69',{
          method:'POST',
          headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0162f'},
          body:JSON.stringify({
            sessionId:'e0162f',
            id:`loadApps_${Date.now()}`,
            timestamp:Date.now(),
            location:'App.tsx:106',
            message:'About to load apps',
            data: { has_electronAPI: !!window.electronAPI, has_apps: !!window.electronAPI?.apps },
            runId:'initial',
            hypothesisId:'B'
          })
        }).catch(()=>{});
        
        const appList = await window.electronAPI.apps.list();
        const appResults: SearchResult[] = appList.map((app: { name: string; path: string }, index: number) => ({
          id: `app-${index}`,
          title: app.name,
          subtitle: 'Application',
          icon: '🚀',
          type: 'app',
          action: app.path,
        }));
        setApps(appResults);
      } catch (error) {
        console.error('Failed to load apps:', error);
        fetch('http://127.0.0.1:7593/ingest/711a8501-3d31-485b-8bdd-ee2778fa3e69',{
          method:'POST',
          headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0162f'},
          body:JSON.stringify({
            sessionId:'e0162f',
            id:`loadApps_error_${Date.now()}`,
            timestamp:Date.now(),
            location:'App.tsx:119',
            message:'Failed to load apps',
            data: { error: String(error), has_electronAPI: !!window.electronAPI, has_apps: !!window.electronAPI?.apps },
            runId:'initial',
            hypothesisId:'B'
          })
        }).catch(()=>{});
      } finally {
        setIsLoading(false);
      }
    }
    
    loadApps();
  }, []);

  // Combine commands and apps
  const allItems = React.useMemo(() => {
    return [...DEFAULT_COMMANDS, ...apps];
  }, [apps]);

  // Search hooks
  const {
    searchQuery,
    setSearchQuery,
    results: baseResults,
    selectedIndex,
    setSelectedIndex,
  } = useSearch(allItems);

  // File search hook - only enabled when there's a query AND not in AI mode
  const {
    fileResults,
    isLoading: isFileSearchLoading,
    error: fileSearchError,
  } = useFileSearch(searchQuery, {
    enabled: searchQuery.trim().length > 0 && searchMode !== 'ai',
    debounceMs: 300,
    maxResults: 50,
  });

  // Combine base results (commands/apps) with file results
  const results = React.useMemo(() => {
    // Prioritize file results when there's a search query
    if (searchQuery.trim().length > 0 && fileResults.length > 0) {
      // Show file results first, then base results
      return [...fileResults, ...baseResults];
    }
    return baseResults;
  }, [baseResults, fileResults, searchQuery]);

  // Auto-expand/collapse logic
  React.useEffect(() => {
    const hasQuery = searchQuery.trim().length > 0;
    
    // Access electronAPI from window with type assertion
    const win = window as any;
    const electronAPI = win.electronAPI;
    
    if (!electronAPI || !electronAPI.window) {
      console.error('[Renderer] electronAPI or electronAPI.window is undefined!');
      return;
    }
    
    // If user manually expanded, keep expanded regardless of query
    if (isManuallyExpanded) {
      if (windowMode !== 'expanded') {
        console.log(`[Renderer] Manually expanded: forcing expanded`);
        setWindowMode('expanded');
        electronAPI.window.setMode('expanded').catch(console.error);
      }
      return;
    }
    
    // Auto-expand when there's a query (but respect manual collapse via isManuallyExpanded)
    // If no query and not manually expanded, use compact mode
    const targetMode = hasQuery ? 'expanded' : 'compact';
    if (windowMode !== targetMode) {
      console.log(`[Renderer] Search query: "${searchQuery}", targetMode: ${targetMode}`);
      setWindowMode(targetMode);
      
    electronAPI.window.setMode(targetMode).catch((err: Error) => {
      console.error('[Renderer] Error setting mode:', err);
    });
  }
  }, [searchQuery, isManuallyExpanded]);

  // Keyboard navigation hook
  useKeyboard({
    selectedIndex,
    setSelectedIndex,
    results,
    onExecute: async (result) => {
      console.log('Executing:', result);
      
      // Set executing state
      setExecutingId(result.id);
      
      try {
        if (result.type === 'command') {
          if (result.action === 'quit') {
            await window.electronAPI.quit();
          } else if (result.action === 'hide') {
            await window.electronAPI.window.hide();
          }
        } else if (result.type === 'url') {
          await window.electronAPI.url.open(result.action!);
          await window.electronAPI.window.hide();
        } else if (result.type === 'app') {
          // On Windows, just open the path
          await window.electronAPI.file.open(result.action!);
          await window.electronAPI.window.hide();
        } else if (result.type === 'file') {
          // Open file or folder
          await window.electronAPI.file.open(result.action!);
          await window.electronAPI.window.hide();
        }
      } catch (error) {
        console.error('Execution error:', error);
      } finally {
        // Clear executing state after a delay
        setTimeout(() => setExecutingId(null), 500);
      }
    },
    onClose: async () => {
      await window.electronAPI.window.hide();
    },
  });

  return (
    <div className="app">
      <div className="app-backdrop visible" />
      <CommandPalette
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        results={isLoading ? [] : results}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onExecute={async (result) => {
          console.log('Executing:', result);
          
          setExecutingId(result.id);
          
          try {
            if (result.type === 'command') {
              if (result.action === 'quit') {
                await window.electronAPI.quit();
              } else if (result.action === 'hide') {
                await window.electronAPI.window.hide();
              }
            } else if (result.type === 'url') {
              await window.electronAPI.url.open(result.action!);
              await window.electronAPI.window.hide();
            } else if (result.type === 'app') {
              await window.electronAPI.file.open(result.action!);
              await window.electronAPI.window.hide();
            } else if (result.type === 'file') {
              await window.electronAPI.file.open(result.action!);
              await window.electronAPI.window.hide();
            }
          } catch (error) {
            console.error('Execution error:', error);
          } finally {
            setTimeout(() => setExecutingId(null), 500);
          }
        }}
        currentMode={windowMode}
        executingId={executingId}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
      />
      {isLoading && (
        <div className="loading-indicator">
          <p>Loading applications...</p>
        </div>
      )}
      {isFileSearchLoading && searchQuery.trim().length > 0 && (
        <div className="loading-indicator">
          <p>Searching files...</p>
        </div>
      )}
      {fileSearchError && searchQuery.trim().length > 0 && (
        <div className="error-indicator">
          <p>File search unavailable: {fileSearchError}</p>
        </div>
      )}
    </div>
  );
}
