import React from 'react';
import { SearchBar, type SearchMode } from './SearchBar';
import { cn } from '@/lib/utils';

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
    // Launcher window header styling following shadcn design system
    // Mockup lines 77-89: Compact mode = borderless (100px height), expanded/custom = bottom border
    <div 
      ref={headerRef} 
      className={cn(
        // Layout - fill parent height and center content
        "w-full h-full",
        "flex items-center",
        "flex-shrink-0", // Prevent growing
        
        // Theming - use semantic color tokens from shadcn
        "bg-card text-card-foreground",
        
        // Border handling: compact mode has no border, others have bottom border
        windowMode === 'compact' 
          ? "border-0" 
          : "border-b border-border",
        
        // Smooth transitions for mode changes
        "transition-colors duration-200"
      )}
    >
      <SearchBar
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Search for files, tools, actions..."
        currentMode={searchMode}
        onModeChange={onSearchModeChange}
        onTabsExpanded={onTabsExpanded}
        windowMode={windowMode}
      />
    </div>
  );
}
