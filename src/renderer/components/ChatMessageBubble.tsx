/* eslint-disable @typescript-eslint/no-explicit-any -- LLM/component payload shapes are dynamic */
import React, { useMemo, type ElementType, type ReactNode } from 'react';
import { ChatMessageActions } from './ask-mode/ChatMessageActions';
import { GenerativeUI, GenerativeUIType } from './ask-mode/GenerativeUI';
import { SourcesPanel } from './ask-mode/SourcesPanel';
import { TaskMetricsDisplay } from './ask-mode/Transparency/TaskMetrics';
import { CodeBlock } from './ask-mode/CodeBlock';
import { CitationBracket } from './ask-mode/CitationBracket';
import { ThinkingSteps } from './ask-mode/ThinkingSteps';
import { ConfidenceBadge } from './ask-mode/ConfidenceBadge';
import { formatTime } from '../utils/formatTime';
import { splitAtSettledBlock } from '../utils/markdownBlocks';
import { safeExternalUrl } from '../utils/externalUrl';
import { cn } from '@/lib/utils';
import type { TaskMetrics } from '../utils/costCalculator';
import { CheckCircle } from '@phosphor-icons/react';
import { logInfo } from '../utils/debugLogger';
import { AgentIndicator } from './ask-mode/AgentIndicator';

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
  agent?: { label: string } | null;
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  className?: string;
  onCopy?: (content: string) => void;
  onExplain?: (content: string) => void;
  onShowCode?: (content: string) => void;
  onRegenerate?: () => void;
  onFormSubmit?: (formTitle: string, formData: Record<string, unknown>) => void;
}

/**
 * Markdown level → element and type rung. Every level now lands on its own rung of the
 * measured scale (20 / 18 / 16 / 14px) instead of `##` and `###` both rendering `text-sm`
 * and `#` rendering body size. The DOM tag stays one below the markdown level because the
 * palette owns the page's `h1`; a chat answer must not re-declare one.
 */
const HEADING_RUNGS: Record<number, { Tag: ElementType; className: string }> = {
  1: { Tag: 'h2', className: 'text-xl font-semibold mt-3 mb-1' },
  2: { Tag: 'h3', className: 'text-lg font-semibold mt-3 mb-1' },
  3: { Tag: 'h4', className: 'text-base font-semibold mt-3 mb-1' },
  4: { Tag: 'h5', className: 'text-sm font-semibold mt-3 mb-1' },
};

