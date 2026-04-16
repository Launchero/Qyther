import React from 'react';
import {
  Monitor,
  Camera,
  FolderOpen,
  WindowsLogo,
  TextAa,
  Terminal,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { DesktopSession } from '@/hooks/useDesktopControl';
import { DesktopSessionHistory } from './DesktopSessionHistory';
import { DesktopPermissionsBanner } from './DesktopPermissionsBanner';

interface SuggestionCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  exampleQuery: string;
}

interface DesktopWelcomeStateProps {
  onSelectExample: (query: string) => void;
  onDismissOnboarding?: () => void;
  isOnboarding?: boolean;
  sessions?: DesktopSession[];
  activeSessionId?: string | null;
  onSelectSession?: (session: DesktopSession) => void;
  onNewSession?: () => void;
  className?: string;
}

const quickActions: SuggestionCard[] = [
  {
    icon: <Camera weight="regular" className="w-5 h-5" />,
    title: 'Screenshot & Read',
    description: 'Capture screen and extract visible text',
    exampleQuery: 'Take a screenshot and tell me what is on screen',
  },
  {
    icon: <TextAa weight="regular" className="w-5 h-5" />,
    title: 'Type Text Anywhere',
    description: 'Type into any focused window or application',
    exampleQuery: "Type 'Hello World' into Notepad",
  },
  {
    icon: <FolderOpen weight="regular" className="w-5 h-5" />,
    title: 'Open Applications',
    description: 'Launch any installed application',
    exampleQuery: 'Open VS Code',
  },
  {
    icon: <WindowsLogo weight="regular" className="w-5 h-5" />,
    title: 'Switch Windows',
    description: 'List and switch between open windows',
    exampleQuery: 'Show all open windows and switch to browser',
  },
];

const examplePrompts = [
  'Take a screenshot and tell me what is on screen',
  'Open VS Code and open main.ts',
  'Switch to browser and refresh',
];

