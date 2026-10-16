import React from 'react';
import { useTheme } from '@/context/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { AppearanceTheme } from '../../../shared/ipc/settings';
import { SectionHeader, GroupLabel, SettingRow } from './primitives';

const THEME_OPTIONS: { value: AppearanceTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function AppearanceSection() {
  const { theme, effectiveTheme, reducedMotion, setTheme, setReducedMotion } = useTheme();

  return (
    <div>
      <SectionHeader
        title="Appearance"
        description="Applies to the palette and this window, and persists across launches."
      />

      <GroupLabel>Theme</GroupLabel>
      <div className="flex flex-wrap items-center gap-2">
        {THEME_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={theme === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme(option.value)}
          >
            {option.label}
          </Button>
        ))}
        {theme === 'system' && (
          <span className="text-xs text-muted-foreground">following your system, now {effectiveTheme}</span>
        )}
      </div>

      <GroupLabel>Motion</GroupLabel>
      <SettingRow title="Reduce motion" description="Snap transitions instead of animating the window and lists.">
        <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} aria-label="Reduce motion" />
      </SettingRow>

      <GroupLabel>Coming soon</GroupLabel>
      <SettingRow title="Accent colour" description="Tint buttons and highlights." comingSoon />
      <SettingRow title="Font size & density" description="Larger text or tighter rows." comingSoon />
    </div>
  );
}
