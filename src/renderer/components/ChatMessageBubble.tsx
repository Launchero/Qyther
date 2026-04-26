import React, { useRef, useEffect } from 'react';
import { ChatMessageActions } from './ask-mode/ChatMessageActions';
import { GenerativeUI, GenerativeUIType } from './ask-mode/GenerativeUI';
import { GenerativeUISkeleton } from './ask-mode/GenerativeUI/GenerativeUISkeleton';
import { GenerativeUIProgress } from './ask-mode/GenerativeUI/GenerativeUIProgress';
import { SourcesPanel } from './ask-mode/SourcesPanel';
import { TaskMetricsDisplay } from './ask-mode/Transparency/TaskMetrics';
import { CodeBlock } from './ask-mode/CodeBlock';
import { CitationBracket } from './ask-mode/CitationBracket';
import { RelatedQuestions } from './ask-mode/RelatedQuestions';
import { ThinkingSteps } from './ask-mode/ThinkingSteps';
import { ConfidenceBadge } from './ask-mode/ConfidenceBadge';
import { formatTime } from '../utils/formatTime';
import { cn } from '@/lib/utils';
import type { TaskMetrics } from '../utils/costCalculator';
import { CheckCircle } from '@phosphor-icons/react';
import { logInfo } from '../utils/debugLogger';

export interface UIPayload {
  type: GenerativeUIType;
  title: string;
  data: Record<string, unknown>;
  node: string;
}

export interface ThinkingStep {
  type: string;
  step: string;
  status: string;
  detail: string;
  data?: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  hasStructuredData?: boolean;
  dataType?: GenerativeUIType;
  structuredData?: any;
  uiPayloads?: UIPayload[];
  thinkingSteps?: ThinkingStep[];
  sources?: Array<{
    id: string;
    url: string;
    title: string;
    excerpt: string;
    confidence?: number;
    accessedAt?: Date;
    isWebSource?: boolean;
  }>;
  metrics?: TaskMetrics;
  relatedQuestions?: string[];
  selfCorrected?: boolean;
  iterationsUsed?: number;
  validationScore?: number;
  qualityScore?: number;
  confidence?: number;
  verified?: boolean;
  uiPayloadPending?: boolean;
  uiPayloadType?: GenerativeUIType;
  uiGenerationProgress?: number;
  uiProgressMessage?: string;
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  className?: string;
  onCopy?: (content: string) => void;
  onExplain?: (content: string) => void;
  onShowCode?: (content: string) => void;
  onRegenerate?: () => void;
  onRelatedQuestion?: (question: string) => void;
  onFormSubmit?: (formTitle: string, formData: Record<string, unknown>) => void;
}

function renderInlineMarkdownWithCitations(
  text: string,
  sources?: Array<{ url: string }>,
  onCitationClick?: (url: string) => void
): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\[\d+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted px-1 rounded text-xs">{part.slice(1, -1)}</code>;
    }
    const citationMatch = part.match(/^\[(\d+)\]$/);
    if (citationMatch) {
      const citationNumber = parseInt(citationMatch[1]);
      const source = sources?.[citationNumber - 1];
      return (
        <CitationBracket
          key={i}
          number={citationNumber}
          onClick={() => onCitationClick?.(source?.url || '')}
        />
      );
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bp, j) => {
      if (bp.startsWith('**') && bp.endsWith('**')) {
        return <strong key={`${i}-${j}`}>{bp.slice(2, -2)}</strong>;
      }
      return bp;
    });
  });
}

