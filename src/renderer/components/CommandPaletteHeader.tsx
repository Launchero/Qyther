import React, { useState } from 'react';
import { SearchBar } from './SearchBar';
import { type SearchMode } from './ModeTabs';
import { ModeTabs } from './ModeTabs';
import { cn } from '@/lib/utils';

export interface CommandPaletteHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onTabsExpanded: (expanded: boolean) => void;
  windowMode: 'expanded' | 'compact' | 'custom';
  headerRef: React.RefObject<HTMLDivElement | null>;
  isCollapsing?: boolean;
}

export function CommandPaletteHeader({
  searchQuery,
  onSearchChange,
  searchMode,
  onSearchModeChange,
  onTabsExpanded,
  windowMode,
  headerRef,
  isCollapsing = false,
}: CommandPaletteHeaderProps) {
  const isAskMode = searchMode === 'ai';
  const [askTabsExpanded, setAskTabsExpanded] = useState(false);

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
        // Border: compact file mode has no border, everything else has bottom border
        windowMode === 'compact' && !isAskMode
          ? "border-0"
          : "border-b border-border",
        // Visual transition cue: brief highlight when auto-collapsing
        isCollapsing && "collapse-flash",
        "transition-colors duration-200"
      )}
    >
      {isAskMode ? (
        <div className="ask-mode-header-minimal">
          <ModeTabs
            currentMode={searchMode}
            onModeChange={onSearchModeChange}
            expanded={askTabsExpanded}
            onToggle={() => handleAskTabsExpanded(!askTabsExpanded)}
          />
        </div>
      ) : (
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search for files, tools, actions..."
          currentMode={searchMode}
          onModeChange={onSearchModeChange}
          onTabsExpanded={onTabsExpanded}
          windowMode={windowMode}
        />
      )}
    </div>
  );
}
