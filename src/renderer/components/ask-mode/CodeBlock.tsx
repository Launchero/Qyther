import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  language: string;
  code: string;
  onCopy?: () => void;
  onApply?: () => void;
  className?: string;
}

const languageDotColors: Record<string, string> = {
  ts: 'ts',
  typescript: 'ts',
  js: 'js',
  javascript: 'js',
  py: 'py',
  python: 'py',
  rs: 'rs',
  rust: 'rs',
  go: 'go',
  css: 'css',
  html: 'html',
  json: 'json',
};

export function CodeBlock({ language, code, onCopy, onApply, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  };

  const dotClass = languageDotColors[language.toLowerCase()] || '';

  return (
    <div className={cn('code-block', className)}>
      <div className="code-block-header">
        <div className="code-block-lang">
          <span className={cn('code-block-lang-dot', dotClass)} />
          {language || 'code'}
        </div>
        <div className="code-block-actions">
          <button
            className="code-action-btn"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {onApply && (
            <button
              className="code-action-btn primary"
              onClick={onApply}
              aria-label="Apply code"
            >
              Apply
            </button>
          )}
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
