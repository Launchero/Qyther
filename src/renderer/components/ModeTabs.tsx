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
    icon: <Folder weight="fill" className="h-4 w-4" />,
  },
  ai: {
    label: 'Ask',
    icon: <Sparkle weight="fill" className="h-4 w-4" />,
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
        aria-keyshortcuts={getAriaKeyshortcuts('Control', 'Tab')}
        aria-label={`Switch mode. Currently: ${currentModeConfig.label}. Press Shift+Tab to cycle.`}
        className={cn(
          "flex items-center justify-center",
          "h-10 px-3",
          "gap-2",
          "rounded-lg",
          "transition-all duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
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
      className="h-10"
    >
      <TabsList className={cn(
        "h-full gap-1 p-1",
        "bg-muted border border-border",
        "rounded-lg",
        "transition-all duration-[var(--duration-150)] ease-[var(--easing-smooth)]"
      )}>
        {(Object.keys(modeConfigs) as SearchMode[]).map((mode) => {
          const config = modeConfigs[mode];
          return (
            <TabsTrigger
              key={mode}
              value={mode}
              className={cn(
                "gap-2 px-4 h-full rounded-md",
                "text-sm font-medium",
                "transition-all duration-[var(--duration-150)] ease-[var(--easing-smooth)]",
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