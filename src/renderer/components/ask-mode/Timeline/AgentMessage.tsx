import React from 'react';
import { RobotIcon } from '@phosphor-icons/react';

interface AgentMessageProps {
  message: string;
  isCompact?: boolean;
}

export function AgentMessage({ message, isCompact = false }: AgentMessageProps) {
  return (
    <div className={`agent-message ${isCompact ? 'compact' : ''}`}>
      <div className="agent-message-header">
        <RobotIcon className="agent-icon" />
        <span className="agent-label">AI Agent</span>
      </div>
      
      <div className="agent-message-content">
        {message}
      </div>
    </div>
  );
}
