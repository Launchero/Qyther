import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { MagnifyingGlassIcon, XIcon, GlobeIcon } from '@phosphor-icons/react';

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: Date;
  messageCount?: number;
  hasBrowserSession?: boolean;
  lastMessage?: string;
}

interface ChatHistoryPanelProps {
  sessions: ChatSession[];
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  isVisible: boolean;
  searchPlaceholder?: string;
}

interface HistoryGroup {
  label: string;
  sessions: ChatSession[];
}

export function ChatHistoryPanel({
  sessions,
  onSelectSession,
  onNewChat,
  isVisible,
  searchPlaceholder = "Search conversations...",
}: ChatHistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus search input when panel opens and restore focus when it closes
  useEffect(() => {
    if (isVisible) {
      previousFocusRef.current = document.activeElement;
      searchInputRef.current?.focus();
    } else if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
    }
  }, [isVisible]);

  // Filter and group sessions by time
  const groupedSessions = useMemo<HistoryGroup[]>(() => {
    if (!sessions || sessions.length === 0) return [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setDate(thisMonth.getDate() - 30);

    // Filter sessions based on search query
    let filteredSessions = sessions;
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase().trim();
      filteredSessions = sessions.filter(session => {
        const titleMatch = session.title.toLowerCase().includes(query);
        const lastMessageMatch = session.lastMessage?.toLowerCase().includes(query);
        return titleMatch || lastMessageMatch;
      });
    }

    // Sort by updatedAt (most recent first)
    const sorted = [...filteredSessions].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Group by time period
    const groups: HistoryGroup[] = [];
    const todaySessions: ChatSession[] = [];
    const thisWeekSessions: ChatSession[] = [];
    const thisMonthSessions: ChatSession[] = [];
    const olderSessions: ChatSession[] = [];

    sorted.forEach(session => {
      const updatedAt = new Date(session.updatedAt);
      
      if (updatedAt >= today) {
        todaySessions.push(session);
      } else if (updatedAt >= thisWeek) {
        thisWeekSessions.push(session);
      } else if (updatedAt >= thisMonth) {
        thisMonthSessions.push(session);
      } else {
        olderSessions.push(session);
      }
    });

    if (todaySessions.length > 0) {
      groups.push({ label: 'Today', sessions: todaySessions });
    }
    if (thisWeekSessions.length > 0) {
      groups.push({ label: 'This Week', sessions: thisWeekSessions });
    }
    if (thisMonthSessions.length > 0) {
      groups.push({ label: 'This Month', sessions: thisMonthSessions });
    }
    if (olderSessions.length > 0) {
      groups.push({ label: 'Older', sessions: olderSessions });
    }

    return groups;
  }, [sessions, debouncedSearch]);

  // Format relative time
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }).format(new Date(date));
  };

  if (!isVisible) return null;

  return (
    <div className="chat-history-panel" role="dialog" aria-label="Chat history">
      {/* History Header with Search */}
      <div className="history-header">
        <div className="history-search-container">
          <MagnifyingGlassIcon className="history-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="history-search-input"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search conversations"
          />
          {searchQuery && (
            <button
              className="history-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <XIcon />
            </button>
          )}
        </div>
        <button 
          className="history-new-chat-btn"
          onClick={onNewChat}
          aria-label="Start new chat"
        >
          + New
        </button>
      </div>

      {/* Grouped Sessions */}
      <div className="history-groups" role="list">
        {groupedSessions.length === 0 ? (
          <div className="history-no-results">
            <MagnifyingGlassIcon />
            <p>No conversations found</p>
            {searchQuery && (
              <button 
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          groupedSessions.map((group, groupIndex) => (
            <div key={groupIndex} className="history-group" role="listitem">
              <h4 className="history-group-label">{group.label}</h4>
              <div className="history-group-sessions">
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="history-session-item"
                    onClick={() => onSelectSession(session.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectSession(session.id);
                      }
                    }}
                    aria-label={`Open chat: ${session.title}`}
                    title={session.title}
                  >
                    <div className="history-session-content">
                      {session.hasBrowserSession && (
                        <GlobeIcon className="history-browser-indicator" />
                      )}
                      <div className="history-session-text">
                        <div className="history-session-title">
                          {session.title}
                        </div>
                        {session.lastMessage && (
                          <div className="history-session-preview">
                            {session.lastMessage.length > 60 
                              ? `${session.lastMessage.substring(0, 60)}...` 
                              : session.lastMessage}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="history-session-meta">
                      {session.messageCount && (
                        <span className="session-message-count">
                          {session.messageCount} msgs
                        </span>
                      )}
                      <span className="session-timestamp">
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
