import React from 'react';

export type SearchMode = 'file' | 'ai' | 'code';

export interface ModeTabsProps {
  currentMode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function ModeTabs({
  currentMode,
  onModeChange,
  expanded,
  onToggle,
}: ModeTabsProps) {
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

  const modeLabels: Record<SearchMode, string> = {
    file: 'Files',
    ai: 'Ask',
    code: 'Code'
  };

  const handleModeChange = (mode: SearchMode, event: React.MouseEvent) => {
    event.stopPropagation();
    onModeChange(mode);
  };

  return (
    <>
      {/* Collapsed State - Single Tab */}
      <button 
        className={`mode-tab-collapsed ${expanded ? 'hidden' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <svg className="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: modeColors[currentMode] }}>
          <path d={modeIcons[currentMode]} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="mode-label" style={{ color: modeColors[currentMode] }}>{modeLabels[currentMode]}</span>
      </button>
      
      {/* Expanded State - Three Tabs */}
      <div className={`mode-tabs-expanded ${expanded ? 'visible' : 'hidden'}`}>
        <button 
          className={`mode-tab ${currentMode === 'file' ? 'active' : ''}`}
          onClick={(e) => handleModeChange('file', e)}
        >
          <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7C3 5.89543 3.89543 5 5 5H9L11 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="mode-tab-label">Files</span>
        </button>
        
        <button 
          className={`mode-tab ${currentMode === 'ai' ? 'active' : ''}`}
          onClick={(e) => handleModeChange('ai', e)}
        >
          <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 10C8 10 9 8 12 8C15 8 16 10 16 10" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 12V12.01" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="9"/>
          </svg>
          <span className="mode-tab-label">Ask</span>
        </button>
        
        <button 
          className={`mode-tab ${currentMode === 'code' ? 'active' : ''}`}
          onClick={(e) => handleModeChange('code', e)}
        >
          <svg className="mode-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 18L22 12L16 6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 6L2 12L8 18" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="mode-tab-label">Code</span>
        </button>
      </div>
    </>
  );
}
