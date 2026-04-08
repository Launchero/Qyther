import React from 'react';

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
    console.log('[ChatHistoryDropdown] Chat selected:', chatTitle);
    onSelect(chatTitle);
    onToggle();
  };

  if (!visible) {
    return null;
  }

  return (
    <div className={`history-toggle ${open ? 'open' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      
      {/* History Dropdown */}
      <div className="history-dropdown">
        <div className="history-dropdown-header">
          <span className="history-dropdown-title">Recent Chats</span>
          <span className="new-chat-link" onClick={(e) => {
            e.stopPropagation();
            onNewChat?.();
          }}>+ New</span>
        </div>
        {history.map((chat, index) => (
          <div
            key={index}
            className={`history-dropdown-item ${index === 0 ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleChatSelect(chat);
            }}
          >
            <svg className="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="history-item-title">{chat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
