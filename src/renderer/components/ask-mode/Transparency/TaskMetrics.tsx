import React, { useState } from 'react';
import { formatCost, formatTokenCount, calculateTokensPerSecond, getDisplayModelName, MODEL_PRICING, type TaskMetrics } from '../../../utils/costCalculator';
import { ClockIcon, CaretDownIcon, SquaresFourIcon } from '@phosphor-icons/react';

interface TaskMetricsProps {
  metrics: TaskMetrics;
  defaultExpanded?: boolean;
}

export function TaskMetricsDisplay({ metrics, defaultExpanded = false }: TaskMetricsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tokensPerSecond = metrics.tokensUsed !== undefined
    ? calculateTokensPerSecond(metrics.tokensUsed, metrics.durationMs)
    : undefined;
  const durationSeconds = (metrics.durationMs / 1000).toFixed(1);
  const pricing = MODEL_PRICING.find(p => p.model === metrics.model);
  const inputCost = pricing && metrics.inputTokens !== undefined
    ? (metrics.inputTokens * pricing.inputPricePer1K) / 1000
    : 0;
  const outputCost = pricing && metrics.outputTokens !== undefined
    ? (metrics.outputTokens * pricing.outputPricePer1K) / 1000
    : 0;
  const totalTokens = (metrics.inputTokens || 0) + (metrics.outputTokens || 0);
  const inputPercentage = totalTokens > 0 ? ((metrics.inputTokens || 0) / totalTokens) * 100 : 0;
  const outputPercentage = totalTokens > 0 ? ((metrics.outputTokens || 0) / totalTokens) * 100 : 0;

  return (
    <details className="task-metrics-display" open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
      <summary className="task-metrics-summary">
        <ClockIcon className="task-metrics-icon" aria-hidden="true" />
        <span className="task-metrics-label">Task Details</span>
        <span className="task-metrics-preview">
          {[
            metrics.tokensUsed !== undefined ? `${formatTokenCount(metrics.tokensUsed)} tokens` : null,
            metrics.estimatedCost !== undefined ? formatCost(metrics.estimatedCost) : null,
            `${durationSeconds}s`,
          ].filter(Boolean).join(' · ')}
        </span>
        <CaretDownIcon className="task-metrics-chevron" aria-hidden="true" />
      </summary>

      <div className="task-metrics-content">
        <div className="metrics-grid">
          {metrics.tokensUsed !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Tokens</span>
              <span className="metric-value">{formatTokenCount(metrics.tokensUsed)}</span>
            </div>
          )}

          {metrics.estimatedCost !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Cost (est.)</span>
              <span className="metric-value cost-highlight">{formatCost(metrics.estimatedCost)}</span>
            </div>
          )}

          <div className="metric-item">
            <span className="metric-label">Time</span>
            <span className="metric-value">{durationSeconds}s</span>
          </div>

          {tokensPerSecond !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Speed</span>
              <span className="metric-value">{formatTokenCount(tokensPerSecond)} tok/s</span>
            </div>
          )}
        </div>

        {metrics.inputTokens !== undefined && metrics.outputTokens !== undefined && (
          <div className="token-breakdown-section">
            <div className="token-breakdown-header">
              <SquaresFourIcon className="token-breakdown-icon" aria-hidden="true" />
              <span className="token-breakdown-label">Input {formatTokenCount(metrics.inputTokens)} · Output {formatTokenCount(metrics.outputTokens)}</span>
            </div>

            <div className="token-visualization">
              <div className="token-bar">
                <div
                  className="token-segment input-tokens"
                  style={{ width: `${inputPercentage}%` }}
                  title={`Input: ${formatTokenCount(metrics.inputTokens)} tokens`}
                />
                <div
                  className="token-segment output-tokens"
                  style={{ width: `${outputPercentage}%` }}
                  title={`Output: ${formatTokenCount(metrics.outputTokens)} tokens`}
                />
              </div>
              <div className="token-legend">
                <div className="legend-item">
                  <span className="legend-color input-tokens" />
                  <span className="legend-label">Input ({formatTokenCount(metrics.inputTokens)})</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color output-tokens" />
                  <span className="legend-label">Output ({formatTokenCount(metrics.outputTokens)})</span>
                </div>
              </div>
            </div>

            {pricing && (
              <div className="pricing-details">
                <div className="pricing-row">
                  <span className="pricing-label">Input rate:</span>
                  <span className="pricing-value">${pricing.inputPricePer1K.toFixed(4)}/1K tokens</span>
                </div>
                <div className="pricing-row">
                  <span className="pricing-label">Output rate:</span>
                  <span className="pricing-value">${pricing.outputPricePer1K.toFixed(4)}/1K tokens</span>
                </div>
                <div className="pricing-row total">
                  <span className="pricing-label">Estimated cost:</span>
                  <span className="pricing-value cost-total">{formatCost(inputCost + outputCost)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {metrics.model && (
          <div className="model-info">
            <span className="model-label">Model:</span>
            <span className="model-name">{getDisplayModelName(metrics.model)}</span>
          </div>
        )}

        <div className="metrics-disclaimer">
          <span>Costs are estimates based on token usage. Actual charges may vary.</span>
        </div>
      </div>
    </details>
  );
}
