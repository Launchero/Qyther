import React, { useRef, useEffect, useState } from 'react';
import { ModeTabs } from './ModeTabs';
import { ChatHistoryDropdown } from './ChatHistoryDropdown';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

export type SearchMode = 'file' | 'ai' | 'code';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  currentMode?: SearchMode;
  onModeChange?: (mode: SearchMode) => void;
  onTabsExpanded?: (expanded: boolean) => void;
  windowMode?: 'expanded' | 'compact' | 'custom';
}

export function SearchBar({ 
  value, 
  onChange, 
  placeholder = 'Search...',
  currentMode = 'file',
  onModeChange,
  onTabsExpanded,
  windowMode = 'expanded'
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<SearchMode>(currentMode);
  const [tabsExpanded, setTabsExpanded] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);

  // Check if in compact window mode and AI search mode
  const isCompactWindow = windowMode === 'compact';
  const isAskMode = activeMode === 'ai';
  const isCompactAskMode = isCompactWindow && isAskMode;
  const isExpandedAskMode = windowMode === 'expanded' && isAskMode;
  
  // DEBUG: Log window mode on render
  console.log('[SearchBar] windowMode:', windowMode, 'isCompactWindow:', isCompactWindow, 'tabsExpanded:', tabsExpanded);

  // When mode dropdown is open, hide model selector and chat history
  // Also hide in expanded ask mode (the full chat panel will show these)
  const showModelAndHistory = !tabsExpanded && !isExpandedAskMode;

  // Mode-specific placeholders (matching mockup lines 797-816)
  const modePlaceholders: Record<SearchMode, string> = {
    file: 'Search for files, tools, actions...',
    ai: 'Ask anything about your code, files, or project...',
    code: 'Search for code snippets, functions, classes...'
  };

  const displayPlaceholder = placeholder || modePlaceholders[activeMode];

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  const handleModeChange = (mode: SearchMode) => {
    setActiveMode(mode);
    onModeChange?.(mode);
    setTabsExpanded(false);
    onTabsExpanded?.(false);
    inputRef.current?.focus();
  };

  const toggleTabs = () => {
    const newState = !tabsExpanded;
    setTabsExpanded(newState);
    onTabsExpanded?.(newState);
  };

  // Close tabs when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside the mode container
      if (tabsExpanded && tabsContainerRef.current && !tabsContainerRef.current.contains(target)) {
        setTabsExpanded(false);
        onTabsExpanded?.(false);
      }
      
      // Also check for clicks outside chat history
      if (chatHistoryOpen && tabsContainerRef.current && !tabsContainerRef.current.contains(target)) {
        setChatHistoryOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [tabsExpanded, chatHistoryOpen, onTabsExpanded]);

  // Focus input when window becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to ensure window is fully shown
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Focus input when Electron window is shown (from main process)
  useEffect(() => {
    const handleWindowShown = () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    };

    window.addEventListener('electron-window-shown', handleWindowShown);
    return () => {
      window.removeEventListener('electron-window-shown', handleWindowShown);
    };
  }, []);

  const handleChatSelect = (chatTitle: string) => {
    console.log('[SearchBar] Chat selected:', chatTitle);
    setChatHistoryOpen(false);
  };

  const handleNewChat = () => {
    console.log('[SearchBar] New chat requested');
    setChatHistoryOpen(false);
  };

  return (
    <div className={cn(
      // Mockup line 77-89: Compact command palette layout
      "flex items-center",
      "w-full",
      "h-full", // Fill parent height (100px in compact mode)
      "gap-[var(--spacing-gap-searchbar)]", // Mockup line 86: Exact 12px gap
      // Padding adjusted for 100px height (was 80px)
      "px-3 py-3", // Add vertical padding to center 44px content in 100px space
      isCompactWindow && "compact-window",
      tabsExpanded && "tabs-expanded",
      isCompactAskMode && "compact-ask-mode",
      isExpandedAskMode && "expanded-ask-mode"
    )}>
      {/* Mode Tab - Mockup lines 92-234 */}
      <div ref={tabsContainerRef} className="flex-shrink-0 self-center">
        <ModeTabs
          currentMode={activeMode}
          onModeChange={handleModeChange}
          expanded={tabsExpanded}
          onToggle={toggleTabs}
        />
      </div>

      {/* Search Input - Mockup lines 237-258 */}
      <div className={cn(
        "flex-1 flex items-center h-[var(--container-input-height)] self-center relative", // Mockup line 241: Exact 44px height
        "transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)" // Mockup line 242
      )}>
        <MagnifyingGlass 
          weight="bold"
          className="absolute left-3 h-4 w-4 text-muted-foreground" 
        />
        <Input
          id="search-input"
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={displayPlaceholder}
          className={cn(
            "pl-10 h-full border-0 bg-transparent focus-visible:ring-0",
            "text-base text-foreground placeholder:text-muted-foreground", // Mockup line 251: 16px font
            "font-body" // Mockup line 72: JetBrains Mono font
          )}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
      </div>

      {/* Clear Button (only in non-compact mode) */}
      {value && windowMode !== 'compact' && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <X weight="bold" className="h-4 w-4" />
        </Button>
      )}
      
      {/* Divider - Mockup lines 294-305 */}
      {/* Always show in compact mode, hide only when tabs are expanded */}
      <div className={cn(
        "w-px h-6 bg-border mx-[var(--spacing-1)] flex-shrink-0", // Mockup line 296-298: 1px width, 24px height, 4px margin
        "transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)", // Mockup line 299
        // Hide only when tabs are expanded OR in expanded ask mode
        (tabsExpanded || isExpandedAskMode) && "opacity-0 w-0 mx-0"
      )} />

      {/* Keyboard Shortcut - Mockup lines 261-291 */}
      {/* Always visible in compact window mode per mockup design */}
      <div className={cn(
        "flex items-center gap-1.5 flex-shrink-0 self-center",
        "transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)", // Mockup line 265
        // Hide only when tabs are expanded OR in expanded ask mode
        (tabsExpanded || isExpandedAskMode) && "opacity-0 w-0 gap-0"
      )}>
        {/* Mockup lines 277-291: Exact shortcut key styling (reduced to 28px for 80px height) */}
        <div className={cn(
          "flex items-center justify-center",
          "min-w-[var(--shortcut-key-width)] h-7 px-[var(--spacing-2)]", // Uses tokens: 28px width, 8px padding
          "bg-background border border-border", // Mockup line 284-285
          "rounded-[var(--radius-shortcut-key)]", // Mockup line 286: calc(var(--radius) - 2px) = 8px
          "text-[var(--text-xs)] font-medium text-muted-foreground", // Reduced to 12px font for 80px height
          "shadow-[var(--shadow-shortcut-key)]" // Mockup line 290: Exact shadow
        )}>
          ⌘
        </div>
        <div className={cn(
          "flex items-center justify-center",
          "min-w-[var(--shortcut-key-width)] h-7 px-[var(--spacing-2)]",
          "bg-background border border-border",
          "rounded-[var(--radius-shortcut-key)]",
          "text-[var(--text-xs)] font-medium text-muted-foreground",
          "shadow-[var(--shadow-shortcut-key)]"
        )}>
          K
        </div>
      </div>

      {/* Chat History Toggle (compact ask mode only) */}
      {isCompactAskMode && (
        <ChatHistoryDropdown
          onSelect={handleChatSelect}
          open={chatHistoryOpen}
          onToggle={() => setChatHistoryOpen(!chatHistoryOpen)}
          onNewChat={handleNewChat}
          visible={showModelAndHistory}
        />
      )}
    </div>
  );
}
