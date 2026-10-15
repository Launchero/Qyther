import React from 'react';
import { ChatTeardropTextIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
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
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="new-chat-btn"
          onClick={onNewChat}
          aria-label="Start new chat"
          title="Start a new conversation"
        >
          + New Chat
        </Button>
      </div>
      {recentSessions.length > 0 && (
        <div className="recent-chats-list" role="list">
          {recentSessions.map((session) => (
            <Button
              key={session.id}
              type="button"
              variant="ghost"
              size="sm"
              className="recent-chat-item justify-start"
              onClick={() => onSelectSession(session.id)}
              role="listitem"
              aria-label={`Open chat: ${session.title}`}
              title={`Open chat: ${session.title}`}
            >
              <ChatTeardropTextIcon className="recent-chat-icon" weight="regular" aria-hidden="true" />
              <span className="recent-chat-text">{session.title}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
