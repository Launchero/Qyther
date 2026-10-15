import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClockIcon, ChatsCircleIcon, PlusIcon } from '@phosphor-icons/react';
import { logInfo } from '../utils/debugLogger';

export interface ChatHistoryDropdownProps {
  history?: string[];
  onSelect: (chatTitle: string) => void;
  open: boolean;
  onToggle: () => void;
  onNewChat?: () => void;
  visible?: boolean;
}

export function ChatHistoryDropdown({
  history = [
    'Optimize Electron cold start',
    'React 19 best practices',
    'Fix ESLint errors in ipc',
    'TypeScript strict mode',
  ],
  onSelect,
  open,
  onToggle,
  onNewChat,
  visible = true,
}: ChatHistoryDropdownProps) {
  const handleChatSelect = (chatTitle: string) => {
    logInfo('[ChatHistoryDropdown] Chat selected:', chatTitle);
    onSelect(chatTitle);
    onToggle();
  };

  if (!visible) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => { if (next !== open) onToggle(); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          // icon-lg = size-8 = --target-min. The box comes from the primitive's size variant,
          // never from an h-11 w-11 override that fights it.
          size="icon-lg"
          title="Recent chats"
          aria-label="Recent chats"
        >
          <ClockIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-[var(--tracking-label)]">
          Recent Chats
        </div>
        <DropdownMenuSeparator />
        {history.map((chat, index) => (
          <DropdownMenuItem
            key={index}
            onClick={() => handleChatSelect(chat)}
            // A menu item is a touch target: --target-min (32px) is the floor.
            className="flex items-center gap-2 min-h-[var(--target-min)]"
          >
            <ChatsCircleIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{chat}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onNewChat?.();
          }}
          className="min-h-[var(--target-min)] text-primary focus:text-primary"
        >
          <PlusIcon className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
          New Chat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}