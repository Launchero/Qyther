import React, { useState, useEffect, useCallback } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { ActionPanel } from './components/ActionPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { useKeyboard } from './hooks/useKeyboard';
import { useSearch } from './hooks/useSearch';
import { useFileSearch } from './hooks/useFileSearch';
import { useCommandExecution } from './hooks/useCommandExecution';
import { useWindowMode } from './hooks/useWindowMode';
import { useExternalLinkHandler } from './hooks/useExternalLinkHandler';
import { useContextAttachments } from './hooks/useContextAttachments';
import { useRecentFiles } from './hooks/useRecentFiles';
import { useResizeDrag } from './hooks/useResizeDrag';
import { useWindowTween } from './hooks/useWindowTween';
import type { SearchResult } from './components/ResultsList';
import type { SearchMode } from './components/ModeTabs';
import type { AttachedFile } from './types/ask-types';
import { useTheme } from './context/ThemeProvider';
import { logInfo, logError, logDebug } from './utils/debugLogger';
import { filterSystemCommands, tryCalculator } from './utils/systemCommands';

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

function useIsMounted(): { current: boolean } {
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}

async function loadAppList(
  isMountedRef: { current: boolean },
  setApps: React.Dispatch<React.SetStateAction<SearchResult[]>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<void> {
  try {
    logInfo('[App] About to call window.electronAPI.apps.list()');
    const appList = await window.electronAPI.apps.list();
    if (!isMountedRef.current) {
      return;
    }
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
    logError('[App] Failed to load apps:', error);
  } finally {
    if (isMountedRef.current) {
      setIsLoading(false);
    }
  }
}

function loadMcpCount(
  isMountedRef: { current: boolean },
  setMcpCount: React.Dispatch<React.SetStateAction<number>>,
): void {
  window.electronAPI.mcp.getServerCount()
    .then((count) => {
      if (isMountedRef.current) {
        setMcpCount(count);
      }
    })
    .catch(() => {
      if (isMountedRef.current) {
        setMcpCount(0);
      }
    });
}

export function App() {
  const { toggleTheme } = useTheme();
  const isMountedRef = useIsMounted();

  // Fetch installed applications on mount
  const [apps, setApps] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    void loadAppList(isMountedRef, setApps, setIsLoading);
  }, [isMountedRef]);

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
    navigateHistory,
  } = useSearch(allItems);
  
  const [searchMode, setSearchMode] = React.useState<SearchMode>('file');
  const { windowMode, isCollapsing } = useWindowMode({ searchQuery, searchMode });
  const { recentFiles, addRecentFile } = useRecentFiles(4);
  const { executingId, execute } = useCommandExecution({
    onExecuted: (result) => {
      if ((result.type === 'file' || result.type === 'app') && result.action) {
        addRecentFile(result.action, result.title);
      }
    },
  });
  
  // MCP count from installed servers (dynamic)
  const [mcpCount, setMcpCount] = useState(0);

  useEffect(() => {
    loadMcpCount(isMountedRef, setMcpCount);
  }, [isMountedRef]);

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

  // Combine base results (commands/apps) with file results, system commands, and calculator
  const results = React.useMemo(() => {
    if (searchQuery.trim().length > 0) {
      if (searchMode === 'ai') {
        return baseResults;
      }
      // Calculator: show if query looks like a math expression
      const calcResult = tryCalculator(searchQuery);
      // System commands: filter by query
      const sysCmdResults = filterSystemCommands(searchQuery);
      
      const parts: SearchResult[] = [];
      if (calcResult) parts.push(calcResult);
      if (sysCmdResults.length > 0) parts.push(...sysCmdResults);
      if (fileResults.length > 0) parts.push(...fileResults);
      parts.push(...baseResults);
      
      // Fallback: if nothing matched, offer a web search rather than an empty list.
      if (parts.length === 0) {
        parts.push(
          {
            id: 'fallback-search-web',
            title: `Search web for "${searchQuery}"`,
            subtitle: 'Open in default browser',
            type: 'url',
            icon: '🌐',
            action: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
            metadata: { section: 'Suggestions', kind: 'Action', shortcut: '↵' },
          }
        );
      }
      
      return parts;
    }
    // No query: show base results + a few system commands
    const sysCmdResults = filterSystemCommands('');
    return [...sysCmdResults, ...baseResults];
  }, [baseResults, fileResults, searchQuery, searchMode]);

  if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_SEARCH === 'true') {
    logDebug('[App] Final results merged:', {
      count: results.length,
      fileResults: fileResults.length,
      baseResults: baseResults.length,
      items: results.map(r => ({ id: r.id, title: r.title, type: r.type })),
    });
  }

  // Keyboard navigation hook
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [actionPanelResult, setActionPanelResult] = useState<SearchResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const handleAskAbout = useCallback((result: SearchResult) => {
    const file: AttachedFile = {
      name: result.title,
      path: result.metadata?.path || result.subtitle || '',
      type: result.metadata?.fileType || 'file',
    };
    addAttachedFile(file);
    setSearchQuery(`What does ${result.title} do?`);
    setSearchMode('ai');
  }, [addAttachedFile, setSearchQuery, setSearchMode]);

  useKeyboard({
    selectedIndex,
    setSelectedIndex,
    results,
    searchQuery,
    onClearQuery: () => setSearchQuery(''),
    onExecute: execute,
    onClose: async () => {
      await window.electronAPI.window.hide().catch((e) => logError('[App] window.hide failed:', e));
    },
    searchMode,
    setSearchMode,
    onAskAbout: handleAskAbout,
    onToggleHelp: () => setShowShortcuts(prev => !prev),
    onOpenActionPanel: (result: SearchResult) => setActionPanelResult(result),
    onToggleSettings: () => setShowSettings(prev => !prev),
    onNavigateHistory: navigateHistory,
    isModalOpen: actionPanelResult !== null || showSettings || showShortcuts,
  });

  useExternalLinkHandler();

  // Window resize handle (bottom drag) - at App level to avoid being clipped by rounded container
  const { onResizeMouseDown, resizeByKeyboard } = useResizeDrag();

  // Theme toggle shortcut (Alt+Shift+T) + keyboard resize (Alt+ArrowUp/Down in expanded)
  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        toggleTheme();
        logInfo('[App] Theme toggled via keyboard shortcut');
        return;
      }
      if (event.altKey && windowMode === 'expanded' && event.key === 'ArrowUp') {
        event.preventDefault();
        resizeByKeyboard(40);
        return;
      }
      if (event.altKey && windowMode === 'expanded' && event.key === 'ArrowDown') {
        event.preventDefault();
        resizeByKeyboard(-40);
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [toggleTheme, windowMode, resizeByKeyboard]);

  // Offers the page's animation frames as the clock for main's height tween
  useWindowTween();

  return (
    <>
      <div className="w-full h-full max-w-full flex flex-col relative overflow-hidden m-0 p-0">

        {/* CommandPalette — the palette interior is the canvas layer; the container itself
            holds no z-index so it never becomes a stacking context for the fixed toast region. */}
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
            mcpCount={mcpCount}
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
              if (action !== 'find-in-folder') return;
              window.electronAPI.dialog.openFolder().then((result) => {
                if (result.path) {
                  setSearchQuery(result.path);
                }
              }).catch((e) => logError('[App] openFolder failed:', e));
            }}
            onAskAboutFile={handleAskAbout}
            showShortcuts={showShortcuts}
            onToggleShortcuts={() => setShowShortcuts(prev => !prev)}
            isCollapsing={isCollapsing}
          />
        </div>

        {/* Action panel — contextual actions for the selected result (Ctrl+K) */}
        <ActionPanel
          open={actionPanelResult !== null}
          onOpenChange={(open) => { if (!open) setActionPanelResult(null); }}
          result={actionPanelResult}
          onExecute={execute}
          onAskAbout={handleAskAbout}
        />

        {/* Settings — theme, mode, shortcuts entry point (Ctrl+,) */}
        <SettingsDialog
          open={showSettings}
          onOpenChange={setShowSettings}
          windowMode={windowMode}
          mcpCount={mcpCount}
          onOpenShortcuts={() => setShowShortcuts(true)}
        />

        {/* Initial app loading overlay - only blocks during first render.
            `--z-sticky` is the layer the palette already stacks against, `--scrim` is the
            semantic dim, and the rows are the app's own `.skeleton-row shimmer` vocabulary —
            the thing that is actually pending is the result list. Two rows because the window
            is still compact here, and the parent clips anything taller. */}
        {isLoading && (
          <div
            className="absolute inset-0 z-[var(--z-sticky)] flex flex-col items-center justify-center gap-2 bg-scrim animate-fade-in"
            role="status"
            aria-live="polite"
          >
            <div className="loading-spinner" aria-hidden="true" />
            <div className="flex w-full flex-col px-6">
              <div className="skeleton-row shimmer w-full" />
              <div className="skeleton-row shimmer w-2/3" />
            </div>
            <p className="text-xs text-muted-foreground">Loading applications…</p>
          </div>
        )}
      </div>

      {/* Window Resize Handle - rendered outside overflow-hidden container so it receives mouse events.
          Geometry, cursor and stacking all come from `.window-resize-handle` in
          ask-mode-perplexity.css; the inline style here duplicated it and fought the token scale. */}
      {windowMode === 'expanded' && (
        <div
          className="window-resize-handle"
          onMouseDown={onResizeMouseDown}
          tabIndex={0}
          role="slider"
          aria-label="Resize palette height. Press Alt plus Up or Down."
          aria-orientation="vertical"
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              resizeByKeyboard(40);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              resizeByKeyboard(-40);
            }
          }}
        />
      )}
    </>
  );
}
