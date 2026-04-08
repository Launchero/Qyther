import React from 'react';
import { SearchBar, type SearchMode } from './SearchBar';
import { ThemeToggle } from './ThemeToggle';

export interface CommandPaletteHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onTabsExpanded: (expanded: boolean) => void;
  windowMode: 'expanded' | 'compact' | 'custom';
  headerRef: React.RefObject<HTMLDivElement | null>;
}

export function CommandPaletteHeader({
  searchQuery,
  onSearchChange,
  searchMode,
  onSearchModeChange,
  onTabsExpanded,
  windowMode,
  headerRef,
}: CommandPaletteHeaderProps) {
  return (
    <div ref={headerRef} className="command-palette-header">
      <SearchBar
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Search commands, apps, and more..."
        currentMode={searchMode}
        onModeChange={onSearchModeChange}
        onTabsExpanded={onTabsExpanded}
        windowMode={windowMode}
      />
    </div>
  );
}