const HEADING_MATCH = /^(#{1,4})[ \t]+(.*)$/;
const BULLET_MATCH = /^[-*]\s+(.+)/;
const ORDERED_MATCH = /^\d+\.\s+(.+)/;
const FENCE_MATCH = /^```(\w*)/;

type MarkdownBlock =
  | { kind: 'code'; language: string; code: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string };

/**
 * Line scanner, kept pure and above the component so the renderer below is only a mapping.
 * Deliberately conservative: an unterminated fence renders as code, never as prose.
 */
function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let inCodeBlock = false;
  let codeContent = '';
  let codeLanguage = '';

  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const line of content.split('\n')) {
    const fence = line.match(FENCE_MATCH);
    if (fence) {
      if (inCodeBlock) {
        blocks.push({ kind: 'code', language: codeLanguage || 'text', code: codeContent.trim() });
        codeContent = '';
        codeLanguage = '';
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeLanguage = fence[1] || '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    const heading = line.match(HEADING_MATCH);
    if (heading) {
      flushList();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    const ordered = line.match(ORDERED_MATCH);
    const bullet = line.match(BULLET_MATCH);
    if (ordered || bullet) {
      const wantsOrdered = !!ordered;
      if (list && list.ordered !== wantsOrdered) flushList();
      if (!list) list = { ordered: wantsOrdered, items: [] };
      list.items.push((ordered ?? bullet)![1]);
      continue;
    }

    if (line.trim() === '') {
      flushList();
      continue;
    }

    flushList();
    blocks.push({ kind: 'paragraph', text: line });
  }

  flushList();
  if (inCodeBlock) {
    blocks.push({ kind: 'code', language: codeLanguage || 'text', code: codeContent.trim() });
  }
  return blocks;
}

function renderInlineMarkdownWithCitations(
  text: string,
  sources?: Array<{ url: string }>,
  onCitationClick?: (url: string) => void
): ReactNode {
  const parts = text.split(/(`[^`]+`|\[\d+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      // No class here on purpose: `.answer-content code:not(pre code)` and
      // `.message-user-bubble code` already own the mono face, the plate and the padding,
      // and a `text-xs` on the element would restate a size under the prose that owns it.
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    const citationMatch = part.match(/^\[(\d+)\]$/);
    if (citationMatch) {
      const citationNumber = parseInt(citationMatch[1]);
      const source = sources?.[citationNumber - 1];
      return (
        <CitationBracket
          key={i}
          number={citationNumber}
          onClick={() => {
            const href = safeExternalUrl(source?.url);
            if (href) onCitationClick?.(href);
          }}
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

interface MarkdownProps {
  content: string;
  sources?: Array<{ url: string }>;
  onCitationClick?: (url: string) => void;
}

function renderMarkdownBlock(
  block: MarkdownBlock,
  key: number,
  inline: (text: string) => ReactNode
): ReactNode {
  switch (block.kind) {
    case 'code':
      return <CodeBlock key={key} language={block.language} code={block.code} />;

    case 'heading': {
      const rung = HEADING_RUNGS[block.level] ?? HEADING_RUNGS[4];
      return <rung.Tag key={key} className={rung.className}>{inline(block.text)}</rung.Tag>;
    }

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={key} className="my-2 ml-4 space-y-1">
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ListTag>
      );
    }

    default:
      return <p key={key} className="my-2">{inline(block.text)}</p>;
  }
}

function SimpleMarkdown({ content, sources, onCitationClick }: MarkdownProps) {
  const inline = (text: string) => renderInlineMarkdownWithCitations(text, sources, onCitationClick);
  return <>{parseMarkdownBlocks(content).map((block, i) => renderMarkdownBlock(block, i, inline))}</>;
}

/**
 * The half of a streamed answer that cannot change again. Memoized on its text, so once a block
 * settles its element array is reused and React skips the subtree instead of reconciling every
 * paragraph of a growing answer once per frame.
 */
const SettledMarkdown = React.memo(SimpleMarkdown);

/** Prefer full `uiPayloads`; fall back to the legacy single payload shape. */
function resolvePayloads(message: ChatMessage): UIPayload[] {
  if (message.uiPayloads && message.uiPayloads.length > 0) return message.uiPayloads;
  if (message.hasStructuredData && message.structuredData) {
    return [{
      type: message.dataType || ('list' as GenerativeUIType),
      title: message.structuredData.title || '',
      data: message.structuredData,
      node: 'legacy',
    }];
  }
  return [];
}

function GenerativePayloads({ message, onFormSubmit }: Pick<ChatMessageBubbleProps, 'message' | 'onFormSubmit'>) {
  // Structured payloads arrive once, in the terminal chunk — there is no
  // progressive generation to skeletonise (main has no sender for the
  // ui-payload progress pushes, so a skeleton here would never resolve).
  if (message.isStreaming) return null;

  return resolvePayloads(message).map((payload, idx) => (
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
  ));
}

/** Post-answer signals — each appears only once the turn settles, so each fades in. */
function AnswerSignals({ message }: Pick<ChatMessageBubbleProps, 'message'>) {
  return (
    <>
      {message.selfCorrected && !message.isStreaming && (
        <div className="quality-badge animate-fade-in">
          <CheckCircle className="w-3 h-3" weight="fill" aria-hidden="true" />
          <span>Reviewed and improved</span>
          {message.iterationsUsed && message.iterationsUsed > 1 && (
            <span className="quality-badge-iterations">({message.iterationsUsed} iterations)</span>
          )}
        </div>
      )}

      {message.agent && !message.isStreaming && <AgentIndicator agent={message.agent} />}

      {message.confidence !== undefined && message.confidence > 0 && !message.isStreaming && (
        <ConfidenceBadge
          className="animate-fade-in"
          confidence={message.confidence}
          verified={message.verified}
          selfCorrected={message.selfCorrected}
          qualityScore={message.qualityScore}
          iterationsUsed={message.iterationsUsed}
        />
      )}
    </>
  );
}

function AnswerSecondary({ message }: Pick<ChatMessageBubbleProps, 'message'>) {
  if (!message.sources?.length && !message.metrics) return null;

  return (
    <div className="answer-secondary">
      {!!message.sources?.length && <SourcesPanel sources={message.sources} />}
      {message.metrics && (
        <div className="answer-metrics">
          <TaskMetricsDisplay metrics={message.metrics} />
        </div>
      )}
    </div>
  );
}

function AssistantAnswer({
  message,
  onCopy,
  onExplain,
  onShowCode,
  onRegenerate,
  onFormSubmit,
}: ChatMessageBubbleProps) {
  // Split at the last blank line whose parser state is provably clean (see `markdownBlocks.ts`),
  // so only the block still being streamed re-parses. A whole final answer parses in one piece
  // either way; this is about the frames in between.
  const { settled, tail } = useMemo(() => splitAtSettledBlock(message.content), [message.content]);

  return (
    <div>
      {message.thinkingSteps && message.thinkingSteps.length > 0 && (
        <ThinkingSteps
          steps={message.thinkingSteps}
          isComplete={!message.isStreaming}
          durationMs={message.metrics?.durationMs}
        />
      )}

      <div className="answer-content">
        {settled && <SettledMarkdown content={settled} />}
        <SimpleMarkdown content={tail} />

        {message.isStreaming && <span className="streaming-cursor">▊</span>}

        <GenerativePayloads message={message} onFormSubmit={onFormSubmit} />
        <AnswerSignals message={message} />
      </div>

      <AnswerSecondary message={message} />

      {!message.isStreaming && (
        <div className="answer-actions">
          <ChatMessageActions
            onCopy={onCopy ? () => onCopy(message.content) : undefined}
            onExplain={onExplain ? () => onExplain(message.content) : undefined}
            onShowCode={onShowCode ? () => onShowCode(message.content) : undefined}
            onRegenerate={onRegenerate}
          />
        </div>
      )}
    </div>
  );
}

export const ChatMessageBubble = React.memo(({ message, className, onCopy, onExplain, onShowCode, onRegenerate, onFormSubmit }: ChatMessageBubbleProps) => {
  // No scroll-on-mount here on purpose. `ChatMessagesList` owns tracking the bottom of the
  // transcript, and a bubble that scrolls itself into view on mount yanked the viewport once per
  // message while a history was loading — the second, ungated `scrollIntoView` the transition
  // audit asked to remove rather than gate.

  // No `tabIndex` here either. Every bubble used to be focusable, which put a stop on every turn
  // of the transcript in a palette the user drives with the keyboard; `role="article"` is kept on
  // the assistant turn only, because that is the content with headings, sources and metrics.
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 max-w-[var(--chat-message-max-width)]',
        isUser ? 'self-end flex-row-reverse' : 'self-start',
        className
      )}
      role={isUser ? undefined : 'article'}
      aria-label={isUser ? undefined : 'Assistant response'}
    >
      <div className={cn(
        'min-w-0 flex-1',
        isUser ? 'message-user' : 'answer max-w-[var(--measure-readable)]'
      )}>
        {isUser ? (
          <div className="message-user-bubble">
            <SimpleMarkdown content={message.content} />
          </div>
        ) : (
          <AssistantAnswer
            message={message}
            onCopy={onCopy}
            onExplain={onExplain}
            onShowCode={onShowCode}
            onRegenerate={onRegenerate}
            onFormSubmit={onFormSubmit}
          />
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
    prevProps.message.selfCorrected === nextProps.message.selfCorrected &&
    prevProps.message.qualityScore === nextProps.message.qualityScore &&
    prevProps.message.iterationsUsed === nextProps.message.iterationsUsed &&
    prevProps.message.metrics?.tokensUsed === nextProps.message.metrics?.tokensUsed &&
    prevProps.message.metrics?.estimatedCost === nextProps.message.metrics?.estimatedCost &&
    prevProps.message.metrics?.durationMs === nextProps.message.metrics?.durationMs &&
    prevProps.message.metrics?.inputTokens === nextProps.message.metrics?.inputTokens &&
    prevProps.message.metrics?.outputTokens === nextProps.message.metrics?.outputTokens &&
    prevProps.message.uiPayloadPending === nextProps.message.uiPayloadPending &&
    prevProps.message.uiGenerationProgress === nextProps.message.uiGenerationProgress &&
    prevProps.message.uiProgressMessage === nextProps.message.uiProgressMessage &&
    prevProps.message.uiPayloads?.length === nextProps.message.uiPayloads?.length &&
    prevProps.message.agent?.label === nextProps.message.agent?.label &&
    prevProps.className === nextProps.className
  );
});

ChatMessageBubble.displayName = 'ChatMessageBubble';
