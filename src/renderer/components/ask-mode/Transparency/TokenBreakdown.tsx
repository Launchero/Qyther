import React, { useState } from 'react';
import { formatCost, formatTokenCount, MODEL_PRICING } from '../../../utils/costCalculator';
import { SquaresFourIcon, CaretDownIcon } from '@phosphor-icons/react';

interface TokenBreakdownProps {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  defaultExpanded?: boolean;
}

export function TokenBreakdown({ inputTokens, outputTokens, model, defaultExpanded = false }: TokenBreakdownProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const pricing = MODEL_PRICING.find(p => p.model === model);
  const inputCost = pricing ? (inputTokens * pricing.inputPricePer1K) / 1000 : 0;
  const outputCost = pricing ? (outputTokens * pricing.outputPricePer1K) / 1000 : 0;
  const totalCost = inputCost + outputCost;
  const totalTokens = inputTokens + outputTokens;

  const inputPercentage = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const outputPercentage = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;

  return (
    <details className="token-breakdown" open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
      <summary className="token-breakdown-summary">
        <SquaresFourIcon className="token-breakdown-icon" />
        <span className="token-breakdown-label">Token Breakdown</span>
        <span className="token-breakdown-preview">
          Input {formatTokenCount(inputTokens)} · Output {formatTokenCount(outputTokens)}
        </span>
        <CaretDownIcon className="token-breakdown-chevron" />
      </summary>

      <div className="token-breakdown-content">
        <div className="token-visualization">
          <div className="token-bar">
            <div
              className="token-segment input-tokens"
              style={{ width: `${inputPercentage}%` }}
              title={`Input: ${formatTokenCount(inputTokens)} tokens`}
            />
            <div
              className="token-segment output-tokens"
              style={{ width: `${outputPercentage}%` }}
              title={`Output: ${formatTokenCount(outputTokens)} tokens`}
            />
          </div>
          <div className="token-legend">
            <div className="legend-item">
              <span className="legend-color input-tokens" />
              <span className="legend-label">Input ({formatTokenCount(inputTokens)})</span>
            </div>
            <div className="legend-item">
              <span className="legend-color output-tokens" />
              <span className="legend-label">Output ({formatTokenCount(outputTokens)})</span>
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
              <span className="pricing-value cost-total">{formatCost(totalCost)}</span>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
