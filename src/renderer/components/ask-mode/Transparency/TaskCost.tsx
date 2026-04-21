import React, { useState } from 'react';
import { calculateCost, formatCost, formatTokenCount, calculateTokensPerSecond, getDisplayModelName, type TaskMetrics } from '../../../utils/costCalculator';
import { ClockIcon, CaretDownIcon } from '@phosphor-icons/react';

interface TaskCostProps {
  metrics: TaskMetrics;
  showBreakdown?: boolean;
  defaultExpanded?: boolean;
}

export function TaskCost({ metrics, showBreakdown = false, defaultExpanded = false }: TaskCostProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tokensPerSecond = calculateTokensPerSecond(metrics.tokensUsed, metrics.durationMs);
  const durationSeconds = (metrics.durationMs / 1000).toFixed(1);

  return (
    <details className="task-cost-display" open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
      <summary className="task-cost-summary">
        <ClockIcon className="task-cost-icon" />
        <span className="task-cost-label">Task Metrics</span>
        <span className="task-cost-preview">
          {formatTokenCount(metrics.tokensUsed)} tokens · {formatCost(metrics.estimatedCost)} · {durationSeconds}s
        </span>
        <CaretDownIcon className="task-cost-chevron" />
      </summary>

      <div className="task-cost-content">
        <div className="cost-metrics-grid">
          <div className="metric-item">
            <span className="metric-label">Tokens</span>
            <span className="metric-value">{formatTokenCount(metrics.tokensUsed)}</span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Cost (est.)</span>
            <span className="metric-value cost-highlight">{formatCost(metrics.estimatedCost)}</span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Time</span>
            <span className="metric-value">{durationSeconds}s</span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Speed</span>
            <span className="metric-value">{formatTokenCount(tokensPerSecond)} tok/s</span>
          </div>
        </div>

        {showBreakdown && metrics.inputTokens !== undefined && metrics.outputTokens !== undefined && (
          <div className="cost-breakdown">
            <div className="breakdown-row">
              <span className="breakdown-label">Input tokens:</span>
              <span className="breakdown-value">{formatTokenCount(metrics.inputTokens)}</span>
            </div>
            <div className="breakdown-row">
              <span className="breakdown-label">Output tokens:</span>
              <span className="breakdown-value">{formatTokenCount(metrics.outputTokens)}</span>
            </div>
            {metrics.model && (
              <div className="breakdown-row">
                <span className="breakdown-label">Model:</span>
                <span className="breakdown-value model-name">{getDisplayModelName(metrics.model)}</span>
              </div>
            )}
          </div>
        )}

        <div className="cost-disclaimer">
          <span>Costs are estimates based on token usage. Actual charges may vary.</span>
        </div>
      </div>
    </details>
  );
}
