import React from 'react';
import { CheckCircle, Info, Warning } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  confidence: number;
  verified?: boolean;
  selfCorrected?: boolean;
  qualityScore?: number;
  iterationsUsed?: number;
  className?: string;
}

function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function getBadgeLabel(confidence: number, verified?: boolean, selfCorrected?: boolean, qualityScore?: number, iterationsUsed?: number): string {
  if (verified && qualityScore && qualityScore >= 0.7) return 'Verified';
  if (verified) return 'Quick verified';
  if (selfCorrected && iterationsUsed && iterationsUsed > 1) return `Revised after review (${iterationsUsed}x)`;
  if (selfCorrected) return 'Revised after review';
  if (confidence >= 0.8) return 'High confidence';
  if (confidence >= 0.5) return 'Quick checked';
  return 'Low confidence';
}

export function ConfidenceBadge({ confidence, verified, selfCorrected, qualityScore, iterationsUsed, className }: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(confidence);
  const label = getBadgeLabel(confidence, verified, selfCorrected, qualityScore, iterationsUsed);
  const percentage = Math.round(confidence * 100);

  return (
    <span
      className={cn(`confidence-badge confidence-badge--${level}`, className)}
      role="status"
      aria-label={`Response confidence: ${percentage}%`}
    >
      {level === 'high' && <CheckCircle className="w-3 h-3" weight="fill" aria-hidden="true" />}
      {level === 'medium' && <Info className="w-3 h-3" aria-hidden="true" />}
      {level === 'low' && <Warning className="w-3 h-3" aria-hidden="true" />}
      <span>
        {label} ({percentage}%)
      </span>
    </span>
  );
}
