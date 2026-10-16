import React from 'react';
import { ShortcutKey, ShortcutCombo } from '@/components/common/ShortcutKeys';
import { SHORTCUT_GROUPS } from '../ShortcutsReference';
import { SectionHeader, SettingRow } from './primitives';

export function ShortcutsSection() {
  return (
    <div>
      <SectionHeader
        title="Shortcuts"
        description="Keys the palette responds to. Navigation keys act when focus is outside the search field."
      />

      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title} className="mb-[var(--gap-section)]">
          <h3 className="mb-2 text-sm font-medium">{group.title}</h3>
          <div className="space-y-1.5">
            {group.shortcuts.map((shortcut) => (
              <div key={shortcut.keys.join('+')} className="flex items-center justify-between gap-2">
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

      <SettingRow title="Customize global hotkey" description="Remap Alt+Space and Alt+Shift+M." comingSoon />
    </div>
  );
}
