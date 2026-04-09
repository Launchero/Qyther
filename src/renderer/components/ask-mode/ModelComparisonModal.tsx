import React from 'react';
import { MODEL_PROFILES, ModelProfile, getRecommendedModel, getSpeedColor, getQualityColor } from '../../utils/modelRecommendations';

interface ModelComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  currentTaskType?: string;
}

export function ModelComparisonModal({
  isOpen,
  onClose,
  selectedModel,
  onSelectModel,
  currentTaskType,
}: ModelComparisonModalProps) {
  if (!isOpen) return null;

  const recommendedModel = currentTaskType ? getRecommendedModel(currentTaskType) : 'Qwen';

  const handleModelSelect = (modelName: string) => {
    onSelectModel(modelName);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="model-comparison-modal-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div className="model-comparison-modal">
        {/* Modal Header */}
        <div className="model-modal-header">
          <div>
            <h3 className="model-modal-title">Choose AI Model</h3>
            <p className="model-modal-subtitle">
              Select the best model for your task based on speed, quality, and capabilities
            </p>
          </div>
          <button className="model-modal-close" onClick={onClose} aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Recommendation Banner */}
        {currentTaskType && recommendedModel !== selectedModel && (
          <div className="model-recommendation-banner">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
              <path d="M9.66347 17H14.3365C15.657 17 16.3173 17 16.8492 16.7873C17.3173 16.6003 17.7304 16.3069 18.0607 15.9272C18.4348 15.4977 18.6176 14.862 18.9833 13.5906L19.1579 12.9822C19.4126 12.0966 19.5399 11.6538 19.4779 11.2709C19.4228 10.9306 19.2752 10.6111 19.0502 10.3459C18.7974 10.0478 18.4163 9.89355 17.6541 9.58503L17.2909 9.43836C15.9674 8.90425 15.3057 8.63719 14.7139 8.58135C14.1896 8.53189 13.6662 8.60953 13.1754 8.80953C12.6229 9.03484 12.1353 9.42594 11.16 10.2081L10.8908 10.424C10.0932 11.0632 9.69438 11.3828 9.25828 11.5684C8.87114 11.7332 8.45496 11.8192 8.03512 11.821C7.56348 11.823 7.08676 11.6825 6.13332 11.4015L5.82843 11.3118C4.98885 11.0649 4.56906 10.9414 4.30323 11.1159C4.06808 11.2703 3.92157 11.5261 3.90194 11.8087C3.87995 12.1254 4.07152 12.5196 4.45467 13.3079L4.57726 13.5604C5.25989 14.9659 5.6012 15.6686 6.18321 16.1837C6.69603 16.6371 7.33278 16.9461 8.01673 17.0737C8.79223 17.2184 9.59889 17.1279 11.2122 16.9469L11.6635 16.8962" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M15 7a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <div className="recommendation-text">
              <span>For your task, we recommend <strong>{recommendedModel}</strong></span>
              {recommendedModel !== selectedModel && (
                <button 
                  className="recommendation-switch-btn"
                  onClick={() => handleModelSelect(recommendedModel)}
                >
                  Switch to {recommendedModel}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Model Cards Grid */}
        <div className="model-cards-grid">
          {MODEL_PROFILES.map((profile) => (
            <ModelCard
              key={profile.name}
              profile={profile}
              isSelected={profile.name === selectedModel}
              isRecommended={profile.name === recommendedModel}
              onSelect={() => handleModelSelect(profile.name)}
            />
          ))}
        </div>

        {/* Comparison Table */}
        <div className="model-comparison-table-container">
          <h4 className="comparison-table-title">Quick Comparison</h4>
          <table className="model-comparison-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Speed</th>
                <th>Quality</th>
                <th>Context Window</th>
                <th>Browser Automation</th>
                <th>Best For</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_PROFILES.map((profile) => (
                <tr key={profile.name} className={profile.name === selectedModel ? 'selected-row' : ''}>
                  <td>
                    <div className="model-name-cell">
                      <span className="model-name">{profile.name}</span>
                      {profile.name === selectedModel && (
                        <span className="selected-badge">Selected</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="speed-badge" style={{ backgroundColor: getSpeedColor(profile.speed) + '20', color: getSpeedColor(profile.speed) }}>
                      {profile.speed}
                    </span>
                  </td>
                  <td>
                    <span className="quality-badge" style={{ backgroundColor: getQualityColor(profile.quality) + '20', color: getQualityColor(profile.quality) }}>
                      {profile.quality}
                    </span>
                  </td>
                  <td>{profile.contextWindow}</td>
                  <td>
                    {profile.supportsBrowserAutomation ? (
                      <span className="supported-badge">✓ Supported</span>
                    ) : (
                      <span className="not-supported-badge">✗ Not Supported</span>
                    )}
                  </td>
                  <td>
                    <div className="best-for-list">
                      {profile.bestFor.slice(0, 3).map((useCase, index) => (
                        <span key={index} className="use-case-tag">{useCase}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="model-modal-footer">
          <p className="modal-footer-note">
            You can change the model at any time. Your selection will be applied to the current conversation.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ModelCardProps {
  profile: ModelProfile;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}

function ModelCard({ profile, isSelected, isRecommended, onSelect }: ModelCardProps) {
  return (
    <div 
      className={`model-card ${isSelected ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={isSelected}
    >
      {/* Card Header */}
      <div className="model-card-header">
        <h3 className="model-card-name">{profile.name}</h3>
        {isRecommended && (
          <span className="recommended-badge">Recommended</span>
        )}
        {isSelected && (
          <span className="selected-check-badge">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
      </div>

      {/* Description */}
      <p className="model-card-description">{profile.description}</p>

      {/* Metrics */}
      <div className="model-card-metrics">
        <div className="metric">
          <span className="metric-label">Speed</span>
          <span className="metric-value" style={{ color: getSpeedColor(profile.speed) }}>
            {profile.speed}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Quality</span>
          <span className="metric-value" style={{ color: getQualityColor(profile.quality) }}>
            {profile.quality}
          </span>
        </div>
      </div>

      {/* Context Window */}
      <div className="model-card-context">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>{profile.contextWindow}</span>
      </div>

      {/* Best For */}
      <div className="model-card-best-for">
        <span className="best-for-label">Best for:</span>
        <div className="best-for-tags">
          {profile.bestFor.slice(0, 3).map((useCase, index) => (
            <span key={index} className="best-for-tag">{useCase}</span>
          ))}
        </div>
      </div>

      {/* Browser Automation Support */}
      <div className={`browser-automation-support ${profile.supportsBrowserAutomation ? 'supported' : 'not-supported'}`}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" stroke="currentColor" strokeWidth="2"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
        <span>
          {profile.supportsBrowserAutomation ? 'Browser automation supported' : 'Browser automation not supported'}
        </span>
      </div>
    </div>
  );
}
