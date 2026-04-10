import React, { useState } from 'react';
import { CommandPaletteHeader } from './CommandPaletteHeader';
import { CommandPaletteBody } from './CommandPaletteBody';
import { CommandPaletteFooter } from './CommandPaletteFooter';
import { type SearchMode } from './SearchBar';
import { type SearchResult } from './ResultsList';
import { logComponentSizes } from '../utils/debugLogger';
import { cn } from '@/lib/utils';

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
  onTabsExpanded?: (expanded: boolean) => void;
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
  onTabsExpanded,
}: CommandPaletteProps) {
  const [localSearchMode, setLocalSearchMode] = useState<SearchMode>('file');
  const searchMode = parentSearchMode ?? localSearchMode;
  const setSearchMode = onSearchModeChange ?? setLocalSearchMode;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);
  
  // Show results and footer in expanded or custom mode (not in compact)
  const isCompact = currentMode === 'compact';
  const showResults = !isCompact;
  const showFooter = !isCompact;
  
  // Debug: Log mode changes and measure sizes to main process terminal
  React.useEffect(() => {
    const logData: any = {};
    
    // Debug: Log the actual CSS token value being used
    const compactHeightToken = getComputedStyle(document.documentElement)
      .getPropertyValue('--container-compact-height').trim();
    logData.compactHeightToken = compactHeightToken || 'NOT FOUND';
    
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
      // Import windowManager config to get actual window dimensions (UPDATED to 100px)
      const modeConfigs: Record<string, { width: number; height: number }> = {
        compact: { width: 800, height: 100 },  // Updated from 80px to 100px
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
    onTabsExpanded?.(expanded);
    console.log('[CommandPalette] Tabs expanded:', expanded);
  };
  
  return (
    // Use plain div instead of Card to avoid Card's built-in py-6 and gap-6
      <div 
      ref={containerRef}
      className={cn(
        // Mockup lines 77-89: Compact command palette container
        // Width: from spacing.css --container-command-palette
        "w-[var(--container-command-palette)]",
        "flex flex-col overflow-hidden",
        // Mockup line 87: 1px border - using semantic token
        "border border-border bg-card text-card-foreground",
        // Shadow: from shadow.css --shadow-command-palette (Mockup line 82)
        "shadow-[var(--shadow-command-palette)]",
        // Radius: from radius.css --radius-command-palette (Mockup line 81: 10px)
        "rounded-[var(--radius-command-palette)]",
        // Motion: using transition-fast token from motion.css
        "transition-all duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
        // CRITICAL: Use !important to override any h-full from parent
        // Heights: from spacing.css container tokens (Mockup lines 79-80)
        currentMode === 'compact' 
          ? "h-[var(--container-compact-height)] min-h-[var(--container-compact-height)] max-h-[var(--container-compact-height)]" 
          : "h-[var(--container-expanded-height)] min-h-[var(--container-expanded-height)] max-h-[var(--container-expanded-height)]"
      )}
      style={{ 
        height: currentMode === 'compact' 
          ? 'var(--container-compact-height)' 
          : 'var(--container-expanded-height)'
      }}
    >
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
        searchMode={searchMode}
        windowMode={currentMode}
      />
      
      <CommandPaletteFooter
        showFooter={showFooter}
        footerRef={footerRef}
        searchMode={searchMode}
        windowMode={currentMode}
      />
    </div>
  );
}
