import React, { useState, useCallback } from 'react';

interface LicenseActivationProps {
  onActivated: () => void;
}

export function LicenseActivation({ onActivated }: LicenseActivationProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleActivate = useCallback(async () => {
    if (!licenseKey.trim()) {
      setError('Please enter a license key');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await window.electronAPI.license.verify(licenseKey.trim());

      if (response.success) {
        // Persist the license key
        localStorage.setItem('qyther_license_key', licenseKey.trim());
        setSuccess(true);
        setTimeout(onActivated, 1500);
      } else {
        setError(response.error || 'Invalid license key. Please check and try again.');
      }
    } catch {
      setError('Failed to validate license. Please try again.');
    } finally {
      setIsValidating(false);
    }
  }, [licenseKey, onActivated]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActivate();
    }
  }, [handleActivate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-[500px] rounded-xl border border-border/50 bg-card/95 shadow-2xl p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" fill="currentColor" className="text-primary" />
              <path d="M10 16L14 20L22 12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Activate Qyther</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your license key to unlock the app</p>
        </div>

        {/* License Key Input */}
        <div className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
              value={licenseKey}
              onChange={(e) => {
                setLicenseKey(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm font-mono tracking-wider placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              autoFocus
              disabled={isValidating || success}
            />
          </div>

          {/* Error / Success Messages */}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600 dark:text-green-400 text-center font-medium">
              License activated successfully!
            </p>
          )}

          {/* Activate Button */}
          <button
            onClick={handleActivate}
            disabled={isValidating || success || !licenseKey.trim()}
            className="w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isValidating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Validating...
              </span>
            ) : success ? (
              'Activated'
            ) : (
              'Activate License'
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            Don&apos;t have a license key?{' '}
            <a
              href="https://qyther.gumroad.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Purchase on Gumroad
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
