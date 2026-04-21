import React from 'react';
import { ChatTeardropTextIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface InlineChatSession {
  id: string;
  title: string;
}

interface RecentChatsInlineProps {
  sessions: InlineChatSession[];
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  className?: string;
}

export function RecentChatsInline({
  sessions,
  onSelectSession,
  onNewChat,
  className,
}: RecentChatsInlineProps) {
  const recentSessions = sessions.slice(0, 3);

  return (
    <div className={cn('recent-chats', className)}>
      <div className="recent-chats-header">
        <span className="recent-chats-title">Recent Chats</span>
        <button
          className="new-chat-btn"
          onClick={onNewChat}
          aria-label="Start new chat"
        >
          + New Chat
        </button>
      </div>
      {recentSessions.length > 0 && (
        <div className="recent-chats-list" role="list">
          {recentSessions.map((session) => (
            <button
              key={session.id}
              className="recent-chat-item"
              onClick={() => onSelectSession(session.id)}
              role="listitem"
              aria-label={`Open chat: ${session.title}`}
            >
              <ChatTeardropTextIcon className="recent-chat-icon" weight="regular" />
              <span className="recent-chat-text" title={session.title}>
                {session.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
