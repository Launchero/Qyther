import React from 'react';
import { cn } from '@/lib/utils';
import type { RecentFile } from '@/hooks/useRecentFiles';
import {
  FolderOpen,
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
    icon: <FolderOpen weight="fill" className="h-5 w-5" aria-hidden="true" />,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
];

// File-type colour comes from the semantic --file-* pair (light + .dark halves), never from a
// raw primitive: the old --color-yellow-500 does not clear 4.5:1 on a light card.
function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const glyph = (color: string) => <File weight="fill" className={cn('h-4 w-4', color)} aria-hidden="true" />;
  switch (ext) {
    case 'tsx':
    case 'ts':
      return glyph('text-[var(--color-file-typescript)]');
    case 'js':
    case 'jsx':
    case 'json':
      return glyph('text-[var(--color-file-javascript)]');
    case 'css':
    case 'scss':
      return glyph('text-primary');
    default:
      return glyph('text-muted-foreground');
  }
}

export function SearchEmptyState({
  recentFiles,
  onOpenFile,
  onQuickAction,
}: SearchEmptyStateProps) {
  return (
    <div className="flex flex-col overflow-y-auto flex-1 min-h-0">
      {/* `my-auto` rather than a fixed top padding: it centres the landing content
          while there is spare height and collapses to zero once the list grows, so
          a short history never leaves a pooled void under the last row. */}
      <div className="my-auto px-4 pt-6 pb-4">
        {/* Quick Actions */}
        <div className="mb-6">
          <div className="px-1 pb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[var(--tracking-label)]">
              Quick Actions
            </span>
          </div>
          {/* One action in a two-column grid leaves the right column empty, which
              reads as a missing tile rather than a deliberate single action. */}
          <div className={cn('grid gap-2', quickActions.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onQuickAction(action.id)}
                className={cn(
                  'flex flex-col items-center gap-[var(--gap-inline)] p-3 rounded-md',
                  'border border-transparent',
                  'hover:bg-accent hover:border-border',
                  'transition-[background-color,border-color] duration-[var(--duration-150)] ease-[var(--easing-smooth)]',
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
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[var(--tracking-label)]">
                Recently Opened
              </span>
              <span className="text-xs px-[var(--gap-inline)] py-[var(--spacing-1)] rounded-sm bg-muted text-muted-foreground font-medium">
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
                    // Row rhythm matches ResultItem: --padding-block-row, gap-3, text-left.
                    'flex items-center gap-3 px-3 py-[var(--padding-block-row)] rounded-sm',
                    'hover:bg-accent',
                    'transition-colors duration-[var(--duration-150)] ease-[var(--easing-smooth)]',
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
