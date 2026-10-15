import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/context/ThemeProvider';
import { cn } from '@/lib/utils';

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  windowMode: string;
  mcpCount: number;
  onOpenShortcuts: () => void;
  onOpenMCP?: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  windowMode,
  mcpCount,
  onOpenShortcuts,
  onOpenMCP,
}: SettingsDialogProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 pb-2">
          <DialogTitle className="text-sm font-medium">Settings</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-3 flex flex-col gap-1" role="list" aria-label="Settings">
          <div className={cn('flex items-center justify-between py-2')} role="listitem">
            <div className="min-w-0">
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Currently {theme}</p>
            </div>
            <Button type="button" variant="outline" size="xs" onClick={toggleTheme}>
              Switch to {theme === 'light' ? 'dark' : 'light'}
            </Button>
          </div>
          <div className={cn('flex items-center justify-between py-2 border-t border-border')} role="listitem">
            <div className="min-w-0">
              <p className="text-sm font-medium">Window size</p>
              <p className="text-xs text-muted-foreground">Currently {windowMode} (Alt+Shift+M toggles)</p>
            </div>
          </div>
          <div className={cn('flex items-center justify-between py-2 border-t border-border')} role="listitem">
            <div className="min-w-0">
              <p className="text-sm font-medium">Keyboard shortcuts</p>
              <p className="text-xs text-muted-foreground">Every shortcut the palette implements</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                onOpenChange(false);
                onOpenShortcuts();
              }}
            >
              View
            </Button>
          </div>
          <div className={cn('flex items-center justify-between py-2 border-t border-border')} role="listitem">
            <div className="min-w-0">
              <p className="text-sm font-medium">MCP servers</p>
              <p className="text-xs text-muted-foreground">{mcpCount} connected</p>
            </div>
            {onOpenMCP && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  onOpenChange(false);
                  onOpenMCP();
                }}
              >
                Manage
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
