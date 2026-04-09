import React, { useRef, useEffect } from 'react';
import { ChatMessageBubble, ChatMessage } from '../ChatMessageBubble';
import { ChatWelcomeState } from './ChatWelcomeState';

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
}: ChatMessagesListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-messages-container">
      {welcomeState && messages.length === 0 ? (
        <ChatWelcomeState
          onSendExample={onSendExample}
          browserModeEnabled={browserModeEnabled}
          onEnableBrowserMode={onEnableBrowserMode}
        />
      ) : (
        <div className="chat-messages-area">
          {messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              onCopy={onCopy}
              onExplain={onExplain}
              onShowCode={onShowCode}
              onRegenerate={onRegenerate}
            />
          ))}
          {isLoading && (
            <div className="chat-typing-indicator" role="status" aria-label="AI is typing">
              <span className="typing-dot" key="dot-1" />
              <span className="typing-dot" key="dot-2" />
              <span className="typing-dot" key="dot-3" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}
