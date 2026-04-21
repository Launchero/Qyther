import React, { useState } from 'react';
import { SearchBar, type SearchMode } from './SearchBar';
import { UnifiedCommandBar } from './ask-mode/UnifiedCommandBar';
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
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  onAttachFile?: () => void;
  onAttachFolder?: () => void;
  onAddFile?: (file: AttachedFile) => void;
  onExpandWindow?: () => void;
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
  attachedFiles = [],
  onRemoveFile,
  onAttachFile,
  onAttachFolder,
  onAddFile,
  onExpandWindow,
}: CommandPaletteHeaderProps) {
  const isAskMode = searchMode === 'ai';
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
        // In file mode, use fixed 100px header.
        "h-[var(--container-header-height)]",
        // Ask mode wrapper: column layout so chips appear below the command bar
        isAskMode && "flex flex-col",
        // Border: compact file mode has no border, everything else has bottom border
        windowMode === 'compact' && !isAskMode
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
          onExpandWindow={onExpandWindow}
        />
      )}
    </div>
  );
}
