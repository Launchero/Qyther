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
    <DropdownMenu open={open} onOpenChange={onToggle}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 w-11 p-0"
        >
          <ClockIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recent Chats
        </div>
        <DropdownMenuSeparator />
        {history.map((chat, index) => (
          <DropdownMenuItem
            key={index}
            onClick={() => handleChatSelect(chat)}
            className="flex items-center gap-2"
          >
            <ChatsCircleIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{chat}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onNewChat?.();
          }}
          className="text-primary focus:text-primary"
        >
          <PlusIcon className="h-3.5 w-3.5 mr-2" />
          New Chat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}