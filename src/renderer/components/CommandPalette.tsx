import React, { useState } from 'react';
import { SearchBar, type SearchMode } from './SearchBar';
import { ResultsList, SearchResult } from './ResultsList';
import { AskModePanel } from './AskModePanel';
import { ThemeToggle } from './ThemeToggle';

export interface CommandPaletteProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (result: SearchResult) => void;
  currentMode?: import('../../main/windowManager').WindowMode;
  executingId?: string | null;
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
}

export function CommandPalette({
  searchQuery,
  onSearchChange,
  results,
  selectedIndex,
  onSelect,
  onExecute,
  currentMode = 'expanded',
  executingId,
  searchMode: parentSearchMode,
  onSearchModeChange,
}: CommandPaletteProps) {
  const [localSearchMode, setLocalSearchMode] = useState<SearchMode>('file');
  const searchMode = parentSearchMode ?? localSearchMode;
  const setSearchMode = onSearchModeChange ?? setLocalSearchMode;
  const [tabsExpanded, setTabsExpanded] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);
  
  // Show results and footer only in expanded mode
  const isExpanded = currentMode === 'expanded';
  const showResults = isExpanded;
  const showFooter = isExpanded;

  // Show AskModePanel for AI mode in expanded window
  const showAskMode = isExpanded && searchMode === 'ai';
  const showResultsList = isExpanded && searchMode !== 'ai';
  
  // Debug: Log mode changes and measure sizes to main process terminal
  React.useEffect(() => {
    const logData: any = {};
    
    // Get actual viewport size from DOM
    logData.viewportSize = `${window.innerWidth} x ${window.innerHeight}px`;
    logData.visualViewport = window.visualViewport ? 
      `${window.visualViewport.width.toFixed(1)} x ${window.visualViewport.height.toFixed(1)}px` : 'N/A';
    
    // Measure entire command palette container
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      logData.commandPalette = `${rect.width.toFixed(1)} x ${rect.height.toFixed(1)}px`;
    }
    
    // Measure header
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      logData.header = `${rect.width.toFixed(1)} x ${rect.height.toFixed(1)}px`;
    } else {
      logData.header = 'NOT MOUNTED';
    }
    
    // Measure body
    if (showResults && bodyRef.current) {
      const rect = bodyRef.current.getBoundingClientRect();
      logData.body = `${rect.width.toFixed(1)} x ${rect.height.toFixed(1)}px`;
    } else {
      logData.body = 'HIDDEN';
    }
    
    // Measure footer
    if (showFooter && footerRef.current) {
      const rect = footerRef.current.getBoundingClientRect();
      logData.footer = `${rect.width.toFixed(1)} x ${rect.height.toFixed(1)}px`;
    } else {
      logData.footer = 'HIDDEN';
    }
    
    // Get actual Electron window size from main process
    window.electronAPI?.window?.getMode().then((mode) => {
      // Import windowManager config to get actual window dimensions
      const modeConfigs: Record<string, { width: number; height: number }> = {
        compact: { width: 800, height: 100 },
        expanded: { width: 800, height: 600 },
        custom: { width: 800, height: 480 },
      };
      const config = modeConfigs[mode] || modeConfigs.expanded;
      logData.electronWindow = `${config.width} x ${config.height}px (mode: ${mode})`;
      
      // Send to main process terminal
      window.electronAPI?.debug?.log(`[CommandPalette] Mode: ${currentMode}`, logData).catch(console.error);
    }).catch(() => {
      // Fallback if getMode fails
      logData.electronWindow = 'UNKNOWN';
      window.electronAPI?.debug?.log(`[CommandPalette] Mode: ${currentMode}`, logData).catch(console.error);
    });
  }, [currentMode, showResults, showFooter]);
  
  const handleModeChange = (mode: SearchMode) => {
    setSearchMode(mode);
    console.log('[CommandPalette] Mode changed to:', mode);
  };

  const handleTabsExpanded = (expanded: boolean) => {
    setTabsExpanded(expanded);
    console.log('[CommandPalette] Tabs expanded:', expanded);
  };
  
  return (
    <div ref={containerRef} className="command-palette">
      <div ref={headerRef} className="command-palette-header">
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search commands, apps, and more..."
          currentMode={searchMode}
          onModeChange={handleModeChange}
          onTabsExpanded={handleTabsExpanded}
          windowMode={currentMode}
        />
      </div>
      
      {showResults && (
        <div ref={bodyRef} className="command-palette-body">
          {showAskMode ? (
            <AskModePanel initialQuery={searchQuery} />
          ) : (
            <ResultsList
              results={results}
              selectedIndex={selectedIndex}
              onSelect={onSelect}
              onExecute={onExecute}
              searchQuery={searchQuery}
              executingId={executingId || undefined}
            />
          )}
        </div>
      )}
      {showFooter && (
        <div ref={footerRef} className="command-palette-footer">
          <div className="footer-section">
            <div className="shortcut-hint">
              <kbd>↑↓</kbd> Navigate
            </div>
            <div className="shortcut-hint">
              <kbd>Enter</kbd> Execute
            </div>
            <div className="shortcut-hint">
              <kbd>Esc</kbd> Close
            </div>
          </div>
          <div className="footer-divider" />
          <div className="footer-section">
            <div className="shortcut-hint">
              <kbd>Home</kbd><kbd>End</kbd> Jump
            </div>
            <div className="shortcut-hint">
              <kbd>PgUp</kbd><kbd>PgDn</kbd> Page
            </div>
          </div>
          <div className="footer-section footer-section-right">
            <div className="shortcut-hint">
              <kbd>Alt+Shift+M</kbd> Mode
            </div>
            <div className="shortcut-hint">
              <kbd>Alt+Shift+T</kbd> Theme
            </div>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
