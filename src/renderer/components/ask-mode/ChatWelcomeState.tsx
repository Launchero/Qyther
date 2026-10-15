import React from 'react';
import { FileIcon, FolderIcon, BugIcon, WrenchIcon } from '@phosphor-icons/react';
import { RecentChatsInline, InlineChatSession } from './RecentChatsInline';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SuggestionCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  exampleQuery: string;
  requiresBrowser?: boolean;
}

interface ChatWelcomeStateProps {
  onSendExample: (query: string) => void;
  recentSessions?: InlineChatSession[];
  onSelectSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  browserModeEnabled?: boolean;
  onEnableBrowserMode?: () => void;
  className?: string;
  recentSearchResults?: Array<{ title: string; type: string }>;
}

const suggestionCards: SuggestionCard[] = [
  {
    icon: <FolderIcon weight="regular" aria-hidden="true" />,
    title: 'Find code or files',
    description: 'Search your workspace and get context-aware answers.',
    exampleQuery: 'Where is the authentication middleware defined?',
    requiresBrowser: false,
  },
  {
    icon: <BugIcon weight="regular" aria-hidden="true" />,
    title: 'Debug an error',
    description: 'Paste an error and get a root cause analysis.',
    exampleQuery: 'Why am I getting "Cannot read properties of undefined"?',
    requiresBrowser: false,
  },
  {
    icon: <WrenchIcon weight="regular" aria-hidden="true" />,
    title: 'Use tools & APIs',
    description: 'Run MCP tools, fetch data, or call external services.',
    exampleQuery: 'Fetch the latest npm package versions for my dependencies',
    requiresBrowser: false,
  },
];

export function ChatWelcomeState({
  onSendExample,
  recentSessions,
  onSelectSession,
  onNewChat,
  browserModeEnabled = false,
  onEnableBrowserMode,
  className,
  recentSearchResults,
}: ChatWelcomeStateProps) {
  const filteredActions = browserModeEnabled
    ? suggestionCards
    : suggestionCards.filter(action => !action.requiresBrowser);

  return (
    <div className={cn('welcome-state', className)} role="region" aria-label="Welcome to AI Assistant">
      <img src="/logo-nothing-terminal.svg" alt="Qyther" className="welcome-logo dark:hidden" />
      <img src="/logo-nothing-terminal-light.svg" alt="Qyther" className="welcome-logo hidden dark:block" />
      <div>
        <div className="welcome-title">What do you need help with?</div>
        <div className="welcome-subtitle">
          Search your files, query the web, debug errors, or use tools — all from this palette.
        </div>
      </div>

      {/* Recent Chats - always show "New Chat" button, even when no sessions */}
      {onSelectSession && onNewChat && (
        <RecentChatsInline
          sessions={recentSessions || []}
          onSelectSession={onSelectSession}
          onNewChat={onNewChat}
        />
      )}

      {/* Context-aware suggestions from recent search */}
      {recentSearchResults && recentSearchResults.length > 0 && (
        <div className="mb-6">
          <div className="px-1 pb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[var(--tracking-label)]">
              From Your Search
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearchResults.slice(0, 3).map((r) => (
              <Button
                key={r.title}
                type="button"
                variant="secondary"
                size="xs"
                // `.recent-search-chip` carries the stagger — keep it on the element.
                className="recent-search-chip"
                onClick={() => onSendExample(`Tell me about ${r.title}`)}
              >
                {r.title}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="suggestion-grid">
        {filteredActions.map((action, index) => (
          <button
            key={index}
            className="suggestion-card"
            onClick={() => onSendExample(action.exampleQuery)}
            role="listitem"
            aria-label={`${action.title}: ${action.description}`}
            title={`${action.title}: ${action.description}`}
          >
            <div className="suggestion-card-icon">
              {action.icon}
            </div>
            <div className="suggestion-card-title">{action.title}</div>
            <div className="suggestion-card-desc">{action.description}</div>
          </button>
        ))}
      </div>

      {!browserModeEnabled && onEnableBrowserMode && (
        <div className="browser-automation-intro">
          <FileIcon className="browser-automation-icon" aria-hidden="true" />
          <div className="browser-automation-content">
            <h4 className="browser-automation-title">Browser Automation Available</h4>
            <p className="browser-automation-description">
              I can navigate websites, fill forms, extract data, and take screenshots.
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="browser-automation-cta"
              onClick={onEnableBrowserMode}
              aria-label="Enable browser automation mode"
            >
              Enable Browser Mode
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
