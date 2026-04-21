import React, { useRef, useEffect } from 'react';
import { PlusIcon } from '@phosphor-icons/react';
import { ChatMessageBubble, ChatMessage } from '../ChatMessageBubble';
import { ChatErrorBanner } from './ChatErrorBanner';
import { ChatWelcomeState } from './ChatWelcomeState';
import type { InlineChatSession } from './RecentChatsInline';

interface ChatMessagesListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  welcomeState: boolean;
  browserModeEnabled: boolean;
  onSendExample: (query: string) => void;
  onEnableBrowserMode?: () => void;
  onCopy?: (content: string) => void;
  onExplain?: (content: string) => void;
  onShowCode?: (content: string) => void;
  onRegenerate?: () => void;
  onRelatedQuestion?: (question: string) => void;
  recentSessions?: InlineChatSession[];
  onSelectSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  error?: string | null;
  onRetry?: () => void;
  onEditQuery?: () => void;
  onFormSubmit?: (formTitle: string, formData: Record<string, unknown>) => void;
}

export function ChatMessagesList({
  messages,
  isLoading,
  welcomeState,
  browserModeEnabled,
  onSendExample,
  onEnableBrowserMode,
  onCopy,
  onExplain,
  onShowCode,
  onRegenerate,
  onRelatedQuestion,
  recentSessions,
  onSelectSession,
  onNewChat,
  error,
  onRetry,
  onEditQuery,
  onFormSubmit,
}: ChatMessagesListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {welcomeState ? (
        <div className="welcome-scroll-container flex-1 h-0 min-h-0 overflow-y-auto">
          <ChatWelcomeState
            onSendExample={onSendExample}
            recentSessions={recentSessions}
            onSelectSession={onSelectSession}
            onNewChat={onNewChat}
            browserModeEnabled={browserModeEnabled}
            onEnableBrowserMode={onEnableBrowserMode}
          />
        </div>
      ) : (
        <>
          {/* Chat header with New Chat button - visible when in active conversation */}
          {messages.length > 0 && onNewChat && (
            <div className="messages-header">
              <button
                className="messages-new-chat-btn"
                onClick={onNewChat}
                aria-label="Start new chat"
                title="Start a new conversation"
              >
                <PlusIcon className="w-4 h-4" weight="bold" />
                <span>New Chat</span>
              </button>
            </div>
          )}
          <div
            className="messages-area"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Chat messages"
          >
            {messages.map((message) => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                onCopy={onCopy}
                onExplain={onExplain}
                onShowCode={onShowCode}
                onRegenerate={onRegenerate}
                onRelatedQuestion={onRelatedQuestion}
                onFormSubmit={onFormSubmit}
              />
            ))}
            {isLoading && (
              <div className="flex gap-1 p-3 self-start" role="status" aria-live="polite" aria-label="AI is typing">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
              </div>
            )}
            {error && (
              <div className="answer self-start max-w-[100%]" role="alert" aria-live="assertive">
                <ChatErrorBanner
                  error={error}
                  onRetry={onRetry}
                  onNewChat={onNewChat}
                  onEditQuery={onEditQuery}
                />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </>
      )}
    </div>
  );
}