function SimpleMarkdown({
  content,
  sources,
  onCitationClick,
}: {
  content: string;
  sources?: Array<{ url: string }>;
  onCitationClick?: (url: string) => void;
}) {
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
        <ListTag key={`list-${elements.length}`} className="my-2 ml-4 space-y-1">
          {listItems.map((item, i) => (
            <li key={i}>{renderInlineMarkdownWithCitations(item, sources, onCitationClick)}</li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  const renderInline = (text: string): React.ReactNode => {
    return renderInlineMarkdownWithCitations(text, sources, onCitationClick);
  };

  lines.forEach((line) => {
    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (inCodeBlock) {
        elements.push(
          <CodeBlock
            key={`code-${elements.length}`}
            language={codeLanguage || 'text'}
            code={codeContent.trim()}
          />
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

    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={elements.length} className="text-sm font-semibold mt-3 mb-1">{renderInline(line.slice(4))}</h4>);
      return;
    }

    if (line.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={elements.length} className="text-sm font-semibold mt-3 mb-1">{renderInline(line.slice(3))}</h3>);
      return;
    }

    if (line.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={elements.length} className="text-base font-semibold mt-3 mb-1">{renderInline(line.slice(2))}</h2>);
      return;
    }

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

    if (line.trim() === '') {
      flushList();
      return;
    }

    flushList();
    elements.push(
      <p key={elements.length} className="my-2">{renderInline(line)}</p>
    );
  });

  flushList();
  return <>{elements}</>;
}

export const ChatMessageBubble = React.memo(({ message, className, onCopy, onExplain, onShowCode, onRegenerate, onRelatedQuestion, onFormSubmit }: ChatMessageBubbleProps) => {
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  const isUser = message.role === 'user';

  // Determine which payloads to render — prefer full uiPayloads, fall back to legacy single payload
  const payloadsToRender = message.uiPayloads && message.uiPayloads.length > 0
    ? message.uiPayloads
    : message.hasStructuredData && message.structuredData
      ? [{ type: message.dataType || 'list' as GenerativeUIType, title: message.structuredData.title || '', data: message.structuredData, node: 'legacy' }]
      : [];

  return (
    <div
      ref={messageRef}
      className={cn(
        "flex gap-3 max-w-[var(--chat-message-max-width)]",
        isUser ? "self-end flex-row-reverse" : "self-start",
        className
      )}
      tabIndex={0}
      role="article"
      aria-label={`${message.role} message`}
    >
      <div className={cn(
        "flex-1",
        isUser ? "message-user" : "answer"
      )}>
        {isUser ? (
          <div className="message-user-bubble">
            <SimpleMarkdown content={message.content} />
          </div>
        ) : (
          <div className="answer">
            {/* Thinking block FIRST, collapsed by default (Claude-style) */}
            {message.thinkingSteps && message.thinkingSteps.length > 0 && (
              <ThinkingSteps
                steps={message.thinkingSteps}
                isComplete={!message.isStreaming}
                durationMs={message.metrics?.durationMs}
              />
            )}

            {/* Answer content — primary */}
            <div className="answer-content">
              <SimpleMarkdown content={message.content} />

              {message.isStreaming && (
                <span className="streaming-cursor">▊</span>
              )}

              {message.isStreaming && message.uiPayloadPending && (
                <>
                  <GenerativeUISkeleton
                    estimatedType={message.uiPayloadType || 'table'}
                  />
                  {message.uiGenerationProgress !== undefined && message.uiGenerationProgress > 0 && (
                    <GenerativeUIProgress
                      progress={message.uiGenerationProgress}
                      message={message.uiProgressMessage || 'Generating structured data...'}
                    />
                  )}
                </>
              )}

              {!message.isStreaming && payloadsToRender.length > 0 && payloadsToRender.map((payload, idx) => (
                <GenerativeUI
                  key={`${payload.type}-${idx}`}
                  resultType={payload.type}
                  data={payload.data}
                  title={payload.title}
                  onExport={(format) => {
                    logInfo(`[ChatMessageBubble] Exported ${payload.type} as ${format}`);
                  }}
                  onConfirm={(formData) => {
                    const formTitle = (payload.data as Record<string, unknown>)?.title || (payload.data as Record<string, unknown>)?.targetUrl || payload.title || 'Configuration';
                    onFormSubmit?.(formTitle as string, formData as Record<string, unknown>);
                  }}
                  onEdit={() => {
                    // FormPreview manages local state; edits are handled internally.
                  }}
                  onCancel={() => {
                    logInfo('[ChatMessageBubble] Form cancelled');
                  }}
                />
              ))}

              {/* Quality badge for self-corrected responses */}
              {message.selfCorrected && !message.isStreaming && (
                <div className="quality-badge">
                  <CheckCircle className="w-3 h-3" weight="fill" />
                  <span>Reviewed and improved</span>
                  {message.iterationsUsed && message.iterationsUsed > 1 && (
                    <span className="quality-badge-iterations">({message.iterationsUsed} iterations)</span>
                  )}
                </div>
              )}

              {/* Confidence badge for confidence-based routing */}
              {message.confidence !== undefined && message.confidence > 0 && !message.isStreaming && (
                <ConfidenceBadge
                  confidence={message.confidence}
                  verified={message.verified}
                  selfCorrected={message.selfCorrected}
                  qualityScore={message.qualityScore}
                  iterationsUsed={message.iterationsUsed}
                />
              )}
            </div>

            {/* Secondary content — collapsible, below the answer */}
            <div className="answer-secondary">
              {message.sources && message.sources.length > 0 && (
                <SourcesPanel sources={message.sources} />
              )}

              {message.metrics && (
                <div className="answer-metrics">
                  <TaskMetricsDisplay metrics={message.metrics} />
                </div>
              )}
            </div>

            {/* Actions — only after streaming completes */}
            {!message.isStreaming && (
              <div className="answer-actions">
                <ChatMessageActions
                  onCopy={onCopy ? () => onCopy(message.content) : undefined}
                  onExplain={onExplain ? () => onExplain(message.content) : undefined}
                  onShowCode={onShowCode ? () => onShowCode(message.content) : undefined}
                  onRegenerate={onRegenerate}
                />

                {message.relatedQuestions && message.relatedQuestions.length > 0 && (
                  <RelatedQuestions
                    questions={message.relatedQuestions}
                    onSelect={(q) => onRelatedQuestion?.(q)}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!isUser && (
        <div className="text-xs text-muted-foreground self-end">
          {formatTime(message.timestamp)}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.isStreaming === nextProps.message.isStreaming &&
    prevProps.message.hasStructuredData === nextProps.message.hasStructuredData &&
    prevProps.message.sources?.length === nextProps.message.sources?.length &&
    prevProps.message.thinkingSteps?.length === nextProps.message.thinkingSteps?.length &&
    prevProps.message.confidence === nextProps.message.confidence &&
    prevProps.message.verified === nextProps.message.verified &&
    prevProps.message.uiPayloadPending === nextProps.message.uiPayloadPending &&
    prevProps.message.uiGenerationProgress === nextProps.message.uiGenerationProgress &&
    prevProps.message.uiProgressMessage === nextProps.message.uiProgressMessage &&
    prevProps.message.uiPayloads?.length === nextProps.message.uiPayloads?.length &&
    prevProps.className === nextProps.className
  );
});

ChatMessageBubble.displayName = 'ChatMessageBubble';