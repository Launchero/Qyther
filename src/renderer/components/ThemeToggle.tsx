import React from 'react';
import { useTheme } from '../context/ThemeProvider';
import { Button } from '@/components/ui/button';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

export function ThemeToggle() {
  // `effectiveTheme` is the concrete light/dark being painted (theme may be `system`); the toggle
  // flips between the two concrete themes and persists through the main-owned `settings` store.
  const { effectiveTheme, toggleTheme } = useTheme();
  const nextThemeLabel = `Switch to ${effectiveTheme === 'light' ? 'dark' : 'light'} mode`;

  return (
    <Button
      variant="ghost"
      // icon-lg = size-8 = --target-min. The box belongs to the primitive's size variant,
      // never to an h-7 w-7 override on the call site.
      size="icon-lg"
      onClick={toggleTheme}
      title={nextThemeLabel}
      aria-label={nextThemeLabel}
      aria-keyshortcuts="Alt+Shift+T"
    >
      {effectiveTheme === 'light' ? (
        <MoonIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <SunIcon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
