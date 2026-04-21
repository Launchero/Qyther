import React from 'react';

export interface ContextUsageIndicatorProps {
  current: number;
  total: number;
  showDetails?: boolean;
}

export function ContextUsageIndicator({ 
  current, 
  total, 
  showDetails = false 
}: ContextUsageIndicatorProps) {
  const percentage = (current / total) * 100;
  
  const getColor = () => {
    if (percentage >= 90) return 'var(--color-red-500)';
    if (percentage >= 75) return 'var(--primary)';
    if (percentage >= 50) return 'var(--color-primary-dark)';
    return 'var(--color-green-500)';
  };

  const getAlertMessage = () => {
    if (percentage >= 90) {
      return 'Context at 90%. Recommend closing session and creating a handoff.';
    }
    if (percentage >= 75) {
      return 'Context at 75%. Good time to commit progress and evaluate session scope.';
    }
    if (percentage >= 50) {
      return 'Context at 50%. Consider whether remaining work fits this session.';
    }
    return null;
  };

  const formatTokens = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  return (
    <div className="context-usage-indicator">
      <div className="context-status-bar">
        <span 
          className="context-percentage"
          style={{ color: getColor() }}
        >
          Context: {percentage.toFixed(0)}%
        </span>
        <span className="context-fraction">
          ({formatTokens(current)}/{formatTokens(total)})
        </span>
      </div>

      <div className="context-progress-bar">
        <div 
          className="context-progress-fill"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: getColor()
          }}
        />
      </div>

      {getAlertMessage() && (
        <div className="context-alert" style={{ borderColor: getColor() }}>
          ⚠️ {getAlertMessage()}
        </div>
      )}

      {showDetails && (
        <div className="context-breakdown">
          <div className="breakdown-row">
            <span>Conversation History:</span>
            <span>~{formatTokens(Math.round(current * 0.6))}</span>
          </div>
          <div className="breakdown-row">
            <span>Tool Results:</span>
            <span>~{formatTokens(Math.round(current * 0.3))}</span>
          </div>
          <div className="breakdown-row">
            <span>Remaining Capacity:</span>
            <span>~{formatTokens(total - current)} tokens</span>
          </div>
        </div>
      )}
    </div>
  );
}
