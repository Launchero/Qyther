import React, { useState } from 'react';
import { SearchBar } from './SearchBar';
import { type SearchMode } from './ModeTabs';
import { ModeTabs } from './ModeTabs';
import { cn } from '@/lib/utils';

export type RegisterInputFn = (name: string, ref: React.RefObject<HTMLElement | null>) => () => void;

export interface CommandPaletteHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onTabsExpanded: (expanded: boolean) => void;
  windowMode: 'expanded' | 'compact' | 'custom';
  headerRef: React.RefObject<HTMLDivElement | null>;
  isCollapsing?: boolean;
  registerInput?: RegisterInputFn;
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
  registerInput,
}: CommandPaletteHeaderProps) {
  const isAskMode = searchMode === 'ai';
  const [askTabsExpanded, setAskTabsExpanded] = useState(false);

  const handleAskTabsExpanded = (expanded: boolean) => {
    setAskTabsExpanded(expanded);
    onTabsExpanded(expanded);
  };

  return (
    <div
      // Keyed so the header remounts with the view it belongs to: the body swaps on the same
      // signal, and a header that pops while the body fades reads as two separate events.
      key={isAskMode ? 'ask' : 'files'}
      ref={headerRef}
      className={cn(
        "w-full",
        "flex-shrink-0",
        "bg-card text-card-foreground",
        // In file mode, use the fixed 72px header (must equal main's compact window height).
        "h-[var(--container-header-height)]",
        // The view this header belongs to just mounted.
        "view-enter",
        // Border: compact file mode has none, and Ask mode's own header row draws the
        // single rule — the wrapper must not add a second one a pixel below it.
        windowMode === 'compact' || isAskMode
          ? "border-0"
          : "border-b border-border",
        // Visual transition cue: brief highlight when auto-collapsing
        isCollapsing && "collapse-flash",
        "transition-colors duration-[var(--duration-200)]"
      )}
    >
      {isAskMode ? (
        <div className="ask-mode-header-minimal h-full">
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
          registerInput={registerInput}
        />
      )}
    </div>
  );
}
