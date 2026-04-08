import React, { useRef, useEffect, useState } from 'react';

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

  const modeLabels: Record<SearchMode, string> = {
    file: 'Files',
    ai: 'Ask',
    code: 'Code'
  };

  const modeIcons: Record<SearchMode, string> = {
    file: 'M3 7C3 5.89543 3.89543 5 5 5H9L11 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z',
    ai: 'M8 10C8 10 9 8 12 8C15 8 16 10 16 10M12 12V12.01M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z',
    code: 'M16 18L22 12L16 6M8 6L2 12L8 18'
  };

  const modeColors: Record<SearchMode, string> = {
    file: 'var(--kraken-purple)',
    ai: '#149e61',
    code: '#d8571d'
  };

  // Real data for AI models from OpenCode SDK
  const [realModels, setRealModels] = useState<Array<{ id: string; name: string; description?: string; isRecommended?: boolean }>>([]);

  useEffect(() => {
    // Fetch models from OpenCode API
    window.electronAPI.opencode.getModels().then((models) => {
      setRealModels(models);
    }).catch((err) => {
      console.error('[SearchBar] Failed to load models:', err);
      // Fallback to default models if API fails
      setRealModels([
        { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship model', isRecommended: true },
        { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Fast GPT-4' },
        { id: 'google/gemini-2.0-pro', name: 'Gemini 2.0 Pro', description: 'Google best model' },
        { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Google fast model' },
        { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: 'Best for coding tasks' },
      ]);
    });
  }, []);

  // Mock data for chat history
  const mockChatHistory = [
    'Optimize Electron cold start',
    'React 19 best practices',
    'Fix ESLint errors in ipc',
    'TypeScript strict mode',
  ];

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    setModelSelectorOpen(false);
  };

  const handleChatSelect = (chatTitle: string) => {
    console.log('[SearchBar] Chat selected:', chatTitle);
    setChatHistoryOpen(false);
  };

  return (
    <div className={`search-bar ${tabsExpanded ? 'tabs-expanded' : ''} ${isCompactAskMode ? 'compact-ask-mode' : ''} ${isExpandedAskMode ? 'expanded-ask-mode' : ''}`}>
      {isCompactAskMode ? (
        /* Compact Ask Mode UI */
        <>
          {/* Mode Dropdown - Use same structure as file mode */}
          <div ref={tabsContainerRef} className="mode-tabs-container">
            {/* Collapsed State - Single Tab */}
            <button 
              className={`mode-tab-collapsed ${tabsExpanded ? 'hidden' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleTabs();
              }}
            >
              <svg className="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: modeColors[activeMode] }}>
                <path d={modeIcons[activeMode]} strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="mode-label" style={{ color: modeColors[activeMode] }}>{modeLabels[activeMode]}</span>
            </button>
            
            {/* Expanded State - Three Tabs */}
            <div className={`mode-tabs-expanded ${tabsExpanded ? 'visible' : 'hidden'}`}>
              <button 
                className={`mode-tab ${(activeMode as SearchMode) === 'file' ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModeChange('file');
                }}
              >
                <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7C3 5.89543 3.89543 5 5 5H9L11 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="mode-tab-label">Files</span>
              </button>
              
              <button 
                className={`mode-tab ${(activeMode as SearchMode) === 'ai' ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModeChange('ai');
                }}
              >
                <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 10C8 10 9 8 12 8C15 8 16 10 16 10" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 12V12.01" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="9"/>
                </svg>
                <span className="mode-tab-label">Ask</span>
              </button>
              
              <button 
                className={`mode-tab ${(activeMode as SearchMode) === 'code' ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModeChange('code');
                }}
              >
                <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 18L22 12L16 6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 6L2 12L8 18" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="mode-tab-label">Code</span>
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className={`search-container ${showModelAndHistory ? '' : 'expanded'}`}>
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={modeIcons[activeMode]} strokeLinecap="round" strokeLinejoin="round"/>
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
          <div className={`model-selector ${modelSelectorOpen ? 'open' : ''} ${showModelAndHistory ? 'visible' : 'hidden'}`}>
            <button 
              className="model-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setModelSelectorOpen(!modelSelectorOpen);
              }}
            >
              <svg className="model-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 8v8M8 12h8" strokeLinecap="round"/>
              </svg>
              <span className="model-name">
                {realModels.find(m => m.id === selectedModel)?.name || selectedModel || 'Select Model'}
              </span>
              <svg className="model-dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9L12 15L18 9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Model Dropdown Menu */}
            <div className="model-dropdown-menu">
              {realModels.map((model) => (
                <div
                  key={model.id}
                  className={`model-dropdown-item ${selectedModel === model.id ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleModelSelect(model.id);
                  }}
                >
                  <div className="model-dropdown-item-content">
                    <span className="model-dropdown-item-label">{model.name}</span>
                    {model.description && (
                      <span className="model-dropdown-item-desc">{model.description}</span>
                    )}
                  </div>
                  {model.isRecommended && (
                    <span className="model-dropdown-item-badge">Recommended</span>
                  )}
                  {selectedModel === model.id && (
                    <svg className="model-dropdown-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17L4 12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chat History Toggle */}
          <div className={`history-toggle ${chatHistoryOpen ? 'open' : ''} ${showModelAndHistory ? 'visible' : 'hidden'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            
            {/* History Dropdown */}
            <div className="history-dropdown">
              <div className="history-dropdown-header">
                <span className="history-dropdown-title">Recent Chats</span>
                <span className="new-chat-link">+ New</span>
              </div>
              {mockChatHistory.map((chat, index) => (
                <div
                  key={index}
                  className={`history-dropdown-item ${index === 0 ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChatSelect(chat);
                  }}
                >
                  <svg className="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="history-item-title">{chat}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Standard Mode UI (existing implementation) */
        <>
          {/* Mode Tabs - Expandable */}
          <div 
            ref={tabsContainerRef}
            className={`mode-tabs-container ${tabsExpanded ? 'expanded' : ''}`}
            style={{ width: tabsExpanded ? '50%' : 'auto' }}
          >
            {/* Collapsed State - Single Tab */}
            <button 
              className={`mode-tab-collapsed ${tabsExpanded ? 'hidden' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleTabs();
              }}
            >
              <svg className="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: modeColors[activeMode] }}>
                <path d={modeIcons[activeMode]} strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="mode-label">{modeLabels[activeMode]}</span>
            </button>
            
            {/* Expanded State - Three Tabs */}
            <div className={`mode-tabs-expanded ${tabsExpanded ? 'visible' : 'hidden'}`}>
              <button 
                className={`mode-tab ${(activeMode as SearchMode) === 'file' ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModeChange('file');
                }}
              >
                <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7C3 5.89543 3.89543 5 5 5H9L11 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="mode-tab-label">Files</span>
              </button>
              
              <button 
                className={`mode-tab ${(activeMode as SearchMode) === 'ai' ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModeChange('ai');
                }}
              >
                <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 10C8 10 9 8 12 8C15 8 16 10 16 10" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 12V12.01" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="9"/>
                </svg>
                <span className="mode-tab-label">Ask</span>
              </button>
              
              <button 
                className={`mode-tab ${(activeMode as SearchMode) === 'code' ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModeChange('code');
                }}
              >
                <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 18L22 12L16 6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 6L2 12L8 18" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="mode-tab-label">Code</span>
              </button>
            </div>
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
