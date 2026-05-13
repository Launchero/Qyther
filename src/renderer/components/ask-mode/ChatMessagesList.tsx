import React, { useRef, useEffect } from 'react';
import { PlusIcon } from '@phosphor-icons/react';
import autoAnimate from '@formkit/auto-animate';
import { ChatMessageBubble, ChatMessage } from '../ChatMessageBubble';
import { ChatErrorBanner } from './ChatErrorBanner';
import { ChatWelcomeState } from './ChatWelcomeState';
import { DesktopConfirmationDialog } from './DesktopConfirmationDialog';
import { AgentIndicator } from './AgentIndicator';
import type { InlineChatSession } from './RecentChatsInline';

interface ChatMessagesListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  welcomeState: boolean;
  browserModeEnabled: boolean;
  desktopModeEnabled?: boolean;
  activeAgent?: { label: string } | null;
  desktopConfirmation?: { threadId: string; action: string; description: string; planActions: Array<{ type: string; description: string; success: boolean; result?: string }> } | null;
  onConfirmDesktopAction?: (confirmed: boolean) => void;
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
  recentSearchResults?: Array<{ title: string; type: string }>;
}

export function ChatMessagesList({
  messages,
  isLoading,
  welcomeState,
  browserModeEnabled,
  desktopModeEnabled: _desktopModeEnabled = false,
  activeAgent = null,
  desktopConfirmation = null,
  onConfirmDesktopAction = () => {},
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
  recentSearchResults,
}: ChatMessagesListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messagesAreaRef.current) {
      autoAnimate(messagesAreaRef.current, {
        duration: 200,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      });
    }
  }, []);

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
            recentSearchResults={recentSearchResults}
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
            ref={messagesAreaRef}
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
            {/* Desktop Confirmation Dialog */}
            {desktopConfirmation && (
              <div className="desktop-confirmation-container mx-[var(--spacing-6)] my-[var(--spacing-2)]" role="alert" aria-live="assertive">
                <DesktopConfirmationDialog
                  action={desktopConfirmation.action}
                  description={desktopConfirmation.description}
                  onConfirm={() => onConfirmDesktopAction(true)}
                  onDeny={() => onConfirmDesktopAction(false)}
                />
              </div>
            )}
            {isLoading && activeAgent && (
              <AgentIndicator agent={activeAgent} isStreaming className="mx-[var(--spacing-6)] mb-[var(--spacing-2)] self-start" />
            )}
            {isLoading && (
              <div className="flex gap-[var(--spacing-1)] p-3 self-start ml-[var(--spacing-6)]" role="status" aria-live="polite" aria-label="AI is typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
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