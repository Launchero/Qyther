import React, { useRef, useEffect, useState } from 'react';
import { ModeTabs } from './ModeTabs';
import type { SearchMode } from './ModeTabs';
import { ChatHistoryDropdown } from './ChatHistoryDropdown';
import { ShortcutKey } from '@/components/common/ShortcutKeys';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { logInfo } from '../utils/debugLogger';

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
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<SearchMode>(currentMode);
  const [tabsExpanded, setTabsExpanded] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const previousFocusRef = useRef<Element | null>(null);

  const isCompactWindow = windowMode === 'compact';
  const isAskMode = activeMode === 'ai';
  const isCompactAskMode = isCompactWindow && isAskMode;
  const isExpandedAskMode = windowMode === 'expanded' && isAskMode;
  
  // When mode dropdown is open, hide model selector and chat history
  // Also hide in expanded ask mode (the full chat panel will show these)
  const showModelAndHistory = !tabsExpanded && !isExpandedAskMode;

  // Mode-specific placeholders (matching mockup lines 797-816)
  const modePlaceholders: Record<SearchMode, string> = {
    file: 'Search for files, tools, actions...',
    ai: 'Ask anything about your code, files, or project...',
  };

  const displayPlaceholder = placeholder || modePlaceholders[activeMode];

  // Focus input when Electron window is shown, restoring previous focus if available
  useEffect(() => {
    const handleWindowWillHide = () => {
      previousFocusRef.current = document.activeElement;
    };

    const handleWindowShown = () => {
      requestAnimationFrame(() => {
        if (
          previousFocusRef.current &&
          document.contains(previousFocusRef.current) &&
          previousFocusRef.current instanceof HTMLElement
        ) {
          previousFocusRef.current.focus();
        } else {
          inputRef.current?.focus();
        }
      });
    };

    window.addEventListener('electron-window-will-hide', handleWindowWillHide);
    window.addEventListener('electron-window-shown', handleWindowShown);
    return () => {
      window.removeEventListener('electron-window-will-hide', handleWindowWillHide);
      window.removeEventListener('electron-window-shown', handleWindowShown);
    };
  }, []);

  // Focus input on mount (initial open)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sync activeMode with currentMode prop (for keyboard shortcuts)
  useEffect(() => {
    if (currentMode !== activeMode) {
      setActiveMode(currentMode);
    }
  }, [currentMode]);

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

  // Handle Enter key to send message in Ask mode
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && isAskMode && value.trim()) {
      e.preventDefault();
      onSendMessage?.();
    }
  };

  // Close tabs when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
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

  const handleChatSelect = (chatTitle: string) => {
    logInfo('[SearchBar] Chat selected:', chatTitle);
    setChatHistoryOpen(false);
  };

  const handleNewChat = () => {
    logInfo('[SearchBar] New chat requested');
    setChatHistoryOpen(false);
  };

  return (
    <div className={cn(
      // Mockup line 77-89: Compact command palette layout
      "flex items-center",
      "w-full",
      "h-full", // Fill 100px header height in all modes
      "gap-[var(--spacing-gap-searchbar)]", // Mockup line 86: Exact 12px gap
      // Padding for 100px header (16px horizontal, 12px vertical to center 44px input)
      "px-4 py-3",
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
      {/* Hidden in expanded Ask mode - UnifiedCommandBar becomes the primary input */}
      {!isExpandedAskMode && (
        <div className={cn(
          "flex-1 flex items-center h-[var(--container-input-height)] self-center relative",
          "transition-all duration-[var(--duration-300)] ease-[var(--easing-smooth)]"
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
            onKeyDown={handleKeyDown}
            placeholder={displayPlaceholder}
            className={cn(
              "pl-10 h-full",
              "text-base text-foreground placeholder:text-muted-foreground",
              "font-body"
            )}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
      )}

      {/* Clear Button (hidden in compact mode and expanded Ask mode) */}
      {value && windowMode !== 'compact' && !isExpandedAskMode && (
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
        "transition-all duration-[var(--duration-300)] ease-[var(--easing-smooth)]", // Mockup line 299
        // Hide only when tabs are expanded OR in expanded ask mode
        (tabsExpanded || isExpandedAskMode) && "opacity-0 w-0 mx-0"
      )} />

      {/* Keyboard Shortcut - Alt+Space (global shortcut) */}
      {/* Always visible in compact window mode per mockup design */}
      <div className={cn(
        "flex items-center gap-1.5 flex-shrink-0 self-center",
        "transition-all duration-[var(--duration-300)] ease-[var(--easing-smooth)]",
        (tabsExpanded || isExpandedAskMode) && "opacity-0 w-0 gap-0"
      )}>
        <ShortcutKey alt />
        <ShortcutKey label="Space" />
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
