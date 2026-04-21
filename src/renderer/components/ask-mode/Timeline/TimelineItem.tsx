import React, { useState } from 'react';
import { ConfirmationUI } from './ConfirmationUI';
import { AgentMessage } from './AgentMessage';
import { CheckIcon, ClockIcon, CircleDashedIcon } from '@phosphor-icons/react';

export type TimelineItemType = 'workflow' | 'agent' | 'confirmation' | 'upcoming';

export interface TimelineItemData {
  id: string;
  type: TimelineItemType;
  status: 'completed' | 'in-progress' | 'pending' | 'upcoming';
  title: string;
  details?: string;
  agentMessage?: string;
  requiresConfirmation?: boolean;
  timestamp?: Date;
}

interface TimelineItemComponentProps {
  item: TimelineItemData;
  isLast: boolean;
  onConfirm?: (itemId: string) => void;
  onEdit?: (itemId: string, data: any) => void;
  onCancel?: (itemId: string) => void;
}

export function TimelineItemComponent({ item, isLast, onConfirm, onEdit, onCancel }: TimelineItemComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (item.status) {
      case 'completed':
        return <CheckIcon className="status-icon completed w-4 h-4" weight="bold" />;
      case 'in-progress':
        return <ClockIcon className="status-icon in-progress w-4 h-4" />;
      case 'pending':
        return <CircleDashedIcon className="status-icon pending w-4 h-4" />;
      case 'upcoming':
        return <ClockIcon className="status-icon upcoming w-4 h-4" />;
    }
  };

  const getTypeStyles = () => {
    switch (item.type) {
      case 'workflow':
        return 'timeline-item-workflow';
      case 'agent':
        return 'timeline-item-agent';
      case 'confirmation':
        return 'timeline-item-confirmation';
      case 'upcoming':
        return 'timeline-item-upcoming';
    }
  };

  const renderContent = () => {
    if (item.type === 'confirmation' && item.requiresConfirmation) {
      return (
        <ConfirmationUI
          title={item.title}
          details={item.details}
          onConfirm={() => onConfirm?.(item.id)}
          onEdit={() => onEdit?.(item.id, {})}
          onCancel={() => onCancel?.(item.id)}
        />
      );
    }

    if (item.type === 'agent' && item.agentMessage) {
      return <AgentMessage message={item.agentMessage} />;
    }

    return (
      <div className="timeline-item-content">
        <div className="timeline-item-header">
          <h4 className="timeline-item-title">{item.title}</h4>
          {item.timestamp && (
            <span className="timeline-item-time">
              {new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              }).format(item.timestamp)}
            </span>
          )}
        </div>
        
        {item.details && (
          <div className="timeline-item-details">
            {item.details}
          </div>
        )}
        
        {item.agentMessage && item.type !== 'agent' && (
          <AgentMessage message={item.agentMessage} isCompact />
        )}
      </div>
    );
  };

  return (
    <div className={`timeline-item ${getTypeStyles()} ${item.status}`}>
      <div className="timeline-item-marker">
        <div className="marker-icon">
          {getStatusIcon()}
        </div>
        {!isLast && <div className="marker-line" />}
      </div>
      
      <div className="timeline-item-body">
        <div 
          className="timeline-item-main"
          onClick={() => setIsExpanded(!isExpanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setIsExpanded(!isExpanded)}
        >
          {renderContent()}
        </div>
        
        {isExpanded && item.details && (
          <div className="timeline-item-expanded">
            <div className="expanded-details">
              {item.details}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
