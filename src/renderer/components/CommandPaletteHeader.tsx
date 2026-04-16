import React, { useState } from 'react';
import { SearchBar, type SearchMode } from './SearchBar';
import { UnifiedCommandBar } from './ask-mode/UnifiedCommandBar';
import { DesktopCommandBar } from './DesktopCommandBar';
import type { AttachedFile } from './ChatInputArea';
import { cn } from '@/lib/utils';

export interface CommandPaletteHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onTabsExpanded: (expanded: boolean) => void;
  windowMode: 'expanded' | 'compact' | 'custom';
  headerRef: React.RefObject<HTMLDivElement | null>;
  onSendMessage?: (message: string) => void;
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
}

export function CommandPaletteHeader({
  searchQuery,
  onSearchChange,
  searchMode,
  onSearchModeChange,
  onTabsExpanded,
  windowMode,
  headerRef,
  onSendMessage,
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
}: CommandPaletteHeaderProps) {
  const isAskMode = searchMode === 'ai';
  const isDesktopMode = searchMode === 'desktop';
  const [askTabsExpanded, setAskTabsExpanded] = useState(false);

  const handleSend = (message: string) => {
    if (onSendMessage) {
      onSendMessage(message);
    } else {
      console.warn('[CommandPaletteHeader] onSendMessage is undefined!');
    }
  };

  const handleAskTabsExpanded = (expanded: boolean) => {
    setAskTabsExpanded(expanded);
    onTabsExpanded(expanded);
  };

  return (
    <div
      ref={headerRef}
      className={cn(
        "w-full",
        "flex-shrink-0",
        "bg-card text-card-foreground",
        // In Ask mode, height is determined by content (command-bar + optional chips).
        // In file/code mode, use fixed 100px header.
        !isAskMode && !isDesktopMode && "h-[var(--container-header-height)]",
        // Ask mode wrapper: column layout so chips appear below the command bar
        isAskMode && "flex flex-col",
        // Desktop mode: column layout for command bar + quick action pills
        isDesktopMode && "flex flex-col",
        // Border: compact file mode has no border, everything else has bottom border
        windowMode === 'compact' && !isAskMode && !isDesktopMode
          ? "border-0"
          : "border-b border-border",
        "transition-colors duration-200"
      )}
    >
      {isAskMode ? (
        <UnifiedCommandBar
          value={searchQuery}
          onChange={onSearchChange}
          onSend={handleSend}
          windowMode={windowMode}
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
          currentMode={searchMode}
          onModeChange={onSearchModeChange}
          tabsExpanded={askTabsExpanded}
          onTabsExpanded={handleAskTabsExpanded}
        />
      ) : isDesktopMode ? (
        <DesktopCommandBar
          value={searchQuery}
          onChange={onSearchChange}
          onSend={handleSend}
          isLoading={false}
          windowMode={windowMode}
        />
      ) : (
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search for files, tools, actions..."
          currentMode={searchMode}
          onModeChange={onSearchModeChange}
          onTabsExpanded={onTabsExpanded}
          windowMode={windowMode}
          onSendMessage={onSendMessage ? () => onSendMessage('') : undefined}
        />
      )}
    </div>
  );
}
