import React, { useState } from 'react';

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
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
        );
      case 'clicking':
      case 'typing':
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'extracting':
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      default:
        return null;
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (progress.status) {
      case 'navigating':
        return '#7132f5'; // Kraken Purple
      case 'clicking':
      case 'typing':
        return '#3b82f6'; // Blue
      case 'extracting':
        return '#10b981'; // Green
      default:
        return '#6b7280'; // Gray
    }
  };

  const statusColor = getStatusColor();

  return (
    <div className="browser-progress-panel" role="status" aria-live="polite">
      {/* Progress Header */}
      <div className="browser-progress-header">
        <div className="browser-progress-title">
          <div className="browser-progress-icon" style={{ color: statusColor }}>
            {getStatusIcon()}
          </div>
          <span>Automating browser task...</span>
        </div>
        
        {/* Progress Controls */}
        <div className="browser-progress-controls">
          {!isPaused ? (
            onPause && (
              <button
                className="browser-control-btn"
                onClick={onPause}
                title="Pause automation"
                aria-label="Pause automation"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
                  <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
                </svg>
              </button>
            )
          ) : (
            onResume && (
              <button
                className="browser-control-btn"
                onClick={onResume}
                title="Resume automation"
                aria-label="Resume automation"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 3l14 9-14 9V3z" fill="currentColor"/>
                </svg>
              </button>
            )
          )}
          
          {onStop && (
            <button
              className="browser-control-btn browser-control-btn-stop"
              onClick={onStop}
              title="Stop and reset"
              aria-label="Stop automation"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="4" width="16" height="16" fill="currentColor"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Current Step with Reasoning */}
      <div className="browser-current-step">
        <div className="step-indicator">
          <div className="step-number">{progress.step}</div>
          <div className="step-status-line"></div>
        </div>
        
        <div className="step-content">
          <div className="step-action">
            <span className="step-status-badge" style={{ backgroundColor: statusColor + '20', color: statusColor }}>
              {progress.status}
            </span>
            <span className="step-text">{progress.message}</span>
          </div>
          
          {progress.url && (
            <div className="step-url" title={progress.url}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {progress.url}
            </div>
          )}
          
          {/* Reasoning Section */}
          {reasoning && (
            <div className="step-reasoning">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                <path d="M9.66347 17H14.3365C15.657 17 16.3173 17 16.8492 16.7873C17.3173 16.6003 17.7304 16.3069 18.0607 15.9272C18.4348 15.4977 18.6176 14.862 18.9833 13.5906L19.1579 12.9822C19.4126 12.0966 19.5399 11.6538 19.4779 11.2709C19.4228 10.9306 19.2752 10.6111 19.0502 10.3459C18.7974 10.0478 18.4163 9.89355 17.6541 9.58503L17.2909 9.43836C15.9674 8.90425 15.3057 8.63719 14.7139 8.58135C14.1896 8.53189 13.6662 8.60953 13.1754 8.80953C12.6229 9.03484 12.1353 9.42594 11.16 10.2081L10.8908 10.424C10.0932 11.0632 9.69438 11.3828 9.25828 11.5684C8.87114 11.7332 8.45496 11.8192 8.03512 11.821C7.56348 11.823 7.08676 11.6825 6.13332 11.4015L5.82843 11.3118C4.98885 11.0649 4.56906 10.9414 4.30323 11.1159C4.06808 11.2703 3.92157 11.5261 3.90194 11.8087C3.87995 12.1254 4.07152 12.5196 4.45467 13.3079L4.57726 13.5604C5.25989 14.9659 5.6012 15.6686 6.18321 16.1837C6.69603 16.6371 7.33278 16.9461 8.01673 17.0737C8.79223 17.2184 9.59889 17.1279 11.2122 16.9469L11.6635 16.8962" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M15 7a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span>{reasoning}</span>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Steps */}
      {upcomingSteps && upcomingSteps.length > 0 && (
        <div className="browser-upcoming-steps">
          <div className="upcoming-steps-title">Upcoming steps:</div>
          {upcomingSteps.map((step, index) => (
            <div key={index} className="step-preview">
              <div className="step-preview-number">{progress.step + index + 1}</div>
              <span className="step-preview-text">{step}</span>
            </div>
          ))}
        </div>
      )}

      {/* Metrics Section */}
      {metrics && (
        <div className="browser-step-metrics">
          {metrics.elapsedMs !== undefined && (
            <div className="metric-item">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Time: {(metrics.elapsedMs / 1000).toFixed(1)}s</span>
            </div>
          )}
          
          {metrics.estimatedTokens && (
            <div className="metric-item">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Tokens: {metrics.estimatedTokens.toLocaleString()}</span>
            </div>
          )}
          
          {metrics.confidence && (
            <div className="metric-item">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Confidence: {metrics.confidence}%</span>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div className="browser-progress-bar-container">
        <div className="browser-progress-bar">
          <div 
            className="browser-progress-fill"
            style={{ 
              width: `${(progress.step / progress.maxSteps) * 100}%`,
              backgroundColor: statusColor
            }}
          />
        </div>
        <div className="browser-progress-text">
          Step {progress.step} of {progress.maxSteps}
        </div>
      </div>
    </div>
  );
}
