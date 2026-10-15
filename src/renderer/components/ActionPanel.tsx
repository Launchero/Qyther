import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShortcutCombo } from '@/components/common/ShortcutKeys';
import { type FileAction, getActionsForItem } from '@/utils/fileActions';
import { Sparkle, Folder, Copy, ArrowSquareOut, FileText } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { SearchResult } from './ResultsList';

interface ActionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: SearchResult | null;
  onExecute?: (result: SearchResult) => void;
  onAskAbout?: (result: SearchResult) => void;
}

/** Map action IDs to Phosphor icons for visual scanning. */
function ActionIcon({ actionId }: { actionId: string }) {
  const cls = 'h-4 w-4 flex-shrink-0';
  switch (actionId) {
    case 'open':
    case 'open-url':
      return <ArrowSquareOut weight="fill" className={cls} aria-hidden="true" />;
    case 'ask-ai':
      return <Sparkle weight="fill" className={cls} aria-hidden="true" />;
    case 'copy-path':
    case 'copy-url':
    case 'copy-name':
      return <Copy weight="fill" className={cls} aria-hidden="true" />;
    case 'reveal-in-folder':
      return <Folder weight="fill" className={cls} aria-hidden="true" />;
    default:
      return <FileText weight="fill" className={cls} aria-hidden="true" />;
  }
}

export function ActionPanel({
  open,
  onOpenChange,
  result,
  onExecute,
  onAskAbout,
}: ActionPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const actions: FileAction[] = result ? getActionsForItem(result) : [];

  // Reset selection when the panel opens or the result changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [open, result?.id]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Handle keyboard navigation within the panel
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, actions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && actions[selectedIndex]) {
        e.preventDefault();
        handleAction(actions[selectedIndex]);
      }
      // Escape is handled by Radix Dialog — no need to intercept here.
      // The graded Escape tier 1 in useKeyboard checks [role="dialog"] and
      // bails without preventDefault, letting Radix close the dialog.
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, actions.length, selectedIndex]);

  const handleAction = (action: FileAction) => {
    if (!result) return;

    if (action.id === 'ask-ai') {
      // Special case: delegate to parent for file→AI handoff
      onAskAbout?.(result);
      onOpenChange(false);
      return;
    }

    if (action.id === 'open' || action.id === 'open-url' || action.id === 'execute') {
      // Default open: delegate to the parent's execute handler which hides the window
      onExecute?.(result);
      onOpenChange(false);
      return;
    }

    // Other actions (copy path, reveal in folder, etc.) run their own handler
    void action.handler(result);
    onOpenChange(false);
  };

  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          listRef.current?.querySelector<HTMLElement>('[data-index="0"]')?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById('search-input')?.focus();
        }}
      >
        <DialogHeader className="px-4 py-3 pb-2">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            {result.icon && <span aria-hidden="true">{result.icon}</span>}
            <span className="truncate">{result.title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="px-2 pb-2 max-h-80 overflow-y-auto" ref={listRef} role="listbox" aria-label="Actions">
          {actions.map((action, index) => (
            <button
              key={action.id}
              data-index={index}
              role="option"
              aria-selected={index === selectedIndex}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                'text-left transition-colors duration-100',
                'cursor-pointer',
                index === selectedIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent text-foreground'
              )}
              onClick={() => {
                setSelectedIndex(index);
                handleAction(action);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              onFocus={() => setSelectedIndex(index)}
            >
              <ActionIcon actionId={action.id} />
              <span className="flex-1 truncate">{action.label}</span>
              <ShortcutCombo keys={action.shortcut} />
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded-sm text-xs font-mono">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded-sm text-xs font-mono">↵</kbd>
              <span>Execute</span>
            </span>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
