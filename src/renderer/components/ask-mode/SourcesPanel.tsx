import React from 'react';
import { safeExternalUrl } from '@/utils/externalUrl';

interface SourcesPanelProps {
  sources: Array<{
    id: string;
    url: string;
    title: string;
    excerpt: string;
  }>;
  onOpenSource?: (url: string) => void;
}

/** Hostname for provenance display. Null when the URL does not parse. */
function domainOf(href: string): string | null {
  try {
    return new URL(href).hostname;
  } catch {
    return null;
  }
}

/**
 * `onOpenSource` is optional because the app shell intercepts anchor clicks
 * (`App.tsx`); the guard here only decides whether a URL is linkable at all.
 */
export function SourcesPanel({ sources, onOpenSource }: SourcesPanelProps) {
  return (
    <details className="sources-panel">
      <summary className="sources-panel-summary">
        <span>{sources.length} source{sources.length > 1 ? 's' : ''}</span>
      </summary>
      <ul className="sources-list">
        {sources.map((source, i) => {
          const href = safeExternalUrl(source.url);
          const domain = href ? domainOf(href) : null;
          const excerpt = source.excerpt && source.excerpt.length > 120
            ? `${source.excerpt.slice(0, 120)}…`
            : source.excerpt;
          const body = (
            <>
              <span className="source-number">[{i + 1}]</span>
              <div className="source-info">
                <span className="source-title">{source.title}</span>
                {domain && <span className="source-domain">{domain}</span>}
                {excerpt && (
                  <span className="source-excerpt">{excerpt}</span>
                )}
              </div>
            </>
          );
          return (
            <li key={source.id || i} className="source-item">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-link"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenSource?.(href);
                  }}
                >
                  {body}
                </a>
              ) : (
                <div className="source-link">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
