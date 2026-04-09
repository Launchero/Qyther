import React, { useRef, useEffect, useState } from 'react';
import { ChatMessageActions } from './ask-mode/ChatMessageActions';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  onCopy?: (content: string) => void;
  onExplain?: (content: string) => void;
  onShowCode?: (content: string) => void;
  onRegenerate?: () => void;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLanguage = '';
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0) {
      const ListTag = listType || 'ul';
      elements.push(
        <ListTag key={`list-${elements.length}`}>
          {listItems.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  const renderInlineMarkdown = (text: string): React.ReactNode => {
    // Handle inline code
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i}>{part.slice(1, -1)}</code>;
      }
      // Handle bold
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bp, j) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          return <strong key={`${i}-${j}`}>{bp.slice(2, -2)}</strong>;
        }
        return bp;
      });
    });
  };

  lines.forEach((line, index) => {
    // Code block handling
    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${index}`} className="chat-code-block">
            <code className={codeLanguage ? `language-${codeLanguage}` : ''}>{codeContent.trim()}</code>
          </pre>
        );
        codeContent = '';
        codeLanguage = '';
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeLanguage = codeBlockMatch[1] || '';
      }
      return;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      return;
    }

    // Heading handling
    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={index}>{renderInlineMarkdown(line.slice(4))}</h4>);
      return;
    }

    if (line.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={index}>{renderInlineMarkdown(line.slice(3))}</h3>);
      return;
    }

    if (line.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={index}>{renderInlineMarkdown(line.slice(2))}</h2>);
      return;
    }

    // List handling
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    const numberMatch = line.match(/^\d+\.\s+(.+)/);

    if (bulletMatch) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(bulletMatch[1]);
      return;
    }

    if (numberMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(numberMatch[1]);
      return;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={index}>{renderInlineMarkdown(line)}</p>
    );
  });

  flushList();

  return <>{elements}</>;
}

export function ChatMessageBubble({ message, onCopy, onExplain, onShowCode, onRegenerate }: ChatMessageBubbleProps) {
  const messageRef = useRef<HTMLDivElement>(null);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    if (messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  const isUser = message.role === 'user';
  const hasCode = message.content.includes('```');

  return (
    <div
      ref={messageRef}
      className={`chat-message-bubble ${message.role} ${message.isStreaming ? 'streaming' : ''}`}
      onMouseEnter={() => !message.isStreaming && setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onFocus={() => !message.isStreaming && setShowActions(true)}
      onBlur={() => setShowActions(false)}
      tabIndex={0}
      role="article"
      aria-label={`${message.role} message`}
    >
      <div className="chat-message-avatar">
        {isUser ? (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )}
      </div>
      
      <div className="chat-message-content">
        <SimpleMarkdown content={message.content} />
        
        {message.isStreaming && (
          <span className="streaming-cursor">▊</span>
        )}
        
        {!isUser && !message.isStreaming && (
          <ChatMessageActions
            messageContent={message.content}
            hasCode={hasCode}
            onCopy={onCopy || (() => {})}
            onExplain={onExplain || (() => {})}
            onShowCode={onShowCode || (() => {})}
            onRegenerate={onRegenerate}
            isVisible={showActions}
            isActionInProgress={false}
          />
        )}
      </div>
      
      <div className="chat-message-time">
        {formatTime(message.timestamp)}
      </div>
    </div>
  );
}
