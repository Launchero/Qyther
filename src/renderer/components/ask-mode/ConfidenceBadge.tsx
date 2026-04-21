import React from 'react';
import { CheckCircle, Info, Warning } from '@phosphor-icons/react';

interface ConfidenceBadgeProps {
  confidence: number;
  verified?: boolean;
  className?: string;
}

function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function getBadgeLabel(confidence: number, verified?: boolean): string {
  if (verified) return 'Quick verified';
  if (confidence >= 0.8) return 'High confidence';
  if (confidence >= 0.5) return 'Quick checked';
  return 'Revised';
}

export function ConfidenceBadge({ confidence, verified, className = '' }: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(confidence);
  const label = getBadgeLabel(confidence, verified);
  const percentage = Math.round(confidence * 100);

  return (
    <span
      className={`confidence-badge confidence-badge--${level} ${className}`.trim()}
      role="status"
      aria-label={`Response confidence: ${percentage}%`}
    >
      {level === 'high' && <CheckCircle className="w-3 h-3" weight="fill" />}
      {level === 'medium' && <Info className="w-3 h-3" />}
      {level === 'low' && <Warning className="w-3 h-3" />}
      <span>
        {label} ({percentage}%)
      </span>
    </span>
  );
}
