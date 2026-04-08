import React from 'react';
import { CommandPalette } from './components/CommandPalette';
import { useKeyboard } from './hooks/useKeyboard';
import { useSearch } from './hooks/useSearch';
import { useFileSearch } from './hooks/useFileSearch';
import { useCommandExecution } from './hooks/useCommandExecution';
import { useWindowMode } from './hooks/useWindowMode';
import type { SearchResult } from './components/ResultsList';
import { useTheme } from './context/ThemeProvider';

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
  
  // Use custom hooks for state management
  const { windowMode, isManuallyExpanded, setIsManuallyExpanded } = useWindowMode();
  const { executingId, execute } = useCommandExecution();
  const [searchMode, setSearchMode] = React.useState<SearchMode>('file');
  
  // Debug: Log on mount
  React.useEffect(() => {
    const hasElectronAPI = !!window.electronAPI;
    const hasWindowProp = !!window.electronAPI?.window;
    const hasAppsProp = !!window.electronAPI?.apps;
    
    console.log('[App] Mounted! window.electronAPI exists:', hasElectronAPI);
    console.log('[App] window.electronAPI.window exists:', hasWindowProp);
    console.log('[App] window.electronAPI.apps exists:', hasAppsProp);
  }, []);
  
  // Fetch installed applications on mount
  const [apps, setApps] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  React.useEffect(() => {
    async function loadApps() {
      try {
        console.log('[App] About to call window.electronAPI.apps.list()');
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

  // Keyboard navigation hook
  useKeyboard({
    selectedIndex,
    setSelectedIndex,
    results,
    onExecute: execute,
    onClose: async () => {
      await window.electronAPI.window.hide();
    },
  });

  // Listen for mode switching shortcuts (⌘1, ⌘2, ⌘3 or Ctrl+1/2/3)
  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Check for Alt+Shift+T
      if (event.altKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        toggleTheme();
        console.log('[App] Theme toggled via keyboard shortcut');
      }
      
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        if (event.key === '1') {
          event.preventDefault();
          console.log('[App] Switching to File Search mode');
        } else if (event.key === '2') {
          event.preventDefault();
          console.log('[App] Switching to AI Assistant mode');
        } else if (event.key === '3') {
          event.preventDefault();
          console.log('[App] Switching to Code Search mode');
        }
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [toggleTheme]);

  return (
    <div className="app">
      <div className="app-backdrop visible" />
      <CommandPalette
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        results={isLoading ? [] : results}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onExecute={execute}
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
