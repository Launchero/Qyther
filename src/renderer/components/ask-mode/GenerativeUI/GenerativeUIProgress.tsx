import React from 'react';
import { Spinner } from '@phosphor-icons/react';

interface GenerativeUIProgressProps {
  progress: number;
  message: string;
  stage?: 'generating' | 'processing' | 'finalizing';
}

const DEFAULT_MESSAGES: Record<string, string> = {
  generating: 'Generating structured data...',
  processing: 'Processing results...',
  finalizing: 'Finalizing output...',
};

export function GenerativeUIProgress({ progress, message, stage }: GenerativeUIProgressProps) {
  const displayMessage = message || DEFAULT_MESSAGES[stage || 'generating'];
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(normalizedProgress * 100);

  return (
    <div className="generative-ui-progress" role="status" aria-live="polite">
      <Spinner className="w-3 h-3 text-primary animate-spin flex-shrink-0" />
      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="progress-message">
        {displayMessage} {percentage}%
      </span>
    </div>
  );
}
