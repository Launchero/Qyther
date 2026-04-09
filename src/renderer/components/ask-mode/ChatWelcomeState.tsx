import React from 'react';

interface QuickAction {
  icon: React.ReactNode;
  title: string;
  description: string;
  exampleQuery: string;
  requiresBrowser?: boolean;
}

interface ChatWelcomeStateProps {
  onSendExample: (query: string) => void;
  browserModeEnabled: boolean;
  onEnableBrowserMode?: () => void;
}

export function ChatWelcomeState({ 
  onSendExample, 
  browserModeEnabled,
  onEnableBrowserMode 
}: ChatWelcomeStateProps) {
  const quickActions: QuickAction[] = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" stroke="currentColor" strokeWidth="2"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
      ),
      title: "Search the web",
      description: "Find current info from any website",
      exampleQuery: "Search for the latest React documentation on hooks",
      requiresBrowser: true,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      title: "Extract data",
      description: "Scrape tables, lists, or structured info",
      exampleQuery: "Extract all pricing information from this URL",
      requiresBrowser: true,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2"/>
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ),
      title: "Code help",
      description: "Explain errors, show examples",
      exampleQuery: "Help me debug this TypeScript error",
      requiresBrowser: false,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6h16M4 12h16M4 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ),
      title: "Summarize content",
      description: "Get key points from any page",
      exampleQuery: "Summarize this article for me",
      requiresBrowser: true,
    },
  ];

  const filteredActions = browserModeEnabled 
    ? quickActions 
    : quickActions.filter(action => !action.requiresBrowser);

  return (
    <div className="chat-welcome-state" role="region" aria-label="Welcome to AI Assistant">
      <svg className="chat-welcome-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2"/>
      </svg>
      <h3 className="chat-welcome-title">How can I help you today?</h3>
      <p className="chat-welcome-subtitle">
        Ask me anything about coding, technology, or your project
      </p>

      {/* Quick Actions Grid */}
      <div className="quick-actions-grid" role="list">
        {filteredActions.map((action, index) => (
          <button
            key={index}
            className="quick-action-card"
            onClick={() => onSendExample(action.exampleQuery)}
            role="listitem"
            aria-label={`${action.title}: ${action.description}`}
            title={`${action.title}: ${action.description}`}
          >
            <div className="quick-action-icon">
              {action.icon}
            </div>
            <div className="quick-action-content">
              <h4 className="quick-action-title">{action.title}</h4>
              <p className="quick-action-description">{action.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Browser Automation Discovery */}
      {!browserModeEnabled && onEnableBrowserMode && (
        <div className="browser-automation-intro">
          <svg className="browser-automation-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
          <div className="browser-automation-content">
            <h4 className="browser-automation-title">Browser Automation Available</h4>
            <p className="browser-automation-description">
              I can navigate websites, fill forms, extract data, and take screenshots.
            </p>
            <button 
              className="browser-automation-cta"
              onClick={onEnableBrowserMode}
              aria-label="Enable browser automation mode"
            >
              Enable Browser Mode
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
