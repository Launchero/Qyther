import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShortcutKey, ShortcutCombo } from '@/components/common/ShortcutKeys';
import { cn } from '@/lib/utils';

interface ShortcutsReferenceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; label: string }[];
}

// Every row here maps to a live binding: hooks/useKeyboard.ts, components/AskModeExpanded.tsx,
// hooks/useMCPKeyboardShortcuts.ts, App.tsx (theme) and src/main/shortcuts.ts (OS-level).
// "not while typing" marks the keys gated behind `!isTextInput` in useKeyboard.
// Exported so the settings window's Shortcuts section renders the same data, not a second copy.
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Arrow keys'], label: 'Navigate results' },
      { keys: ['Home'], label: 'Jump to first result' },
      { keys: ['End'], label: 'Jump to last result' },
      { keys: ['Page Up'], label: 'Jump 5 results up' },
      { keys: ['Page Down'], label: 'Jump 5 results down' },
      { keys: ['Ctrl', 'N'], label: 'Next result (not while typing)' },
      { keys: ['Ctrl', 'P'], label: 'Previous result (not while typing)' },
      { keys: ['J'], label: 'Move down (not while typing)' },
      { keys: ['K'], label: 'Move up (not while typing)' },
      { keys: ['1-9'], label: 'Open the numbered row (not while typing)' },
      { keys: ['Enter'], label: 'Open selected item' },
      { keys: ['Ctrl', 'K'], label: 'Open action panel' },
      { keys: ['Ctrl', 'Shift', 'C'], label: 'Copy path of selected item (file mode)' },
      { keys: ['Ctrl', 'Shift', 'F'], label: 'Open containing folder (file mode)' },
      { keys: ['Ctrl', 'Shift', 'Enter'], label: 'Ask AI about selected file' },
      { keys: ['↑', '↓'], label: 'Cycle search history (file mode, empty search)' },
      { keys: ['Esc'], label: 'Close a dialog, clear the search, or hide' },
    ],
  },
  {
    title: 'Modes',
    shortcuts: [
      { keys: ['Shift', 'Tab'], label: 'Cycle modes forward' },
      { keys: ['Ctrl', 'Shift', 'Tab'], label: 'Cycle modes reverse' },
    ],
  },
  {
    title: 'Global',
    shortcuts: [
      { keys: ['Alt', 'Space'], label: 'Toggle palette' },
      { keys: ['Ctrl', '/'], label: 'Show this shortcut list' },
      { keys: ['Ctrl', ','], label: 'Toggle settings' },
      { keys: ['Alt', 'Shift', 'T'], label: 'Toggle theme (when palette focused)' },
      { keys: ['Alt', 'ArrowUp', 'ArrowDown'], label: 'Resize palette height (expanded)' },
      { keys: ['Alt', 'Shift', 'M'], label: 'Toggle window size' },
      { keys: ['Ctrl', 'Shift', 'Q'], label: 'Quit application' },
    ],
  },
  {
    title: 'AI Mode',
    shortcuts: [
      { keys: ['Enter'], label: 'Send message' },
      { keys: ['Shift', 'Enter'], label: 'New line' },
      { keys: ['Ctrl', 'Shift', 'N'], label: 'New chat' },
      { keys: ['Ctrl', 'Shift', 'C'], label: 'Copy last response' },
      { keys: ['Ctrl', 'Shift', 'R'], label: 'Regenerate response' },
      { keys: ['Ctrl', 'Shift', 'B'], label: 'Toggle browser mode' },
      { keys: ['Ctrl', 'Shift', 'X'], label: 'Stop browser session' },
      { keys: ['Ctrl', 'Shift', 'S'], label: 'Stop current response' },
      { keys: ['Ctrl', 'Shift', 'M'], label: 'Manage MCP servers' },
      { keys: ['Ctrl', 'T'], label: 'Toggle MCP panel' },
      { keys: ['↑'], label: 'Edit last message (empty ask input)' },
    ],
  },
];

export function ShortcutsReference({ open, onOpenChange }: ShortcutsReferenceProps) {
  // Radix would otherwise park the caret on its own close button; the list is the content the
  // dialog exists to show, so it is the initial focus target and it is scrollable by keyboard.
  const listRef = useRef<HTMLDivElement>(null);

  const handleOpenAutoFocus = (event: Event) => {
    event.preventDefault();
    listRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn(
          // Layering (z-index, scrim, enter/exit) belongs to the [data-slot=dialog-content] rules
          // in styles/globals.css — nothing here restates it.
          // Layout: flex column so only the list scrolls and the title stays visible
          'flex flex-col',
          // Bound: the list is taller than the palette window, so cap the dialog to it
          'max-h-[calc(100vh_-_var(--spacing-16))]',
          // Width: consumer-side override of ui/dialog's `sm:max-w-sm` — two-column rows
          // (label + kbd combo) need the 448px this dialog has always asked for
          'sm:max-w-md'
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="max-w-[var(--measure-readable)]">
            Every shortcut the palette implements. List-navigation keys act on the results
            while focus is outside the search field; typing keys, Home and End stay with the caret.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={listRef}
          tabIndex={-1}
          // A focused scroll container arrows natively, so no key handler is needed here.
          aria-label="Keyboard shortcuts by group"
          className={cn(
            // Scroll region: min-h-0 + flex-1 lets this row shrink inside the capped dialog
            'min-h-0 flex-1 overflow-y-auto focus-visible:outline-none',
            // Spacing: one section gap per group, right padding keeps rows clear of the scrollbar
            'space-y-[var(--gap-section)] pr-2'
          )}
        >
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} role="group" aria-label={group.title}>
              <h3 className="text-sm font-medium mb-[var(--gap-inline)]">{group.title}</h3>
              <div className="space-y-[var(--gap-inline)]">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys.join('+')}
                    className="flex items-center justify-between gap-[var(--gap-inline)]"
                  >
                    <span className="text-xs text-muted-foreground min-w-0">{shortcut.label}</span>
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
