import React from 'react';
import { cn } from '@/lib/utils';
import { MagnifyingGlass, ChatCircle, Globe, Monitor, FileText, type IconProps } from '@phosphor-icons/react';

const AGENT_CONFIG: Record<string, { Icon: React.ComponentType<IconProps>; colorClass: string }> = {
  Research: { Icon: MagnifyingGlass, colorClass: 'agent-indicator--research' },
  General: { Icon: ChatCircle, colorClass: 'agent-indicator--general' },
  Browser: { Icon: Globe, colorClass: 'agent-indicator--browser' },
  Desktop: { Icon: Monitor, colorClass: 'agent-indicator--desktop' },
  Document: { Icon: FileText, colorClass: 'agent-indicator--document' },
};

interface AgentIndicatorProps {
  agent: { label: string } | null;
  isStreaming?: boolean;
  className?: string;
}

export const AgentIndicator = React.memo(({ agent, isStreaming = false, className }: AgentIndicatorProps) => {
  if (!agent || !agent.label) return null;

  const config = AGENT_CONFIG[agent.label];
  if (!config) return null;

  const { Icon, colorClass } = config;

  return (
    <div
      className={cn('agent-indicator', colorClass, className)}
      role="status"
      aria-live="polite"
      aria-label={`${agent.label} agent active`}
    >
      <span className={cn('agent-indicator__dot', isStreaming && 'agent-indicator__dot--pulse')} />
      <Icon className="w-[var(--icon-size-xs)] h-[var(--icon-size-xs)]" weight="fill" />
      <span className="agent-indicator__label">{agent.label}</span>
    </div>
  );
});

AgentIndicator.displayName = 'AgentIndicator';
