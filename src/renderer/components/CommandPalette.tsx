import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CommandPaletteHeader } from './CommandPaletteHeader';
import { CommandPaletteBody } from './CommandPaletteBody';
import { CommandPaletteFooter } from './CommandPaletteFooter';
import { type SearchMode } from './SearchBar';
import { type SearchResult } from './ResultsList';
import type { AttachedFile } from './ChatInputArea';
import type { RecentFile } from '@/hooks/useRecentFiles';
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
  hasSentMessage?: boolean;
  mcpCount?: number;
  onOpenMCPModal?: () => void;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  desktopControlEnabled?: boolean;
  onToggleDesktopControl?: () => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  onAttachFile?: () => void;
  onAttachFolder?: () => void;
  onAddFile?: (file: AttachedFile) => void;
  onClearAttachments?: () => void;
  isFileSearchLoading?: boolean;
  fileSearchError?: string | null;
  recentFiles?: RecentFile[];
  onQuickAction?: (action: string) => void;
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
  hasSentMessage = false,
  mcpCount = 0,
  onOpenMCPModal,
  webSearchEnabled = false,
  onToggleWebSearch,
  desktopControlEnabled = false,
  onToggleDesktopControl,
  attachedFiles = [],
  onRemoveFile,
  onAttachFile,
  onAttachFolder,
  onAddFile,
  onClearAttachments,
  isFileSearchLoading,
  fileSearchError,
  recentFiles = [],
  onQuickAction,
}: CommandPaletteProps) {
  const [localSearchMode, setLocalSearchMode] = useState<SearchMode>('file');
  const searchMode = parentSearchMode ?? localSearchMode;
  const setSearchMode = onSearchModeChange ?? setLocalSearchMode;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);

  // Ref to store the ask mode send handler registered by AskModeExpanded
  const askModeSendRef = useRef<((message?: string, files?: AttachedFile[]) => void) | null>(null);

  const handleAskModeSendRegister = useCallback((fn: ((message?: string, files?: AttachedFile[]) => void) | null) => {
    askModeSendRef.current = fn;
  }, []);

  const handleSendMessage = useCallback((message?: string, files?: AttachedFile[]) => {
    if (askModeSendRef.current) {
      askModeSendRef.current(message, files);
    } else {
      console.warn('[CommandPalette] askModeSendRef.current is null!');
    }
  }, []);
  
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

  // Window resize handle (bottom drag) - only in expanded mode
  const isResizingRef = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  const handleResizeMouseDown = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
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
    // Use plain div instead of Card to avoid Card's built-in py-6 and gap-6
      <div 
      ref={containerRef}
      className={cn(
        // Mockup lines 77-89: Compact command palette container
        // Width: from spacing.css --container-command-palette
        "w-[var(--container-command-palette)]",
        "flex flex-col overflow-hidden",
        // Mockup line 87: 1px border - using semantic token
        "border border-border bg-transparent text-card-foreground",
        // Shadow: from shadow.css --shadow-command-palette (Mockup line 82)
        "shadow-[var(--shadow-command-palette)]",
        // Radius: from radius.css --radius-command-palette (Mockup line 81: 10px)
        "rounded-[var(--radius-command-palette)]",
        // Motion: using transition-fast token from motion.css
        "transition-all duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
        // Heights: compact mode is fixed, expanded mode fills available window space
        currentMode === 'compact' 
          ? "h-[var(--container-compact-height)] min-h-[var(--container-compact-height)] max-h-[var(--container-compact-height)]" 
          : "h-full min-h-[var(--container-expanded-height)]"
      )}
      style={{ 
        position: 'relative'
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
        onSendMessage={searchMode === 'ai' || searchMode === 'desktop' ? handleSendMessage : undefined}
        hasSentMessage={hasSentMessage}
        mcpCount={mcpCount}
        onOpenMCPModal={onOpenMCPModal}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={onToggleWebSearch}
        desktopControlEnabled={desktopControlEnabled}
        onToggleDesktopControl={onToggleDesktopControl}
        attachedFiles={attachedFiles}
        onRemoveFile={onRemoveFile}
        onAttachFile={onAttachFile}
        onAttachFolder={onAttachFolder}
        onAddFile={onAddFile}
      />
      
      <CommandPaletteBody
        showResults={showResults}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        results={results}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        onExecute={onExecute}
        executingId={executingId}
        bodyRef={bodyRef}
        searchMode={searchMode}
        windowMode={currentMode}
        onRegisterSendMessage={handleAskModeSendRegister}
        attachedFiles={attachedFiles}
        onRemoveFile={onRemoveFile}
        onAttachFile={onAttachFile}
        onAttachFolder={onAttachFolder}
        onClearAttachments={onClearAttachments}
        isFileSearchLoading={isFileSearchLoading}
        fileSearchError={fileSearchError}
        recentFiles={recentFiles}
        onQuickAction={onQuickAction}
      />
      
      <CommandPaletteFooter
        showFooter={showFooter}
        footerRef={footerRef}
        searchMode={searchMode}
        searchQuery={searchQuery}
        windowMode={currentMode}
      />

      {/* Resize Handle - Bottom edge for vertical resizing (expanded mode only) */}
      {currentMode === 'expanded' && (
        <div
          className="window-resize-handle"
          onMouseDown={handleResizeMouseDown}
          style={{ cursor: 'ns-resize' }}
        />
      )}
    </div>
  );
}
