import React, { useState, useEffect } from 'react';
import { CheckCircle, Spinner, Circle, CaretDown, CaretRight, Robot } from '@phosphor-icons/react';
import type { ThinkingStep } from '../../hooks/useChatSession';

interface ThinkingStepsProps {
  steps: ThinkingStep[];
  isComplete: boolean;
  durationMs?: number;
}

const LOADING_MESSAGES: Record<string, string> = {
  classify: 'Understanding your question...',
  classifyIntent: 'Understanding your question...',
  webSearch: 'Searching the web...',
  synthesizeWithSelfCheck: 'Composing answer...',
  synthesize: 'Composing answer...',
  quickVerify: 'Quick verification...',
  fastPath: 'Responding...',
  internalKnowledge: 'Checking knowledge...',
  externalSearchFanOut: 'Searching multiple sources...',
  fallbackSearch: 'Trying different approach...',
  replan: 'Looking deeper...',
  generalChat: 'Generating response...',
  tool_execution: 'Running tool...',
};

const PHASE_ORDER = [
  'classify', 'classifyIntent', 'webSearch', 'externalSearchFanOut',
  'generalChat', 'internalKnowledge', 'synthesizeWithSelfCheck', 'synthesize',
  'quickVerify', 'validate', 'replan', 'fallbackSearch', 'fastPath', 'tool_execution',
];

const PHASE_LABELS: Record<string, string> = {
  classify: 'Understanding',
  classifyIntent: 'Understanding',
  webSearch: 'Searching',
  externalSearchFanOut: 'Searching',
  generalChat: 'Thinking',
  internalKnowledge: 'Recalling',
  synthesizeWithSelfCheck: 'Synthesizing',
  synthesize: 'Synthesizing',
  quickVerify: 'Verifying',
  validate: 'Reviewing',
  replan: 'Refining',
  fallbackSearch: 'Re-searching',
  fastPath: 'Responding',
};

function getLoadingMessage(activeStep: string): string {
  return LOADING_MESSAGES[activeStep] || 'Thinking...';
}

function getStepBadge(step: ThinkingStep): { label: string; className: string } | null {
  if (step.type === 'tool_start' || step.step === 'tool_execution') {
    return { label: 'tool', className: 'step-badge tool' };
  }
  if (step.step === 'webSearch' || step.step === 'externalSearchFanOut' || step.step === 'fallbackSearch') {
    return { label: 'web', className: 'step-badge web' };
  }
  if (step.data?.name === 'web_search') {
    return { label: 'web', className: 'step-badge web' };
  }
  if (step.step.includes('file') || step.step.includes('read')) {
    return { label: 'file', className: 'step-badge file' };
  }
  return null;
}

function aggregateSteps(steps: ThinkingStep[]): ThinkingStep[] {
  const nodeRunCounts = new Map<string, number>();
  const seenPhases = new Set<string>();
  const aggregated: ThinkingStep[] = [];
  let retryCount = 0;

  for (const step of steps) {
    if (step.step === 'node_start' || step.step === 'node_end') continue;

    const count = (nodeRunCounts.get(step.step) || 0) + 1;
    nodeRunCounts.set(step.step, count);

    if (count > 1) {
      retryCount++;
    }

    if (!seenPhases.has(step.step)) {
      seenPhases.add(step.step);
      aggregated.push({
        ...step,
        status: step.status,
      });
    } else {
      const existingIdx = aggregated.findIndex(s => s.step === step.step);
      if (existingIdx !== -1) {
        aggregated[existingIdx] = {
          ...aggregated[existingIdx],
          status: step.status,
          detail: step.detail,
        };
      }
    }
  }

  aggregated.sort((a, b) => {
    const aIdx = PHASE_ORDER.indexOf(a.step);
    const bIdx = PHASE_ORDER.indexOf(b.step);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  if (retryCount > 0) {
    const validateStep = aggregated.find(s => s.step === 'validate');
    if (validateStep) {
      validateStep.detail = `Reviewed ${retryCount + 1} iterations`;
    }
  }

  return aggregated;
}

function StepIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return <CheckCircle className="w-3 h-3 text-[var(--color-green-500)]" weight="fill" />;
  }
  if (status === 'in_progress') {
    return <Spinner className="w-3 h-3 text-primary animate-spin" />;
  }
  return <Circle className="w-3 h-3 text-muted-foreground opacity-30" weight="light" />;
}

function StepItem({ step, isLast }: { step: ThinkingStep; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayName = PHASE_LABELS[step.step] || step.step;
  const hasDetail = !!step.detail && step.detail.length > 0;
  const badge = getStepBadge(step);

  return (
    <div className="thinking-step" aria-label={displayName}>
      <div className="thinking-step-marker">
        <StepIcon status={step.status} />
        {!isLast && <div className="thinking-step-line" />}
      </div>
      <div className="thinking-step-content">
        <button
          className={`thinking-step-header ${hasDetail ? 'expandable' : ''}`}
          onClick={() => hasDetail && setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          type="button"
        >
          <span className="thinking-step-text">
            {displayName}
            {badge && <span className={badge.className}>{badge.label}</span>}
            {hasDetail && (
              <span className="thinking-step-detail-badge">{step.detail}</span>
            )}
          </span>
          {hasDetail && (
            <span className="thinking-step-toggle">
              {isExpanded ? (
                <CaretDown className="w-3 h-3" />
              ) : (
                <CaretRight className="w-3 h-3" />
              )}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function ExpandedThinkingSteps({ steps }: { steps: ThinkingStep[] }) {
  return (
    <div className="thinking-steps-list">
      {steps.map((step, index) => (
        <StepItem key={`${step.step}-${index}`} step={step} isLast={index === steps.length - 1} />
      ))}
    </div>
  );
}

export function ThinkingSteps({ steps, isComplete, durationMs }: ThinkingStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const aggregatedSteps = aggregateSteps(steps);

  useEffect(() => {
    if (isComplete) {
      setIsExpanded(false);
    }
  }, [isComplete]);

  if (aggregatedSteps.length === 0) return null;

  const shouldHideForSimple = isComplete && aggregatedSteps.length <= 2;
  if (shouldHideForSimple) return null;

  const completedCount = aggregatedSteps.filter(s => s.status === 'completed').length;
  const totalCount = aggregatedSteps.length;
  const duration = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '';

  const activeStep = aggregatedSteps.find(s => s.status === 'in_progress');
  const loadingMessage = activeStep ? getLoadingMessage(activeStep.step) : null;

  if (!isComplete) {
    return (
      <div
        className="thinking-steps thinking-steps-expanded"
        role="status"
        aria-live="polite"
        aria-label="AI is thinking"
      >
        <div className="thinking-steps-header">
          <Spinner className="w-3 h-3 animate-spin text-muted-foreground" />
          <span className="thinking-steps-label">
            {loadingMessage || `Thinking... ${completedCount}/${totalCount}`}
          </span>
        </div>
        <ExpandedThinkingSteps steps={aggregatedSteps} />
      </div>
    );
  }

  return (
    <details
      className="thinking-summary"
      open={isExpanded}
      aria-label="Thinking process"
    >
      <summary className="thinking-summary-header">
        <Robot className="w-3 h-3" />
        <span>Thought for {duration}</span>
        <CaretRight className={`w-3 h-3 thinking-summary-chevron ${isExpanded ? 'expanded' : ''}`} />
      </summary>
      <div className="thinking-summary-body">
        <ExpandedThinkingSteps steps={aggregatedSteps} />
      </div>
    </details>
  );
}
