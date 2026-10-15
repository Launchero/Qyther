import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy?.();
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
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
          {/* `secondary`/`default` carry their own background AND foreground, which a code
              plate needs: the header is `--color-code-header` in both themes, so a variant
              that inherited text colour would land near-black on a dark plate in light mode. */}
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={handleCopy}
            aria-label="Copy code"
            title="Copy code to clipboard"
          >
            {copied ? <span role="status" aria-live="polite">Copied!</span> : 'Copy'}
          </Button>
          {onApply && (
            <Button
              type="button"
              variant="default"
              size="xs"
              onClick={onApply}
              aria-label="Apply code"
              title="Apply this code"
            >
              Apply
            </Button>
          )}
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
