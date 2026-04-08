import React, { useState } from 'react';
import { CommandPaletteHeader } from './CommandPaletteHeader';
import { CommandPaletteBody } from './CommandPaletteBody';
import { CommandPaletteFooter } from './CommandPaletteFooter';
import { SearchBar, type SearchMode } from './SearchBar';
import { ResultsList, SearchResult } from './ResultsList';
import { ThemeToggle } from './ThemeToggle';
import { logComponentSizes } from '../utils/debugLogger';

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
  
  // Show results and footer in expanded or custom mode (not in compact)
  const isCompact = currentMode === 'compact';
  const showResults = !isCompact;
  const showFooter = !isCompact;

  // Show results list in non-compact mode
  const showResultsList = !isCompact;
  
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
      logComponentSizes(logData);
    }).catch(() => {
      // Fallback if getMode fails
      logData.electronWindow = 'UNKNOWN';
      logComponentSizes(logData);
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
      <CommandPaletteHeader
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchMode={searchMode}
        onSearchModeChange={handleModeChange}
        onTabsExpanded={handleTabsExpanded}
        windowMode={currentMode}
        headerRef={headerRef}
      />
      
      <CommandPaletteBody
        showResults={showResults}
        searchQuery={searchQuery}
        results={results}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        onExecute={onExecute}
        executingId={executingId}
        bodyRef={bodyRef}
      />
      
      <CommandPaletteFooter
        showFooter={showFooter}
        footerRef={footerRef}
      />
    </div>
  );
}
