import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Folder, Sparkle } from '@phosphor-icons/react';
import { getAriaKeyshortcuts } from '@/utils/shortcuts';

export type SearchMode = 'file' | 'ai';

export interface ModeTabsProps {
  currentMode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  expanded: boolean;
  onToggle: () => void;
}

interface ModeConfig {
  label: string;
  icon: React.ReactNode;
}

const modeConfigs: Record<SearchMode, ModeConfig> = {
  file: {
    label: 'Files',
    icon: <Folder weight="fill" className="h-4 w-4" aria-hidden="true" />,
  },
  ai: {
    label: 'Ask',
    icon: <Sparkle weight="fill" className="h-4 w-4" aria-hidden="true" />,
  },
};

export function ModeTabs({
  currentMode,
  onModeChange,
  expanded,
  onToggle,
}: ModeTabsProps) {
  const handleModeChange = (mode: SearchMode) => {
    onModeChange(mode);
  };

  const currentModeConfig = modeConfigs[currentMode];

  if (!expanded) {
    // Collapsed state: Button with icon + label
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-keyshortcuts={getAriaKeyshortcuts('Shift', 'Tab')}
        aria-label={`Switch mode. Currently: ${currentModeConfig.label}. Press Shift+Tab to cycle.`}
        className={cn(
          "flex items-center justify-center",
          // Match the 40px control height the search input uses (--container-input-height /
          // --target-row), so the tab and the input agree inside the same header row.
          "h-[var(--target-row)] px-3",
          "gap-[var(--gap-inline)]",
          "rounded-md",
          "transition-[background-color,border-color,box-shadow] duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          "border border-border bg-background hover:bg-accent hover:border-ring"
        )}
      >
        <span className="flex items-center justify-center text-primary">
          {currentModeConfig.icon}
        </span>
        <span className="text-sm font-medium text-primary">
          {currentModeConfig.label}
        </span>
      </button>
    );
  }

  // Expanded state: Horizontal tab menu
  return (
    <Tabs
      value={currentMode}
      onValueChange={(value) => handleModeChange(value as SearchMode)}
      className="h-[var(--target-row)]"
    >
      <TabsList className={cn(
        // The primitive sizes the list through `group-data-horizontal/tabs:h-8`, so the caller
        // has to override that same variant key for the 44px row contract to survive.
        "h-full gap-1 p-1 group-data-horizontal/tabs:h-[var(--target-row)]",
        "bg-muted border border-border",
        "rounded-md",
        "transition-[background-color,border-color] duration-[var(--duration-150)] ease-[var(--easing-smooth)]"
      )}>
        {(Object.keys(modeConfigs) as SearchMode[]).map((mode) => {
          const config = modeConfigs[mode];
          return (
            <TabsTrigger
              key={mode}
              value={mode}
              className={cn(
                "gap-[var(--gap-inline)] px-4 h-full rounded-md",
                "text-sm font-medium",
                "transition-[background-color,color] duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
                "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                "data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground",
                "data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-foreground"
              )}
            >
              <span className="flex items-center justify-center">
                {config.icon}
              </span>
              <span>{config.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}