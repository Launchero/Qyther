import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShortcutKey, ShortcutCombo } from '@/components/common/ShortcutKeys';

interface ShortcutsReferenceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; label: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Arrow keys'], label: 'Navigate results' },
      { keys: ['Home'], label: 'Jump to first result' },
      { keys: ['End'], label: 'Jump to last result' },
      { keys: ['Page Up'], label: 'Jump 5 results up' },
      { keys: ['Page Down'], label: 'Jump 5 results down' },
      { keys: ['Enter'], label: 'Open selected item' },
      { keys: ['Esc'], label: 'Close window' },
    ],
  },
  {
    title: 'Modes',
    shortcuts: [
      { keys: ['Tab'], label: 'Cycle modes (when input focused)' },
      { keys: ['Shift', 'Tab'], label: 'Cycle modes (reverse)' },
      { keys: ['Ctrl', 'Tab'], label: 'Cycle modes (anywhere)' },
      { keys: ['Ctrl', 'Shift', 'Tab'], label: 'Cycle modes reverse (anywhere)' },
    ],
  },
  {
    title: 'Global',
    shortcuts: [
      { keys: ['Alt', 'Space'], label: 'Toggle palette' },
      { keys: ['Alt', 'Shift', 'T'], label: 'Toggle theme' },
      { keys: ['Alt', 'Shift', 'M'], label: 'Toggle window size' },
    ],
  },
  {
    title: 'AI Mode',
    shortcuts: [
      { keys: ['Shift', 'Enter'], label: 'New line' },
      { keys: ['Ctrl', 'Shift', 'B'], label: 'Toggle browser mode' },
      { keys: ['Ctrl', 'Shift', 'X'], label: 'Stop session' },
      { keys: ['Ctrl', 'Shift', 'M'], label: 'Manage MCP servers' },
      { keys: ['Enter'], label: 'Send message' },
    ],
  },
];

export function ShortcutsReference({ open, onOpenChange }: ShortcutsReferenceProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium mb-2">{group.title}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{shortcut.label}</span>
                    {shortcut.keys.length === 1 ? (
                      <ShortcutKey label={shortcut.keys[0]} />
                    ) : (
                      <ShortcutCombo keys={shortcut.keys} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
