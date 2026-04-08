import React, { useEffect, useState } from 'react';

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  isRecommended?: boolean;
}

export interface ModelSelectorProps {
  models?: AIModel[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  open: boolean;
  onToggle: () => void;
  visible?: boolean;
}

export function ModelSelector({
  models: externalModels,
  selectedModel,
  onSelect,
  open,
  onToggle,
  visible = true,
}: ModelSelectorProps) {
  const [realModels, setRealModels] = useState<AIModel[]>([]);

  useEffect(() => {
    // Fetch models from OpenCode API
    window.electronAPI.opencode.getModels().then((models) => {
      setRealModels(models);
    }).catch((err) => {
      console.error('[ModelSelector] Failed to load models:', err);
      // Fallback to default models if API fails
      setRealModels([
        { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship model', isRecommended: true },
        { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Fast GPT-4' },
        { id: 'google/gemini-2.0-pro', name: 'Gemini 2.0 Pro', description: 'Google best model' },
        { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Google fast model' },
        { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: 'Best for coding tasks' },
      ]);
    });
  }, []);

  const handleModelSelect = (modelId: string) => {
    onSelect(modelId);
    onToggle();
  };

  const displayModels = externalModels || realModels;
  const selectedModelName = displayModels.find(m => m.id === selectedModel)?.name || selectedModel || 'Select Model';

  if (!visible) {
    return null;
  }

  return (
    <div className={`model-selector ${open ? 'open' : ''}`}>
      <button 
        className="model-toggle"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <svg className="model-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 8v8M8 12h8" strokeLinecap="round"/>
        </svg>
        <span className="model-name">{selectedModelName}</span>
        <svg className="model-dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9L12 15L18 9" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Model Dropdown Menu */}
      <div className="model-dropdown-menu">
        {displayModels.map((model) => (
          <div
            key={model.id}
            className={`model-dropdown-item ${selectedModel === model.id ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleModelSelect(model.id);
            }}
          >
            <div className="model-dropdown-item-content">
              <span className="model-dropdown-item-label">{model.name}</span>
              {model.description && (
                <span className="model-dropdown-item-desc">{model.description}</span>
              )}
            </div>
            {model.isRecommended && (
              <span className="model-dropdown-item-badge">Recommended</span>
            )}
            {selectedModel === model.id && (
              <svg className="model-dropdown-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17L4 12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
