import React, { useRef, useEffect, useState } from 'react';
import { ModeTabs } from './ModeTabs';
import type { SearchMode } from './ModeTabs';
import { ShortcutKey } from '@/components/common/ShortcutKeys';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

export type { SearchMode } from './ModeTabs';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  currentMode?: SearchMode;
  onModeChange?: (mode: SearchMode) => void;
  onTabsExpanded?: (expanded: boolean) => void;
  windowMode?: 'expanded' | 'compact' | 'custom';
  onSendMessage?: () => void;
  registerInput?: (name: string, ref: React.RefObject<HTMLElement | null>) => () => void;
}

export function SearchBar({ 
  value, 
  onChange, 
  placeholder = 'Search...',
  currentMode = 'file',
  onModeChange,
  onTabsExpanded,
  windowMode = 'expanded',
  onSendMessage,
  registerInput,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tabsExpanded, setTabsExpanded] = useState(false);

  const isCompactWindow = windowMode === 'compact';
  const isAskMode = currentMode === 'ai';
  const isExpandedAskMode = windowMode === 'expanded' && isAskMode;

  // Mode-specific placeholders (matching mockup lines 797-816)
  const modePlaceholders: Record<SearchMode, string> = {
    file: 'Search for files, tools, actions...',
    ai: 'Ask anything about your code, files, or project...',
  };

  const displayPlaceholder = placeholder || modePlaceholders[currentMode];

  // Register this input with the focus manager so show/mode routing can reach it.
  // The show/hide listeners themselves live in useFocusManager (mounted by CommandPalette),
  // not here: the header unmounts this component in Ask mode, so a SearchBar-owned
  // listener can never focus the Ask textarea when the palette is summoned in that tab.
  useEffect(() => {
    if (registerInput) {
      return registerInput('searchbar', inputRef as React.RefObject<HTMLElement | null>);
    }
  }, [registerInput]);

  const handleModeChange = (mode: SearchMode) => {
    onModeChange?.(mode);
    setTabsExpanded(false);
    onTabsExpanded?.(false);
  };

  const toggleTabs = () => {
    const newState = !tabsExpanded;
    setTabsExpanded(newState);
    onTabsExpanded?.(newState);
  };

  // Handle Enter key to send message in Ask mode
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Composition confirmation uses Enter too — never send half-converted text.
    if (e.nativeEvent?.isComposing) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && isAskMode && value.trim()) {
      e.preventDefault();
      onSendMessage?.();
    }
  };

  return (
    <div className={cn(
      // Mockup line 77-89: Compact command palette layout
      "flex items-center",
      "w-full",
      "h-full", // Fill the 72px header height in all modes
      "gap-[var(--spacing-gap-searchbar)]", // Mockup line 86: Exact 12px gap
      // Padding for the 72px header (16px horizontal, 12px vertical to center the 40px input)
      "px-4 py-[var(--padding-block-section)]"
      // NOTE: the former `compact-window` / `compact-ask-mode` / `expanded-ask-mode` /
      // `tabs-expanded` classes are removed — no stylesheet defined any of them, so the ~100px
      // compact window silently got expanded-mode padding. The data-* attributes below are the
      // hook that styling needs; defining the rules is a styles/ change, not a JSX one.
    )}
      data-window-mode={windowMode}
      data-search-mode={currentMode}
      data-tabs-expanded={tabsExpanded || undefined}
    >
      {/* Mode Tab - Mockup lines 92-234 */}
      <div className="flex-shrink-0 self-center">
        <ModeTabs
          currentMode={currentMode}
          onModeChange={handleModeChange}
          expanded={tabsExpanded}
          onToggle={toggleTabs}
        />
      </div>

      {/* Search Input - Mockup lines 237-258 */}
      {/* Hidden in expanded Ask mode - UnifiedCommandBar becomes the primary input */}
      {!isExpandedAskMode && (
        <div className={cn(
          "flex-1 flex items-center h-[var(--container-input-height)] self-center relative",
          "transition-opacity duration-[var(--duration-300)] ease-[var(--easing-smooth)]"
        )}>
          <MagnifyingGlass
            weight="bold"
            aria-hidden="true"
            className="absolute left-3 h-4 w-4 text-muted-foreground"
          />
          <Input
            id="search-input"
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={displayPlaceholder}
            className={cn(
              "pl-10 h-full",
              "text-base text-foreground placeholder:text-muted-foreground",
              "font-body"
            )}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
      )}

      {/* Clear Button (hidden in compact mode and expanded Ask mode) */}
      {value && !isCompactWindow && !isExpandedAskMode && (
        <Button
          variant="ghost"
          size="icon-lg"
          className="flex-shrink-0"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          title="Clear search"
          aria-label="Clear search"
        >
          <X weight="bold" className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      
      {/* Divider - Mockup lines 294-305 */}
      {/* Always show in compact mode, hide only when tabs are expanded */}
      <div className={cn(
        "w-px h-6 bg-border mx-[var(--spacing-1)] flex-shrink-0", // Mockup line 296-298: 1px width, 24px height, 4px margin
        // Only the collapse properties animate — the previous all-property transition also tweened
        // width and margin against every unrelated change on this node.
        "transition-[opacity,margin,width] duration-[var(--duration-300)] ease-[var(--easing-smooth)]", // Mockup line 299
        // Hide only when tabs are expanded OR in expanded ask mode
        (tabsExpanded || isExpandedAskMode) && "opacity-0 w-0 mx-0"
      )} />

      {/* Keyboard Shortcut - Alt+Space (global shortcut) */}
      {/* Always visible in compact window mode per mockup design */}
      <div className={cn(
        "flex items-center gap-[var(--gap-inline)] flex-shrink-0 self-center",
        "transition-[opacity,margin,gap] duration-[var(--duration-300)] ease-[var(--easing-smooth)]",
        (tabsExpanded || isExpandedAskMode) && "opacity-0 w-0 gap-0"
      )}>
        <ShortcutKey alt />
        <ShortcutKey label="Space" />
      </div>
    </div>
  );
}