export function DesktopWelcomeState({
  onSelectExample,
  onDismissOnboarding,
  isOnboarding = true,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  className,
}: DesktopWelcomeStateProps) {
  const handleSessionSelect = (s: DesktopSession) => {
    onSelectSession?.(s);
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-[var(--spacing-6)] p-[var(--spacing-6)] overflow-y-auto',
        'max-w-[var(--suggestion-grid-max-width)] mx-auto w-full',
        className
      )}
      role="region"
      aria-label="Desktop Control Welcome"
    >
      {/* Heading */}
      <div className="flex flex-col items-center gap-[var(--spacing-3)] text-center">
        <Monitor weight="fill" className="w-10 h-10 text-desktop-primary" />
        <div>
          {isOnboarding ? (
            <>
              <div className="text-xl font-semibold text-foreground">
                Desktop Control Ready
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Control your desktop with natural language commands
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-semibold text-foreground">
                Desktop Control
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Control your desktop — open apps, click, type, take screenshots...
              </div>
            </>
          )}
        </div>
      </div>

      {/* Session History */}
      {sessions && sessions.length > 0 && onSelectSession && onNewSession && (
        <DesktopSessionHistory
          sessions={sessions}
          activeSessionId={activeSessionId ?? null}
          onSelectSession={handleSessionSelect}
          onNewSession={onNewSession}
        />
      )}

      {/* Onboarding Steps */}
      {isOnboarding && (
        <div className="w-full p-[var(--spacing-4)] bg-muted/50 rounded-[var(--radius-lg)] space-y-[var(--spacing-3)]">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Quick Start Guide
          </div>
          <div className="space-y-[var(--spacing-2)]">
            {[
              { step: '1', text: 'Describe what you want to do on your desktop' },
              { step: '2', text: 'Confirm any sensitive actions before they execute' },
              { step: '3', text: 'Watch the progress and see the results' },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-[var(--spacing-3)]">
                <div className="w-6 h-6 rounded-full bg-desktop-primary text-desktop-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {item.step}
                </div>
                <span className="text-sm text-foreground">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts */}
      {isOnboarding && (
        <div className="w-full p-[var(--spacing-4)] bg-muted/50 rounded-[var(--radius-lg)]">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-[var(--spacing-3)]">
            Keyboard Shortcuts
          </div>
          <div className="grid grid-cols-2 gap-[var(--spacing-2)] text-sm">
            <div className="flex items-center justify-between">
              <span className="text-foreground">Toggle Control</span>
              <div className="flex gap-1">
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">Ctrl</kbd>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">Shift</kbd>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">D</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground">Stop Action</span>
              <div className="flex gap-1">
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">Ctrl</kbd>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">Shift</kbd>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">X</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground">Expand Window</span>
              <div className="flex gap-1">
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">Alt</kbd>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">Shift</kbd>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">M</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground">Execute</span>
              <div className="flex gap-1">
                <kbd className="px-2 py-0.5 bg-card border border-border rounded text-xs text-muted-foreground">Enter</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 gap-[var(--spacing-3)] w-full">
        {quickActions.map((action, index) => (
          <button
            key={index}
            className={cn(
              'flex flex-col items-start gap-[var(--spacing-2)]',
              'p-[var(--spacing-3)] rounded-[var(--radius-lg)]',
              'bg-card border border-border',
              'hover:bg-muted/50 hover:border-desktop-primary/30',
              'transition-colors duration-150',
              'text-left',
              'focus-visible:ring-2 focus-visible:ring-desktop-primary focus-visible:ring-offset-2'
            )}
            onClick={() => onSelectExample(action.exampleQuery)}
            role="listitem"
            aria-label={`${action.title}: ${action.description}`}
          >
            <div className="text-desktop-primary">
              {action.icon}
            </div>
            <div className="text-sm font-medium text-foreground">{action.title}</div>
            <div className="text-xs text-muted-foreground">{action.description}</div>
          </button>
        ))}
      </div>

      {/* Example Prompts */}
      <div className="w-full space-y-[var(--spacing-2)]">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Try these examples:
        </div>
        {examplePrompts.map((prompt, index) => (
          <button
            key={index}
            className={cn(
              'w-full text-left px-[var(--spacing-3)] py-[var(--spacing-2)]',
              'rounded-[var(--radius-md)]',
              'bg-muted/30 hover:bg-muted/50',
              'text-sm text-muted-foreground hover:text-foreground',
              'transition-colors duration-150',
              'flex items-center gap-[var(--spacing-2)]',
              'focus-visible:ring-2 focus-visible:ring-desktop-primary focus-visible:ring-offset-2'
            )}
            onClick={() => onSelectExample(prompt)}
          >
            <Terminal weight="regular" className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{prompt}</span>
          </button>
        ))}
      </div>

      {/* Permissions Banner */}
      <DesktopPermissionsBanner />

      {/* Onboarding CTA */}
      {isOnboarding && onDismissOnboarding && (
        <div className="flex gap-[var(--spacing-3)] mt-[var(--spacing-2)]">
          <button
            className={cn(
              'px-[var(--spacing-4)] py-[var(--spacing-2)]',
              'rounded-[var(--radius-md)]',
              'bg-desktop-primary text-desktop-primary-foreground',
              'text-sm font-medium',
              'hover:bg-desktop-primary/90',
              'transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-desktop-primary focus-visible:ring-offset-2'
            )}
            onClick={() => onSelectExample('Take a screenshot and tell me what is on screen')}
          >
            Try a Quick Task
          </button>
          <button
            className={cn(
              'px-[var(--spacing-4)] py-[var(--spacing-2)]',
              'rounded-[var(--radius-md)]',
              'bg-muted text-muted-foreground',
              'text-sm font-medium',
              'hover:bg-muted/80',
              'transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-desktop-primary focus-visible:ring-offset-2'
            )}
            onClick={onDismissOnboarding}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
