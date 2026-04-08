import React, { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType, ToolCall } from '../data/mockAskData';

// Extended tool call interface for real-time updates
interface ExtendedToolCall extends ToolCall {
  logs?: string[];
}

interface ChatMessageProps {
  message: ChatMessageType & {
    toolCalls?: ExtendedToolCall[];
  };
}

function ToolCallIndicator({ toolCall }: { toolCall: ExtendedToolCall }) {
  const statusColors: Record<string, string> = {
    pending: 'var(--kraken-yellow)',
    running: 'var(--kraken-purple)',
    completed: 'var(--kraken-green)',
    error: 'var(--kraken-red)',
  };

  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="tool-call-indicator">
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <span className="tool-call-icon">⚡</span>
        <span className="tool-call-name">{toolCall.name}</span>
        <span className="tool-call-server">({toolCall.server})</span>
        <span className="tool-call-progress" style={{ color: statusColors[toolCall.status] }}>
          {toolCall.status === 'running' && toolCall.progress !== undefined
            ? `${Math.round(toolCall.progress * 100)}%`
            : toolCall.status}
        </span>
        {toolCall.logs && toolCall.logs.length > 0 && (
          <span className="tool-call-expand" style={{ marginLeft: '8px', fontSize: '10px' }}>
            {expanded ? '▼' : '▶'} {toolCall.logs.length} logs
          </span>
        )}
      </div>
      {toolCall.status === 'running' && (
        <div className="tool-call-progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(toolCall.progress || 0) * 100}%` }}
          />
        </div>
      )}
      {expanded && toolCall.logs && toolCall.logs.length > 0 && (
        <div className="tool-call-logs">
          {toolCall.logs.map((log, i) => (
            <div key={i} className="tool-call-log-line">{log}</div>
          ))}
        </div>
      )}
      {toolCall.result && (
        <div className="tool-call-result">
          <span className="tool-call-result-label">Result:</span>
          <pre className="tool-call-result-content">{toolCall.result}</pre>
        </div>
      )}
    </div>
  );
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
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${index}`} className="chat-code-block">
            <code>{codeContent.trim()}</code>
          </pre>
        );
        codeContent = '';
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
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

export function ChatMessage({ message }: ChatMessageProps) {
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  const isUser = message.role === 'user';

  return (
    <div
      ref={messageRef}
      className={`chat-message ${message.role}`}
    >
      <div className="chat-message-header">
        <span className="chat-message-role">
          {isUser ? 'You' : 'Assistant'}
        </span>
        <span className="chat-message-time">{formatTime(message.timestamp)}</span>
      </div>
      <div className={`chat-message-content ${isUser ? 'user' : 'assistant'}`}>
        <SimpleMarkdown content={message.content} />
      </div>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="tool-calls-section">
          {message.toolCalls.map((toolCall) => (
            <ToolCallIndicator key={toolCall.id} toolCall={toolCall as ExtendedToolCall} />
          ))}
        </div>
      )}
    </div>
  );
}