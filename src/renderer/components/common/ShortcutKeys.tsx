import React from 'react';
import { cn } from '@/lib/utils';
import { getOSDisplayNamesSync } from '@/utils/shortcuts';

export interface ShortcutKeyProps {
  label?: string;
  modifier?: boolean;
  alt?: boolean;
  className?: string;
}

export function ShortcutKey({ label, modifier = false, alt = false, className }: ShortcutKeyProps) {
  const os = getOSDisplayNamesSync();
  const display = modifier ? os.modifier : alt ? os.alt : (label ?? '');
  return (
    <kbd
      className={cn(
        'flex items-center justify-center',
        'w-[var(--shortcut-key-width)] h-8',
        'bg-background border border-border rounded-[var(--radius-xs)]',
        'text-xs font-mono font-medium',
        'text-muted-foreground',
        'shadow-[var(--shadow-shortcut-key)]',
        className
      )}
    >
      {display}
    </kbd>
  );
}

export interface ShortcutComboProps {
  keys: string[];
  className?: string;
}

export function ShortcutCombo({ keys, className }: ShortcutComboProps) {
  const os = getOSDisplayNamesSync();
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {keys.map((key, index) => {
        let display = key;
        if (key === 'modifier') {
          display = os.modifier;
        } else if (key === 'alt') {
          display = os.alt;
        } else if (key === 'shift') {
          display = os.shift;
        }
        return (
          <React.Fragment key={`${key}-${index}`}>
            {index > 0 && <span className="text-xs text-muted-foreground">+</span>}
            <kbd
              className={cn(
                'flex items-center justify-center',
                'min-w-[var(--shortcut-key-min-width)] h-8 px-2.5',
                'bg-background border border-border rounded-[var(--radius-xs)]',
                'text-xs font-mono font-medium',
                'text-muted-foreground',
                'shadow-[var(--shadow-shortcut-key)]'
              )}
            >
              {display}
            </kbd>
          </React.Fragment>
        );
      })}
    </div>
  );
}
