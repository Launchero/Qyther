import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompassIcon, PenNibIcon, DownloadSimpleIcon, StopIcon, LinkIcon, LightbulbIcon, ClockIcon, CheckCircleIcon } from '@phosphor-icons/react';

export interface BrowserProgress {
  step: number;
  maxSteps: number;
  status: 'navigating' | 'clicking' | 'typing' | 'extracting' | 'complete' | 'error';
  url?: string;
  message: string;
}

interface BrowserProgressPanelProps {
  progress: BrowserProgress;
  reasoning?: string;
  upcomingSteps?: string[];
  metrics?: {
    elapsedMs: number;
  };
  onStop?: () => void;
}

/**
 * Status colour is one semantic pair per state, never a hue primitive:
 * `--color-blue-500` measured 3.65:1 and `--color-green-500` 2.40:1 as text on a light
 * card, while `--info`/`--success` carry the same hue at a lightness that clears 4.5:1 in
 * both themes. Three maps, indexed directly — no `.replace('text-', 'bg-')` string surgery.
 */
const STATUS_TEXT: Record<BrowserProgress['status'], string> = {
  navigating: 'text-primary',
  clicking: 'text-info',
  typing: 'text-info',
  extracting: 'text-success',
  complete: 'text-success',
  error: 'text-destructive',
};

const STATUS_BADGE: Record<BrowserProgress['status'], string> = {
  navigating: 'bg-primary/10 text-primary',
  clicking: 'bg-info-soft text-info',
  typing: 'bg-info-soft text-info',
  extracting: 'bg-success-soft text-success',
  complete: 'bg-success-soft text-success',
  error: 'bg-destructive-soft text-destructive',
};

/** Reaches the `Progress` indicator through the primitive's `data-slot` hook. */
const STATUS_FILL: Record<BrowserProgress['status'], string> = {
  navigating: '[&_[data-slot=progress-indicator]]:bg-primary',
  clicking: '[&_[data-slot=progress-indicator]]:bg-info',
  typing: '[&_[data-slot=progress-indicator]]:bg-info',
  extracting: '[&_[data-slot=progress-indicator]]:bg-success',
  complete: '[&_[data-slot=progress-indicator]]:bg-success',
  error: '[&_[data-slot=progress-indicator]]:bg-destructive',
};

function StatusGlyph({ status }: { status: BrowserProgress['status'] }) {
  switch (status) {
    case 'navigating':
      return <CompassIcon className="w-5 h-5" aria-hidden="true" />;
    case 'clicking':
    case 'typing':
      return <PenNibIcon className="w-5 h-5" aria-hidden="true" />;
    case 'extracting':
      return <DownloadSimpleIcon className="w-5 h-5" aria-hidden="true" />;
    case 'complete':
      return <CheckCircleIcon className="w-5 h-5" aria-hidden="true" weight="fill" />;
    default:
      return null;
  }
}

function PanelControls({
  onStop,
}: Pick<BrowserProgressPanelProps, 'onStop'>) {
  // Stop is the only control: it cancels the turn through chat:cancelTurn,
  // which is a real, observed state change. There is deliberately no pause —
  // the agent has no pause channel, so a Pause button would lie.
  if (!onStop) {
    return null;
  }
  return (
    <div className="flex gap-2" role="group" aria-label="Automation controls">
      <Button
        variant="outline"
        size="icon-lg"
        className="text-destructive hover:text-destructive"
        onClick={onStop}
        title="Stop and reset"
        aria-label="Stop automation"
      >
        <StopIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function StepDetail({ progress, reasoning }: { progress: BrowserProgress; reasoning?: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
          {progress.step}
        </div>
        <div className="w-0.5 flex-1 bg-gradient-to-b from-primary to-muted mt-1"></div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary" className={cn('text-xs', STATUS_BADGE[progress.status])}>
            {progress.status}
          </Badge>
          <span className="text-sm font-medium">{progress.message}</span>
        </div>

        {progress.url && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">Current URL:</span> <span className="truncate">{progress.url}</span>
          </div>
        )}

        {reasoning && (
          <div className="flex items-start gap-2 p-3 bg-muted/50 border-l-3 border-primary rounded-md text-sm text-muted-foreground">
            <LightbulbIcon className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="sr-only">Reasoning:</span>
            <span>{reasoning}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function UpcomingSteps({ startStep, steps }: { startStep: number; steps: string[] }) {
  return (
    <div className="p-3 bg-muted/30 rounded-md">
      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-[var(--tracking-label)]">Upcoming steps:</div>
      {steps.map((step, index) => (
        <div key={index} className="flex items-center gap-2 py-1">
          <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold">
            {startStep + index + 1}
          </div>
          <span className="text-sm text-muted-foreground">{step}</span>
        </div>
      ))}
    </div>
  );
}

function MetricsRow({ metrics }: { metrics: NonNullable<BrowserProgressPanelProps['metrics']> }) {
  // Elapsed time is measured from the session clock. Token and confidence
  // estimates used to be derived from that same clock here; they were removed
  // because a number the system did not measure must not render as a fact.
  return (
    <div className="flex gap-4 flex-wrap p-3 bg-muted/30 rounded-md" role="group" aria-label="Task metrics">
      {metrics.elapsedMs !== undefined && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClockIcon className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            Time: <span className="font-medium text-foreground">{(metrics.elapsedMs / 1000).toFixed(1)}s</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function BrowserProgressPanel({
  progress,
  reasoning,
  upcomingSteps,
  metrics,
  onStop,
}: BrowserProgressPanelProps) {
  return (
    <div
      className="flex flex-col gap-4 p-4 bg-muted/30 border border-muted rounded-md animate-slide-up-fade"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Browser automation progress: Step ${progress.step} of ${progress.maxSteps}, status: ${progress.status}`}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={cn('w-5 h-5', STATUS_TEXT[progress.status])} aria-hidden="true">
            <StatusGlyph status={progress.status} />
          </div>
          <span className="text-sm font-medium">Automating browser task...</span>
        </div>
        <PanelControls onStop={onStop} />
      </div>

      <StepDetail progress={progress} reasoning={reasoning} />

      {upcomingSteps && upcomingSteps.length > 0 && (
        <UpcomingSteps startStep={progress.step} steps={upcomingSteps} />
      )}

      {metrics && <MetricsRow metrics={metrics} />}

      <div
        className="flex items-center gap-3"
        role="progressbar"
        aria-valuenow={progress.step}
        aria-valuemin={0}
        aria-valuemax={progress.maxSteps}
        aria-label={`Progress: ${Math.round((progress.step / progress.maxSteps) * 100)}%`}
      >
        <Progress
          value={(progress.step / progress.maxSteps) * 100}
          className={cn('flex-1 h-1.5', STATUS_FILL[progress.status])}
        />
        <div className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          Step {progress.step} of {progress.maxSteps}
        </div>
      </div>
    </div>
  );
}
