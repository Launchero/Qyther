import React, { useState, useEffect } from 'react';
import { CheckCircle, Spinner, Circle, CaretDown, CaretRight, Robot } from '@phosphor-icons/react';
import type { ThinkingStep } from '../../../shared/ipc/thinking-step';

interface ThinkingStepsProps {
  steps: ThinkingStep[];
  isComplete: boolean;
  durationMs?: number;
}

/**
 * Badges are keyed on the tool **family**, which the bridge derives from the registry, so
 * this is the only name list in the file and it cannot drift from the tool set — a family
 * row is one entry here at most, not one per tool.
 *
 * The three maps this replaces (`LOADING_MESSAGES`, `PHASE_LABELS`, `PHASE_ORDER`) and the
 * `getStepBadge` switch were keyed on LangGraph node names. The graph is gone; the maps
 * stayed, so 39 of the 44 first-party tools rendered their internal `snake_case` name, the
 * sort was a no-op that only looked like a contract, and the "Reviewed N iterations" line
 * wrote itself onto a `validate` step that can never arrive.
 */
const FAMILY_BADGE: Record<string, { label: string; className: string }> = {
  web: { label: 'web', className: 'step-badge web' },
  document: { label: 'doc', className: 'step-badge file' },
  desktop: { label: 'tool', className: 'step-badge tool' },
  browser: { label: 'browser', className: 'step-badge tool' },
};

function getStepBadge(step: ThinkingStep): { label: string; className: string } | null {
  return step.family ? FAMILY_BADGE[step.family] ?? null : null;
}

/** The declared label, or the tool name when a toolbox supplied none. Never a local map. */
function stepLabel(step: ThinkingStep): string {
  const label = step.label?.trim();
  return label && label.length > 0 ? label : step.step;
}
/**
 * Fold each completion onto the step it completed, and keep everything else as its own row.
 *
 * The pump marks an update row with `update: true` and reuses the tool name, so the fold is
 * by name **among rows that are still open** — which is what lets three `search_web` calls
 * show as three rows. The version this replaces deduped by name unconditionally, so a
 * retry, a loop and a third attempt all collapsed into one line and the user lost exactly
 * the evidence that would have told them the plan had gone wrong. There is also no sort:
 * arrival order is execution order, and `toolExecution: "sequential"` is what guarantees it.
 */
export function foldSteps(steps: ThinkingStep[]): ThinkingStep[] {
  const folded: ThinkingStep[] = [];

  for (const step of steps) {
    if (step.update) {
      let openIdx = -1;
      for (let i = folded.length - 1; i >= 0; i--) {
        if (folded[i].step === step.step && folded[i].status !== 'completed') {
          openIdx = i;
          break;
        }
      }
      if (openIdx !== -1) {
        folded[openIdx] = {
          ...folded[openIdx],
          status: step.status,
          detail: step.detail,
          label: step.label ?? folded[openIdx].label,
          family: step.family ?? folded[openIdx].family,
        };
        continue;
      }
    }
    folded.push(step);
  }

  return folded;
}

function StepIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return <CheckCircle className="w-3 h-3 text-success" weight="fill" aria-hidden="true" />;
  }
  if (status === 'in_progress') {
    return <Spinner className="w-3 h-3 text-primary animate-spin" aria-hidden="true" />;
  }
  return <Circle className="w-3 h-3 text-muted-foreground opacity-30" weight="light" aria-hidden="true" />;
}

function StepItem({ step, isLast }: { step: ThinkingStep; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayName = stepLabel(step);
  const hasDetail = !!step.detail && step.detail.length > 0;
  const badge = getStepBadge(step);
  const headerClassName = `thinking-step-header ${hasDetail ? 'expandable' : ''}`;
  const headerChildren = (
    <>
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
            <CaretDown className="w-3 h-3" aria-hidden="true" />
          ) : (
            <CaretRight className="w-3 h-3" aria-hidden="true" />
          )}
        </span>
      )}
    </>
  );

  return (
    <div className="thinking-step" aria-label={displayName}>
      <div className="thinking-step-marker">
        <StepIcon status={step.status} />
        {!isLast && <div className="thinking-step-line" />}
      </div>
      <div className="thinking-step-content">
        {hasDetail ? (
          <button
            className={headerClassName}
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            type="button"
          >
            {headerChildren}
          </button>
        ) : (
          <span className={headerClassName}>{headerChildren}</span>
        )}
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

  const aggregatedSteps = foldSteps(steps);

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
  // The running line names the tool the agent is actually in, from that tool's own
  // declaration, and keeps the progress count. The copy used to come from a
  // `LOADING_MESSAGES` map keyed on deleted graph nodes, so every real tool step fell
  // through to the generic "Thinking...".
  const activeLabel = activeStep ? `${stepLabel(activeStep)}…` : 'Thinking…';

  if (!isComplete) {
    return (
      <div
        className="thinking-steps thinking-steps-expanded"
        role="status"
        aria-live="polite"
        aria-label="AI is thinking"
      >
        <div className="thinking-steps-header">
          <Spinner className="w-3 h-3 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="thinking-steps-label">
            {activeLabel} {completedCount}/{totalCount}
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
        <Robot className="w-3 h-3" aria-hidden="true" />
        <span>Thought for {duration}</span>
        <CaretRight className={`w-3 h-3 thinking-summary-chevron ${isExpanded ? 'expanded' : ''}`} aria-hidden="true" />
      </summary>
      <div className="thinking-summary-body">
        <ExpandedThinkingSteps steps={aggregatedSteps} />
      </div>
    </details>
  );
}
