import React, { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShortcutCombo } from '@/components/common/ShortcutKeys';
import type { FileAction } from '@/utils/fileActions';
import { cn } from '@/lib/utils';

interface ActionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: { title: string; icon?: string } | null;
  actions: FileAction[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onExecute: (action: FileAction) => void;
}

export function ActionPanel({
  open,
  onOpenChange,
  selectedItem,
  actions,
  selectedIndex,
  onSelectIndex,
  onExecute,
}: ActionPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation within the panel
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onSelectIndex(Math.min(selectedIndex + 1, actions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onSelectIndex(Math.max(selectedIndex - 1, 0));
      } else if (e.key === 'Enter' && actions[selectedIndex]) {
        e.preventDefault();
        onExecute(actions[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, actions, selectedIndex, onSelectIndex, onExecute, onOpenChange]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 pb-2">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            {selectedItem?.icon && <span>{selectedItem.icon}</span>}
            Actions for {selectedItem?.title}
          </DialogTitle>
        </DialogHeader>
        <div className="px-2 pb-2 max-h-80 overflow-y-auto" ref={listRef}>
          {actions.map((action, index) => (
            <button
              key={action.id}
              data-index={index}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm',
                'text-left transition-colors duration-100',
                index === selectedIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent text-foreground'
              )}
              onClick={() => {
                onSelectIndex(index);
                onExecute(action);
              }}
              onMouseEnter={() => onSelectIndex(index)}
            >
              <span className="truncate">{action.label}</span>
              <ShortcutCombo keys={action.shortcut} />
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>{actions.length} actions</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">↑↓</kbd>
            Navigate
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono ml-2">Enter</kbd>
            Execute
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
