import React, { useState, useRef, useCallback } from 'react';
import { CommandPaletteHeader } from './CommandPaletteHeader';
import { CommandPaletteBody } from './CommandPaletteBody';
import { CommandPaletteFooter } from './CommandPaletteFooter';
import { type SearchMode } from './ModeTabs';
import { type SearchResult } from './ResultsList';
import type { AttachedFile } from '../types/ask-types';
import type { RecentFile } from '@/hooks/useRecentFiles';
import { useFocusManager } from '../hooks/useFocusManager';
import { useWindowReveal } from '../hooks/useWindowReveal';
import { logInfo } from '../utils/debugLogger';
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
  onRegisterSendMessage?: (fn: ((message?: string, files?: AttachedFile[]) => void) | null) => void;
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
  onAskAboutFile?: (result: SearchResult) => void;
  showShortcuts?: boolean;
  onToggleShortcuts?: () => void;
  isCollapsing?: boolean;
  mcpCount?: number;
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
  onAskAboutFile,
  showShortcuts: parentShowShortcuts,
  onToggleShortcuts,
  isCollapsing = false,
  mcpCount = 0,
}: CommandPaletteProps) {
  const [localSearchMode, setLocalSearchMode] = useState<SearchMode>(parentSearchMode ?? 'file');
  const searchMode = parentSearchMode ?? localSearchMode;
  const setSearchMode = onSearchModeChange ?? setLocalSearchMode;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);
  const [localShowShortcuts, setLocalShowShortcuts] = useState(false);

  // Owns show/mode focus routing for whichever input the active mode mounts
  // (Files -> #search-input, Ask -> the UnifiedCommandBar textarea), including the
  // electron-window-shown / electron-window-will-hide listeners.
  const { registerInput } = useFocusManager({
    searchMode,
    windowMode: currentMode,
  });

  // Fade + grow the card on first paint and on every Alt+Space summon. Dismiss stays instant.
  useWindowReveal(containerRef);
  const showShortcuts = parentShowShortcuts !== undefined ? parentShowShortcuts : localShowShortcuts;
  const toggleShortcuts = onToggleShortcuts ?? (() => setLocalShowShortcuts(prev => !prev));

  // Ref to store the ask mode send handler registered by AskModeExpanded
  const askModeSendRef = useRef<((message?: string, files?: AttachedFile[]) => void) | null>(null);

  const handleAskModeSendRegister = useCallback((fn: ((message?: string, files?: AttachedFile[]) => void) | null) => {
    askModeSendRef.current = fn;
  }, []);
  
  // Show results and footer in expanded or custom mode (not in compact)
  const isCompact = currentMode === 'compact';
  const showResults = !isCompact;
  const showFooter = !isCompact;

  // No size-measuring debug effect lives here any more. It ran on every
  // [currentMode, showResults, showFooter] change and, per run, forced layout with four
  // `getBoundingClientRect()` reads plus a `getComputedStyle()`, issued a `window:getMode` IPC,
  // and re-declared `MODE_CONFIGS`' pixels a fifth time (compact 800x72 / expanded 800x600 /
  // custom 800x480) purely to log them. Nothing consumed the log: `debug:log` only reaches
  // `log.debug` in main. Forced layout on a mode transition is exactly the cost the `h-full`
  // contract above exists to avoid paying.
  const handleModeChange = (mode: SearchMode) => {
    setSearchMode(mode);
    logInfo('[CommandPalette] Mode changed to:', mode);
  };

  const handleTabsExpanded = (expanded: boolean) => {
    onTabsExpanded?.(expanded);
    logInfo('[CommandPalette] Tabs expanded:', expanded);
  };
  
  return (
    // Use plain div instead of Card to avoid Card's built-in py-6 and gap-6
      <div 
      ref={containerRef}
      className={cn(
        // Mockup lines 77-89: Compact command palette container
        // Width: from spacing.css --container-command-palette, capped by the live window so a
        // narrow/custom width never clips the card against App's overflow-hidden.
        "w-[var(--container-command-palette)]",
        "max-w-full",
        "flex flex-col overflow-hidden",
        // Mockup line 87: 1px border - using semantic token
        "border border-border bg-transparent text-card-foreground",
        // Shadow: from shadow.css --shadow-command-palette (Mockup line 82)
        "shadow-[var(--shadow-command-palette)]",
        // Radius: from radius.css --radius-command-palette (Mockup line 81: 10px)
        "rounded-[var(--radius-command-palette)]",
        // Height is the OS window's to animate, never the card's. Measured before the change: a
        // `transition-[height]` plus a 600px min-height made the card 298px taller than the window
        // mid-expand (footer clipped off-screen) and, collapsing to a fixed 100px, left a 444px
        // transparent slab over the desktop that was still always-on-top and swallowed clicks.
        "h-full",
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
        isCollapsing={isCollapsing}
        registerInput={registerInput}
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
        onExitAskMode={() => setSearchMode('file')}
        onRegisterSendMessage={handleAskModeSendRegister}
        attachedFiles={attachedFiles}
        onRemoveFile={onRemoveFile}
        onAttachFile={onAttachFile}
        onAttachFolder={onAttachFolder}
        onClearAttachments={onClearAttachments}
        onAddFile={onAddFile}
        isFileSearchLoading={isFileSearchLoading}
        fileSearchError={fileSearchError}
        recentFiles={recentFiles}
        onQuickAction={onQuickAction}
        onAskAboutFile={onAskAboutFile}
        mcpCount={mcpCount}
        registerInput={registerInput}
      />
      
      <CommandPaletteFooter
        showFooter={showFooter}
        footerRef={footerRef}
        searchMode={searchMode}
        searchQuery={searchQuery}
        showShortcuts={showShortcuts}
        onToggleShortcuts={toggleShortcuts}
      />
    </div>
  );
}
