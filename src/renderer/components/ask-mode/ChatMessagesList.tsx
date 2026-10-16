import React, { useCallback, useRef, useEffect } from 'react';
import { PlusIcon } from '@phosphor-icons/react';
import autoAnimate from '@formkit/auto-animate';
import { Button } from '@/components/ui/button';
import { motionDurationMs, motionEasing, prefersReducedMotion } from '../../utils/motion';
import { ChatMessageBubble, ChatMessage } from '../ChatMessageBubble';
import { ChatErrorBanner } from './ChatErrorBanner';
import { ChatWelcomeState } from './ChatWelcomeState';
import { AgentIndicator } from './AgentIndicator';
import type { InlineChatSession } from './RecentChatsInline';

/** Streaming keeps the transcript pinned only while it sits this near the bottom (CSS px). */
const BOTTOM_STICK_PX = 120;

interface ChatMessagesListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  welcomeState: boolean;
  browserModeEnabled: boolean;
  activeAgent?: { label: string } | null;
  onSendExample: (query: string) => void;
  onEnableBrowserMode?: () => void;
  onCopy?: (content: string) => void;
  onExplain?: (content: string) => void;
  onShowCode?: (content: string) => void;
  onRegenerate?: () => void;
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
  activeAgent = null,
  onSendExample,
  onEnableBrowserMode,
  onCopy,
  onExplain,
  onShowCode,
  onRegenerate,
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
  const pinnedToBottomRef = useRef(true);

  const handleAreaScroll = useCallback(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    pinnedToBottomRef.current =
      area.scrollHeight - area.scrollTop - area.clientHeight < BOTTOM_STICK_PX;
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    // A question the user just asked is always worth scrolling to, even if they had
    // been reading further up; a streamed answer is not.
    if (last?.role === 'user') pinnedToBottomRef.current = true;
    if (!pinnedToBottomRef.current) return;
    // `smooth` only for a jump the user caused. A streamed answer re-commits every animation
    // frame, and each commit would restart a ~300 ms scroll toward a bottom that has already
    // moved again — the transcript swims and the browser fights itself. Tracking live output is
    // an instant job; the same reduced-motion rule applies on top of that, not instead of it.
    const instant = prefersReducedMotion() || last?.isStreaming === true;
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  }, [messages]);

  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    // Duration and easing come from the same tokens the stylesheet composes from, so the
    // transcript tweens on the design scale instead of on JS literals that can drift.
    // The controller must be destroyed: this host is re-created on every Ask-mode entry and
    // StrictMode mounts it twice, and a dropped controller leaves its MutationObserver,
    // ResizeObserver and pending timers running against the same element.
    const controller = autoAnimate(area, {
      duration: motionDurationMs('--duration-200', 200),
      easing: motionEasing('--easing-smooth', 'ease-in-out'),
    });
    // auto-animate 0.10 disables `prefers-reduced-motion` itself, so no media query here.
    return () => controller.destroy?.();
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
              <Button
                type="button"
                variant="ghost"
                size="xs"
                // The BEM rule paints the primary tint at rest; these utilities restore the
                // mockup's fill-on-hover, which `ghost`'s muted hover would otherwise replace.
                className="messages-new-chat-btn hover:bg-primary hover:text-primary-foreground"
                onClick={onNewChat}
                aria-label="Start new chat (Ctrl+Shift+N)"
                title="Start a new conversation (Ctrl+Shift+N)"
              >
                <PlusIcon className="w-4 h-4" weight="bold" aria-hidden="true" />
                <span>New Chat</span>
              </Button>
            </div>
          )}
          {/* A polite live region fed every token floods a screen reader, so the
              transcript goes silent while any turn streams and announces once
              at completion. A new turn re-arms the announcement by flipping
              back to polite. */}
          <div
            ref={messagesAreaRef}
            className="messages-area"
            onScroll={handleAreaScroll}
            role="log"
            aria-live={messages.some((m) => m.isStreaming) ? 'off' : 'polite'}
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
                onFormSubmit={onFormSubmit}
              />
            ))}
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
              <div className="answer self-start max-w-full" role="alert" aria-live="assertive">
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