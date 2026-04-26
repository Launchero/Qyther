import React, { useState, useCallback } from 'react';

interface ApiKeySetupProps {
  onConfigured: () => void;
}

export function ApiKeySetup({ onConfigured }: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
  const [model, setModel] = useState('qwen3.6-plus');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const result = await window.electronAPI.apiConfig.test({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      });

      if (result.success) {
        setTestResult('Connection successful!');
      } else {
        setTestResult(null);
        setError(result.error || 'Connection test failed');
      }
    } catch {
      setError('Failed to test connection');
    } finally {
      setIsTesting(false);
    }
  }, [apiKey, baseUrl, model]);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await window.electronAPI.apiConfig.save({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(onConfigured, 1500);
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch {
      setError('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, baseUrl, model, onConfigured]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isTesting) return;
      handleSave();
    }
  }, [handleSave, isTesting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-[500px] rounded-xl border border-border/50 bg-card/95 shadow-2xl p-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <rect x="6" y="8" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="2" className="text-primary" />
              <circle cx="12" cy="16" r="2" fill="currentColor" className="text-primary" />
              <circle cx="20" cy="16" r="2" fill="currentColor" className="text-primary" />
              <line x1="14" y1="16" x2="18" y2="16" stroke="currentColor" strokeWidth="2" className="text-primary" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Setup API Access</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Enter your API credentials to enable AI features
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              API Key
            </label>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
                setTestResult(null);
              }}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              autoFocus
              disabled={isSaving || success}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Base URL
            </label>
            <input
              type="url"
              placeholder="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              disabled={isSaving || success}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Model
            </label>
            <input
              type="text"
              placeholder="qwen3.6-plus"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              disabled={isSaving || success}
            />
          </div>

          {/* Error / Success Messages */}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          {testResult && (
            <p className="text-sm text-green-600 dark:text-green-400 text-center font-medium">
              {testResult}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-600 dark:text-green-400 text-center font-medium">
              Configuration saved successfully!
            </p>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTest}
              disabled={isTesting || isSaving || success || !apiKey.trim()}
              className="flex-1 py-3 px-4 rounded-lg border border-border bg-background text-foreground font-medium text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isTesting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Testing...
                </span>
              ) : (
                'Test Connection'
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isTesting || success || !apiKey.trim()}
              className="flex-1 py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : success ? (
                'Saved'
              ) : (
                'Save & Continue'
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            Need an API key? Get one at{' '}
            <a
              href="https://dashscope.aliyun.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Alibaba Cloud DashScope
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
