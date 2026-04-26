import React from 'react';
import { Spinner, MagnifyingGlass, Code, GearSix, ChartBar, CheckCircle, Star } from '@phosphor-icons/react';

export type ProgressStage = 'analyzing' | 'generating' | 'processing' | 'rendering' | 'validating' | 'finalizing';

interface GenerativeUIProgressProps {
  progress: number;
  message: string;
  stage?: ProgressStage;
}

const STAGE_ICONS: Record<ProgressStage, React.ReactNode> = {
  analyzing: <MagnifyingGlass className="w-3 h-3 text-primary flex-shrink-0" weight="bold" />,
  generating: <Code className="w-3 h-3 text-primary flex-shrink-0" weight="bold" />,
  processing: <GearSix className="w-3 h-3 text-primary flex-shrink-0" weight="bold" />,
  rendering: <ChartBar className="w-3 h-3 text-primary flex-shrink-0" weight="bold" />,
  validating: <CheckCircle className="w-3 h-3 text-primary flex-shrink-0" weight="bold" />,
  finalizing: <Star className="w-3 h-3 text-primary flex-shrink-0" weight="bold" />,
};

function detectStage(message: string): ProgressStage {
  const lower = message.toLowerCase();
  if (lower.includes('analyz')) return 'analyzing';
  if (lower.includes('render') || lower.includes('visual')) return 'rendering';
  if (lower.includes('validat') || lower.includes('extract')) return 'validating';
  if (lower.includes('final')) return 'finalizing';
  if (lower.includes('process') || lower.includes('build') || lower.includes('compos') || lower.includes('generat') || lower.includes('synth')) return 'generating';
  return 'processing';
}

export function GenerativeUIProgress({ progress, message, stage }: GenerativeUIProgressProps) {
  const detectedStage = stage || detectStage(message);
  const icon = STAGE_ICONS[detectedStage] ?? <Spinner className="w-3 h-3 text-primary animate-spin flex-shrink-0" />;
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(normalizedProgress * 100);

  return (
    <div className="generative-ui-progress" data-stage={detectedStage} role="status" aria-live="polite">
      {icon}
      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="progress-message">
        {message} {percentage}%
      </span>
    </div>
  );
}

