import React from 'react';
import { cn } from '@/lib/utils';
import type { RecentFile } from '@/hooks/useRecentFiles';
import {
  FolderOpen,
  ClockCounterClockwise,
  TerminalWindow,
  GitBranch,
  File,
} from '@phosphor-icons/react';

export interface SearchEmptyStateProps {
  recentFiles: RecentFile[];
  onOpenFile: (path: string) => void;
  onQuickAction: (action: string) => void;
}

interface QuickActionConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

const quickActions: QuickActionConfig[] = [
  {
    id: 'find-in-folder',
    label: 'Find in Folder',
    icon: <FolderOpen weight="fill" className="h-5 w-5" />,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    id: 'recent-files',
    label: 'Recent Files',
    icon: <ClockCounterClockwise weight="fill" className="h-5 w-5" />,
    iconBg: 'bg-[var(--color-yellow-500)]/10',
    iconColor: 'text-[var(--color-yellow-500)]',
  },
  {
    id: 'open-terminal',
    label: 'Open Terminal',
    icon: <TerminalWindow weight="fill" className="h-5 w-5" />,
    iconBg: 'bg-[var(--color-green-500)]/10',
    iconColor: 'text-[var(--color-green-500)]',
  },
  {
    id: 'git-status',
    label: 'Git Status',
    icon: <GitBranch weight="fill" className="h-5 w-5" />,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
  },
];

function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'ts':
      return <File weight="fill" className="h-4 w-4 text-primary" />;
    case 'js':
    case 'jsx':
      return <File weight="fill" className="h-4 w-4 text-[var(--color-yellow-500)]" />;
    case 'json':
      return <File weight="fill" className="h-4 w-4 text-[var(--color-yellow-500)]" />;
    case 'css':
    case 'scss':
      return <File weight="fill" className="h-4 w-4 text-primary" />;
    case 'md':
      return <File weight="fill" className="h-4 w-4 text-muted-foreground" />;
    default:
      return <File weight="fill" className="h-4 w-4 text-muted-foreground" />;
  }
}

export function SearchEmptyState({
  recentFiles,
  onOpenFile,
  onQuickAction,
}: SearchEmptyStateProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="px-4 pt-6 pb-4">
        {/* Quick Actions */}
        <div className="mb-6">
          <div className="px-1 pb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Actions
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onQuickAction(action.id)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-md',
                  'border border-transparent',
                  'hover:bg-accent hover:border-border',
                  'transition-all duration-150 ease-in-out',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-md',
                    action.iconBg,
                    action.iconColor,
                  )}
                >
                  {action.icon}
                </div>
                <span className="text-xs text-muted-foreground text-center">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recently Opened */}
        {recentFiles.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 pb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recently Opened
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground font-medium">
                {recentFiles.length}
              </span>
            </div>
            <div className="flex flex-col">
              {recentFiles.map((file, index) => (
                <button
                  key={`${file.path}-${index}`}
                  type="button"
                  onClick={() => onOpenFile(file.path)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-sm',
                    'hover:bg-accent',
                    'transition-colors duration-150 ease-in-out',
                    'text-left w-full',
                  )}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
                    {getFileIcon(file.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {file.name}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {file.path}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
