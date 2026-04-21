import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { useKeyboard } from './hooks/useKeyboard';
import { useSearch } from './hooks/useSearch';
import { useFileSearch } from './hooks/useFileSearch';
import { useCommandExecution } from './hooks/useCommandExecution';
import { useWindowMode } from './hooks/useWindowMode';
import { useContextAttachments } from './hooks/useContextAttachments';
import { useRecentFiles } from './hooks/useRecentFiles';
import type { SearchResult } from './components/ResultsList';
import type { SearchMode } from './components/SearchBar';
import type { AttachedFile } from './components/ChatInputArea';
import { useTheme } from './context/ThemeProvider';

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

  // Search hooks (need to call this first to get searchQuery)
  const {
    searchQuery,
    setSearchQuery,
    results: baseResults,
    selectedIndex,
    setSelectedIndex,
  } = useSearch(allItems);
  
  const [searchMode, setSearchMode] = React.useState<SearchMode>('file');
  const { windowMode, isManuallyExpanded, setIsManuallyExpanded } = useWindowMode({ searchQuery, searchMode });
  const { recentFiles, addRecentFile } = useRecentFiles(4);
  const { executingId, execute } = useCommandExecution({
    onExecuted: (result) => {
      if ((result.type === 'file' || result.type === 'app') && result.action) {
        addRecentFile(result.action, result.title);
      }
    },
  });
  
  // Unified input state management
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const [mcpCount] = useState(2);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  const {
    attachedFiles,
    addFile: addAttachedFile,
    removeFile: removeAttachedFile,
    openFilePicker,
    openFolderPicker,
    clearFiles: clearAttachedFiles,
  } = useContextAttachments();
  
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

  if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_SEARCH === 'true') {
    console.debug('[App] Final results merged:', {
      count: results.length,
      fileResults: fileResults.length,
      baseResults: baseResults.length,
      items: results.map(r => ({ id: r.id, title: r.title, type: r.type })),
    });
  }

  // Keyboard navigation hook
  useKeyboard({
    selectedIndex,
    setSelectedIndex,
    results,
    onExecute: execute,
    onClose: async () => {
      await window.electronAPI.window.hide();
    },
    searchMode,
    setSearchMode,
  });

  // Theme toggle shortcut (Alt+Shift+T)
  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        toggleTheme();
        console.log('[App] Theme toggled via keyboard shortcut');
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [toggleTheme]);

  // Window resize handle (bottom drag) - at App level to avoid being clipped by rounded container
  const isResizingRef = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeMouseDown = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    try {
      const currentHeight = await window.electronAPI.window.getHeight();
      resizeStartHeight.current = currentHeight;
    } catch {
      resizeStartHeight.current = 600;
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientY - resizeStartY.current;
      const newHeight = Math.max(300, resizeStartHeight.current + delta);
      window.electronAPI.window.resizeHeight(newHeight).catch(console.error);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizing(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="w-full h-full max-w-full flex flex-col relative overflow-hidden m-0 p-0">
      {/* Background overlay - MUST be behind CommandPalette (z-0) */}
      <div className="fixed inset-0 bg-transparent z-0" />
      
      {/* CommandPalette - MUST be above overlay (z-10) */}
      <div className="relative z-10 h-full flex flex-col">
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
          hasSentMessage={hasSentMessage}
          mcpCount={mcpCount}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={() => setWebSearchEnabled(prev => !prev)}
          attachedFiles={attachedFiles}
          onRemoveFile={removeAttachedFile}
          onAttachFile={openFilePicker}
          onAttachFolder={openFolderPicker}
          onAddFile={addAttachedFile}
          onClearAttachments={clearAttachedFiles}
          isFileSearchLoading={isFileSearchLoading}
          fileSearchError={fileSearchError}
          recentFiles={recentFiles}
          onQuickAction={(action) => {
            switch (action) {
              case 'find-in-folder':
                window.electronAPI.dialog.openFolder().then((result) => {
                  if (result.path) {
                    setSearchQuery(result.path);
                  }
                }).catch(console.error);
                break;
              case 'recent-files':
                // Recent files already shown in SearchEmptyState
                break;
              case 'open-terminal':
                console.log('[App] Quick action "open-terminal" - requires new IPC handler');
                break;
              case 'git-status':
                console.log('[App] Quick action "git-status" - requires new IPC handler');
                break;
            }
          }}
          onExpandWindow={() => {
            window.electronAPI.window.setMode('expanded').catch(console.error);
          }}
          onAskAboutFile={(result) => {
            // Add file to attachments
            const file: AttachedFile = {
              name: result.title,
              path: result.metadata?.path || result.subtitle || '',
              type: result.metadata?.fileType || 'file'
            };
            addAttachedFile(file);
            // Switch to AI mode
            setSearchMode('ai');
          }}
        />
      </div>
      
      {/* Initial app loading overlay - only blocks during first render */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
          <p className="text-muted-foreground">Loading applications...</p>
        </div>
      )}

      {/* Window Resize Handle - at App level to avoid being clipped by CommandPalette's rounded corners */}
      {windowMode === 'expanded' && (
        <div
          className="window-resize-handle"
          onMouseDown={handleResizeMouseDown}
          style={{ 
            cursor: isResizing ? 'ns-resize' : 'ns-resize',
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 60
          }}
        />
      )}
    </div>
  );
}
