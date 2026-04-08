import React, { useRef, useEffect, useState } from 'react';
import { ModeTabs } from './ModeTabs';
import { ModelSelector } from './ModelSelector';
import { ChatHistoryDropdown } from './ChatHistoryDropdown';

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
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet');
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);

  // Check if in compact window mode and AI search mode
  const isCompactWindow = windowMode === 'compact';
  const isAskMode = activeMode === 'ai';
  const isCompactAskMode = isCompactWindow && isAskMode;
  const isExpandedAskMode = windowMode === 'expanded' && isAskMode;

  // When mode dropdown is open, hide model selector and chat history
  // Also hide in expanded ask mode (the full chat panel will show these)
  const showModelAndHistory = !tabsExpanded && !isExpandedAskMode;

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
      
      // Also check for clicks outside model selector and chat history
      if (modelSelectorOpen && tabsContainerRef.current && !tabsContainerRef.current.contains(target)) {
        setModelSelectorOpen(false);
      }
      
      if (chatHistoryOpen && tabsContainerRef.current && !tabsContainerRef.current.contains(target)) {
        setChatHistoryOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [tabsExpanded, modelSelectorOpen, chatHistoryOpen, onTabsExpanded]);

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

  const modePlaceholders: Record<SearchMode, string> = {
    file: 'Search files...',
    ai: 'Ask anything or press ⌘K...',
    code: 'Search code...'
  };

  const displayPlaceholder = placeholder || modePlaceholders[activeMode];

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    setModelSelectorOpen(false);
  };

  const handleChatSelect = (chatTitle: string) => {
    console.log('[SearchBar] Chat selected:', chatTitle);
    setChatHistoryOpen(false);
  };

  const handleNewChat = () => {
    console.log('[SearchBar] New chat requested');
    setChatHistoryOpen(false);
  };

  return (
    <div className={`search-bar ${tabsExpanded ? 'tabs-expanded' : ''} ${isCompactAskMode ? 'compact-ask-mode' : ''} ${isExpandedAskMode ? 'expanded-ask-mode' : ''}`}>
      {isCompactAskMode ? (
        /* Compact Ask Mode UI */
        <>
          {/* Mode Dropdown */}
          <div ref={tabsContainerRef} className="mode-tabs-container">
            <ModeTabs
              currentMode={activeMode}
              onModeChange={handleModeChange}
              expanded={tabsExpanded}
              onToggle={toggleTabs}
            />
          </div>

          {/* Search Input */}
          <div className={`search-container ${showModelAndHistory ? '' : 'expanded'}`}>
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 10C8 10 9 8 12 8C15 8 16 10 16 10M12 12V12.01M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input
              id="search-input"
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={displayPlaceholder}
              className="search-input"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
          </div>

          {/* Divider */}
          <div className={`divider ${showModelAndHistory ? 'visible' : 'hidden'}`}></div>

          {/* Model Selector */}
          <ModelSelector
            selectedModel={selectedModel}
            onSelect={handleModelSelect}
            open={modelSelectorOpen}
            onToggle={() => setModelSelectorOpen(!modelSelectorOpen)}
            visible={showModelAndHistory}
          />

          {/* Chat History Toggle */}
          <ChatHistoryDropdown
            onSelect={handleChatSelect}
            open={chatHistoryOpen}
            onToggle={() => setChatHistoryOpen(!chatHistoryOpen)}
            onNewChat={handleNewChat}
            visible={showModelAndHistory}
          />
        </>
      ) : (
        /* Standard Mode UI */
        <>
          {/* Mode Tabs */}
          <div 
            ref={tabsContainerRef}
            className={`mode-tabs-container ${tabsExpanded ? 'expanded' : ''}`}
            style={{ width: tabsExpanded ? '50%' : 'auto' }}
          >
            <ModeTabs
              currentMode={activeMode}
              onModeChange={handleModeChange}
              expanded={tabsExpanded}
              onToggle={toggleTabs}
            />
          </div>

          {/* Search Input */}
          <div className="search-container">
            <input
              id="search-input"
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={displayPlaceholder}
              className="search-input"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
          </div>

          {/* Clear Button */}
          {value && (
            <button 
              className="clear-button"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          
          {/* Keyboard Shortcut */}
          <div className="keyboard-shortcut">
            <div className="divider" />
            <div className="shortcut-key">⌘</div>
            <div className="shortcut-key">K</div>
          </div>
        </>
      )}
    </div>
  );
}
