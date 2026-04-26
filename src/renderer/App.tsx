import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { LicenseActivation } from './components/LicenseActivation';
import { ApiKeySetup } from './components/ApiKeySetup';
import { useKeyboard } from './hooks/useKeyboard';
import { useSearch } from './hooks/useSearch';
import { useFileSearch } from './hooks/useFileSearch';
import { useCommandExecution } from './hooks/useCommandExecution';
import { useWindowMode } from './hooks/useWindowMode';
import { useContextAttachments } from './hooks/useContextAttachments';
import { useRecentFiles } from './hooks/useRecentFiles';
import type { SearchResult } from './components/ResultsList';
import type { SearchMode } from './components/ModeTabs';
import type { AttachedFile } from './types/ask-types';
import { useTheme } from './context/ThemeProvider';
import { logInfo, logError, logDebug } from './utils/debugLogger';

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
  const [isLicensed, setIsLicensed] = useState(false);
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiConfigChecked, setApiConfigChecked] = useState(false);
  
  // Check license on mount
  useEffect(() => {
    async function checkLicense() {
      try {
        const storedKey = localStorage.getItem('qyther_license_key');
        if (storedKey) {
          const response = await window.electronAPI.license.verify(storedKey);
          if (response.success) {
            setIsLicensed(true);
          } else {
            // Stored key is invalid, clear it
            localStorage.removeItem('qyther_license_key');
          }
        }
      } catch {
        // License check failed or not available
        setIsLicensed(false);
      } finally {
        setLicenseChecked(true);
      }
    }
    
    checkLicense();
  }, []);

  // Check API config after license is confirmed
  useEffect(() => {
    if (!isLicensed) return;
    
    async function checkApiConfig() {
      try {
        const config = await window.electronAPI.apiConfig.load();
        setApiKeyConfigured(config.configured);
      } catch {
        setApiKeyConfigured(false);
      } finally {
        setApiConfigChecked(true);
      }
    }
    
    checkApiConfig();
  }, [isLicensed]);
  
  // Fetch installed applications on mount
  const [apps, setApps] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  React.useEffect(() => {
    async function loadApps() {
      try {
        logInfo('[App] About to call window.electronAPI.apps.list()');
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
        logError('[App] Failed to load apps:', error);
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
  const { windowMode, isManuallyExpanded, isCollapsing, setIsManuallyExpanded } = useWindowMode({ searchQuery, searchMode });
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
    window.electronAPI.mcp.getServerCount().then(setMcpCount).catch(() => setMcpCount(0));
  }, []);

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
    logDebug('[App] Final results merged:', {
      count: results.length,
      fileResults: fileResults.length,
      baseResults: baseResults.length,
      items: results.map(r => ({ id: r.id, title: r.title, type: r.type })),
    });
  }

  // Keyboard navigation hook
  const [showShortcuts, setShowShortcuts] = useState(false);
  
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
    onExecute: execute,
    onClose: async () => {
      await window.electronAPI.window.hide();
    },
    searchMode,
    setSearchMode,
    onAskAbout: handleAskAbout,
    onToggleHelp: () => setShowShortcuts(prev => !prev),
  });

  // Theme toggle shortcut (Alt+Shift+T)
  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        toggleTheme();
        logInfo('[App] Theme toggled via keyboard shortcut');
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
      window.electronAPI.window.resizeHeight(newHeight).catch((e) => logError('[App] resizeHeight failed:', e));
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
      {/* License Activation Overlay - blocks entire app until licensed */}
      {licenseChecked && !isLicensed && (
        <LicenseActivation onActivated={() => setIsLicensed(true)} />
      )}

      {/* API Key Setup - appears after license activation */}
      {licenseChecked && isLicensed && !apiConfigChecked && (
        <div className="absolute inset-0 bg-background/50 z-40 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      )}
      {licenseChecked && isLicensed && apiConfigChecked && !apiKeyConfigured && (
        <ApiKeySetup onConfigured={() => setApiKeyConfigured(true)} />
      )}

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
            switch (action) {
              case 'find-in-folder':
                window.electronAPI.dialog.openFolder().then((result) => {
                  if (result.path) {
                    setSearchQuery(result.path);
                  }
                }).catch((e) => logError('[App] openFolder failed:', e));
                break;
              case 'recent-files':
                // Recent files already shown in SearchEmptyState
                break;
              case 'open-terminal':
                logInfo('[App] Quick action "open-terminal" - requires new IPC handler');
                break;
              case 'git-status':
                logInfo('[App] Quick action "git-status" - requires new IPC handler');
                break;
            }
          }}
          onAskAboutFile={handleAskAbout}
          showShortcuts={showShortcuts}
          onToggleShortcuts={() => setShowShortcuts(prev => !prev)}
          isCollapsing={isCollapsing}
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
