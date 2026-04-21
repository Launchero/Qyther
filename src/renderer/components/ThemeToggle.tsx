import React from 'react';
import { useTheme } from '../context/ThemeProvider';
import { Button } from '@/components/ui/button';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-7 w-7"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      aria-keyshortcuts="Alt+Shift+T"
    >
      {theme === 'light' ? (
        <MoonIcon className="h-4 w-4" />
      ) : (
        <SunIcon className="h-4 w-4" />
      )}
    </Button>
  );
}
