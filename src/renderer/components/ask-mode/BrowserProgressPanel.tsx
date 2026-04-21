import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompassIcon, PenNibIcon, DownloadSimpleIcon, PauseIcon, PlayIcon, StopIcon, LinkIcon, LightbulbIcon, ClockIcon, LightningIcon, CheckCircleIcon } from '@phosphor-icons/react';

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
    estimatedTokens?: number;
    confidence?: number;
  };
  onPause?: () => void;
  onStop?: () => void;
  onResume?: () => void;
  isPaused?: boolean;
}

export function BrowserProgressPanel({
  progress,
  reasoning,
  upcomingSteps,
  metrics,
  onPause,
  onStop,
  onResume,
  isPaused = false,
}: BrowserProgressPanelProps) {

  // Get status icon
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'navigating':
        return <CompassIcon className="w-5 h-5" />;
      case 'clicking':
      case 'typing':
        return <PenNibIcon className="w-5 h-5" />;
      case 'extracting':
        return <DownloadSimpleIcon className="w-5 h-5" />;
      default:
        return null;
    }
  };

  // Get status color as Tailwind class
  const getStatusColorClass = () => {
    switch (progress.status) {
      case 'navigating':
        return 'text-primary'; 
      case 'clicking':
      case 'typing':
        return 'text-[var(--color-blue-500)]';
      case 'extracting':
        return 'text-[var(--color-green-500)]';
      default:
        return 'text-muted-foreground';
    }
  };

  // Get status background color class for badges
  const getStatusBgClass = () => {
    switch (progress.status) {
      case 'navigating':
        return 'bg-primary/10 text-primary'; 
      case 'clicking':
      case 'typing':
        return 'bg-[var(--color-blue-500)]/10 text-[var(--color-blue-500)]';
      case 'extracting':
        return 'bg-[var(--color-green-500)]/10 text-[var(--color-green-500)]';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const statusColorClass = getStatusColorClass();
  const statusBgClass = getStatusBgClass();

  return (
    <div 
      className="flex flex-col gap-4 p-4 bg-muted/30 border border-muted rounded-lg" 
      role="status" 
      aria-live="polite" 
      aria-atomic="true"
      aria-label={`Browser automation progress: Step ${progress.step} of ${progress.maxSteps}, status: ${progress.status}`}
    >
      {/* Progress Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={cn("w-5 h-5", statusColorClass)} aria-hidden="true">
            {getStatusIcon()}
          </div>
          <span className="text-sm font-medium">Automating browser task...</span>
        </div>
        
        {/* Progress Controls */}
        <div className="flex gap-2" role="group" aria-label="Automation controls">
          {!isPaused ? (
            onPause && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={onPause}
                title="Pause automation"
                aria-label="Pause automation"
              >
                <PauseIcon className="w-4 h-4" />
              </Button>
            )
          ) : (
            onResume && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={onResume}
                title="Resume automation"
                aria-label="Resume automation"
              >
                <PlayIcon className="w-4 h-4" />
              </Button>
            )
          )}
          
          {onStop && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onStop}
              title="Stop and reset"
              aria-label="Stop automation"
            >
              <StopIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Current Step with Reasoning */}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
            {progress.step}
          </div>
          <div className="w-0.5 flex-1 bg-gradient-to-b from-primary to-muted mt-1"></div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className={cn("text-xs", statusBgClass)}>
              {progress.status}
            </Badge>
            <span className="text-sm font-medium">{progress.message}</span>
          </div>
          
          {progress.url && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <LinkIcon className="w-3.5 h-3.5" />
              <span className="sr-only">Current URL:</span> <span className="truncate">{progress.url}</span>
            </div>
          )}
          
          {/* Reasoning Section */}
          {reasoning && (
            <div className="flex items-start gap-2 p-3 bg-muted/50 border-l-3 border-primary rounded text-sm text-muted-foreground">
              <LightbulbIcon className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="sr-only">Reasoning:</span>
              <span>{reasoning}</span>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Steps */}
      {upcomingSteps && upcomingSteps.length > 0 && (
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Upcoming steps:</div>
          {upcomingSteps.map((step, index) => (
            <div key={index} className="flex items-center gap-2 py-1">
              <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold">
                {progress.step + index + 1}
              </div>
              <span className="text-sm text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
      )}

      {/* Metrics Section */}
      {metrics && (
        <div className="flex gap-4 flex-wrap p-3 bg-muted/30 rounded-lg" role="group" aria-label="Task metrics">
          {metrics.elapsedMs !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>Time: <span className="font-medium text-foreground">{(metrics.elapsedMs / 1000).toFixed(1)}s</span></span>
            </div>
          )}

          {metrics.estimatedTokens && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LightningIcon className="w-3.5 h-3.5" />
              <span>Tokens: <span className="font-medium text-foreground">{metrics.estimatedTokens.toLocaleString()}</span></span>
            </div>
          )}

          {metrics.confidence && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              <span>Confidence: <span className="font-medium text-foreground">{metrics.confidence}%</span></span>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div className="flex items-center gap-3" role="progressbar" aria-valuenow={progress.step} aria-valuemin={0} aria-valuemax={progress.maxSteps} aria-label={`Progress: ${Math.round((progress.step / progress.maxSteps) * 100)}%`}>
        <Progress 
          value={(progress.step / progress.maxSteps) * 100} 
          className={cn("flex-1 h-1.5", statusColorClass.replace('text-', '[&_[data-slot=progress-indicator]]:bg-'))}
        />
        <div className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          Step {progress.step} of {progress.maxSteps}
        </div>
      </div>
    </div>
  );
}
