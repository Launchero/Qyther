import React from 'react';
import { BrainIcon, CaretDownIcon } from '@phosphor-icons/react';

export interface ReasoningStep {
  stepNumber: number;
  action: string;
  reasoning: string;
  confidence?: number;
}

interface ReasoningTraceProps {
  steps: ReasoningStep[];
  title?: string;
  defaultExpanded?: boolean;
}

export function ReasoningTrace({ steps, title = 'Reasoning Process', defaultExpanded = false }: ReasoningTraceProps) {
  return (
    <details className="reasoning-trace" open={defaultExpanded}>
      <summary className="reasoning-summary">
        <BrainIcon className="thinking-icon" />
        <span className="summary-text">
          {title} ({steps.length} {steps.length === 1 ? 'step' : 'steps'})
        </span>
        <CaretDownIcon className="chevron-icon" />
      </summary>
      
      <div className="reasoning-steps-container">
        {steps.map((step, index) => (
          <div key={index} className="reasoning-step">
            <div className="step-header">
              <span className="step-number">Step {step.stepNumber}</span>
              {step.confidence && (
                <span className={`step-confidence confidence-${step.confidence >= 80 ? 'high' : step.confidence >= 60 ? 'medium' : 'low'}`}>
                  {step.confidence}% confidence
                </span>
              )}
            </div>
            
            <div className="step-content">
              <div className="step-action">
                <strong>Action:</strong> {step.action}
              </div>
              <div className="step-reasoning">
                <strong>Reasoning:</strong> {step.reasoning}
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
