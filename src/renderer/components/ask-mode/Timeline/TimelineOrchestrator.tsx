import React from 'react';
import { TimelineItemComponent, TimelineItemType } from './TimelineItem';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  status: 'completed' | 'in-progress' | 'pending' | 'upcoming';
  title: string;
  details?: string;
  agentMessage?: string;
  requiresConfirmation?: boolean;
  timestamp?: Date;
}

interface TimelineOrchestratorProps {
  items: TimelineItem[];
  title?: string;
  onConfirm?: (itemId: string) => void;
  onEdit?: (itemId: string, data: any) => void;
  onCancel?: (itemId: string) => void;
}

export function TimelineOrchestrator({ items, title, onConfirm, onEdit, onCancel }: TimelineOrchestratorProps) {
  const completedCount = items.filter(item => item.status === 'completed').length;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="timeline-orchestrator">
      {title && (
        <div className="timeline-header">
          <h3 className="timeline-title">{title}</h3>
          <span className="timeline-progress">
            {completedCount}/{totalCount} completed
          </span>
        </div>
      )}
      
      <div className="timeline-progress-bar">
        <div 
          className="timeline-progress-fill" 
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div className="timeline-items-container">
        {items.map((item, index) => (
          <TimelineItemComponent
            key={item.id}
            item={item}
            isLast={index === items.length - 1}
            onConfirm={onConfirm}
            onEdit={onEdit}
            onCancel={onCancel}
          />
        ))}
      </div>
    </div>
  );
}
