import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Monitor, PaperPlaneRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const DESKTOP_PLACEHOLDERS = [
  'Take a screenshot and tell me what is on screen...',
  'Open VS Code and open main.ts...',
  'Switch to browser and refresh...',
  'Describe your desktop task...',
] as const;

export interface DesktopCommandBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  windowMode?: 'expanded' | 'compact' | 'custom';
}

export function DesktopCommandBar({
  value,
  onChange,
  onSend,
  disabled = false,
  isLoading = false,
  windowMode = 'expanded',
}: DesktopCommandBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 100);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Rotate placeholder text every 5s when input is empty
  useEffect(() => {
    if (value.trim()) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % DESKTOP_PLACEHOLDERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [value]);

  // Focus input on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (value.trim() && !disabled && !isLoading) {
      onSend(value.trim());
      onChange('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [value, disabled, isLoading, onSend, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSendActive = value.trim().length > 0;

  // Quick action pills
  const quickActions = [
    { icon: '📸', label: 'Screenshot', query: 'Take a screenshot and tell me what is on screen' },
    { icon: '⌨️', label: 'Type', query: "Type '" },
    { icon: '🪟', label: 'Windows', query: 'Show all open windows' },
    { icon: '📂', label: 'Open App', query: 'Open ' },
  ];

  const handleQuickAction = (query: string) => {
    onChange(query);
    textareaRef.current?.focus();
  };

  const isCompact = windowMode === 'compact';

  return (
    <div className="flex flex-col w-full">
      {/* Command Bar */}
      <div className={cn(
        'flex items-center',
        'px-[var(--spacing-4)] py-[var(--spacing-2)]',
        'gap-[var(--spacing-3)]',
        'border-b border-border',
        'bg-card',
        'flex-shrink-0',
        'min-h-[var(--container-ask-command-bar-height)]',
        isCompact && 'px-[var(--spacing-3)] py-[var(--spacing-1)]'
      )}>
        {/* Desktop Mode Pill */}
        <div className="flex-shrink-0 self-center flex items-center gap-[var(--spacing-1-5)] px-[var(--spacing-3)] py-[var(--spacing-1-5)] rounded-full bg-desktop-primary cursor-pointer">
          <Monitor weight="fill" className="w-[var(--icon-size-xs)] h-[var(--icon-size-xs)] text-desktop-primary-foreground" />
          <span className="text-[var(--text-xs)] font-semibold text-desktop-primary-foreground">Control</span>
        </div>

        {/* Input Container */}
        <div className={cn(
          'flex-1 flex items-center gap-[var(--spacing-2)]',
          'px-[var(--spacing-3)] py-[var(--spacing-2)]',
          'bg-secondary border border-border rounded-[var(--radius-input)]',
          'transition-all duration-[var(--duration-300)] ease-[var(--easing-smooth)]',
          'focus-within:border-ring focus-within:shadow-[0_0_0_2px_var(--ring)]',
          'min-h-[var(--container-input-height)]',
          'relative'
        )}>
          {/* Icon */}
          <Monitor
            weight={isSendActive ? 'fill' : 'regular'}
            className={cn(
              'w-[var(--spacing-4)] h-[var(--spacing-4)] flex-shrink-0',
              isSendActive ? 'text-desktop-primary' : 'text-muted-foreground'
            )}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            className={cn(
              'flex-1 border-none outline-none bg-transparent',
              'font-[var(--font-body)] text-[var(--text-base)] text-foreground',
              'resize-none min-h-5 max-h-[calc(var(--text-base)*1.5*3)]',
              'overflow-y-auto leading-[1.5]',
              'placeholder:text-muted-foreground',
              'disabled:opacity-50',
              '[&::-webkit-scrollbar]:w-1',
              '[&::-webkit-scrollbar-track]:bg-transparent',
              '[&::-webkit-scrollbar-thumb]:bg-muted-foreground [&::-webkit-scrollbar-thumb]:rounded-full',
            )}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={DESKTOP_PLACEHOLDERS[placeholderIndex]}
            rows={1}
            disabled={disabled || isLoading}
          />

          {/* Send Button */}
          <button
            className={cn(
              'w-[var(--send-button-size)] h-[var(--send-button-size)]',
              'rounded-[var(--radius-input)]',
              'bg-desktop-primary border-none cursor-pointer',
              'flex items-center justify-center flex-shrink-0',
              'transition-all duration-[var(--duration-200)] ease-[var(--easing-smooth)]',
              isSendActive && !isLoading
                ? 'opacity-100 pointer-events-auto hover:filter-brightness-95 hover:scale-105'
                : 'opacity-40 pointer-events-none'
            )}
            onClick={handleSend}
            disabled={!isSendActive || disabled || isLoading}
            title={isLoading ? 'Processing...' : 'Send'}
            type="button"
          >
            <PaperPlaneRight weight="bold" className="w-[var(--icon-size-sm)] h-[var(--icon-size-sm)] text-desktop-primary-foreground" />
          </button>
        </div>

        {/* Keyboard Shortcut */}
        {!isLoading && !isSendActive && (
          <div className="flex items-center gap-[var(--spacing-1)] flex-shrink-0 self-center">
            <kbd className="flex items-center justify-center min-w-6 px-[var(--spacing-1)] py-[var(--spacing-1)] bg-muted border border-border rounded-[var(--radius-chip)] text-[var(--text-xs)] font-mono text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
              Enter
            </kbd>
          </div>
        )}
      </div>

      {/* Quick Action Pills */}
      {!isLoading && (
        <div className={cn(
          'flex gap-[var(--spacing-2)] px-[var(--spacing-4)] py-[var(--spacing-2)]',
          'flex-wrap',
          'transition-all duration-[var(--duration-300)] ease-[var(--easing-smooth)]'
        )}>
          {quickActions.map((action) => (
            <button
              key={action.label}
              className={cn(
                'flex items-center gap-[var(--spacing-1)]',
                'px-[var(--spacing-2)] py-[var(--spacing-1)]',
                'bg-secondary border border-border rounded-full',
                'text-[var(--text-xs)] font-medium text-muted-foreground',
                'cursor-pointer',
                'transition-all duration-[var(--duration-150)] ease-[var(--easing-smooth)]',
                'hover:border-ring hover:text-foreground hover:bg-accent'
              )}
              onClick={() => handleQuickAction(action.query)}
              type="button"
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
