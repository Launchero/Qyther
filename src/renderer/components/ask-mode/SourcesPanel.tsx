import React from 'react';

interface SourcesPanelProps {
  sources: Array<{
    id: string;
    url: string;
    title: string;
    excerpt: string;
  }>;
}

export function SourcesPanel({ sources }: SourcesPanelProps) {
  return (
    <details className="sources-panel">
      <summary className="sources-panel-summary">
        <span>{sources.length} source{sources.length > 1 ? 's' : ''}</span>
      </summary>
      <ul className="sources-list">
        {sources.map((source, i) => (
          <li key={source.id || i} className="source-item">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
            >
              <span className="source-number">[{i + 1}]</span>
              <div className="source-info">
                <span className="source-title">{source.title}</span>
                {source.excerpt && (
                  <span className="source-excerpt">{source.excerpt.slice(0, 120)}...</span>
                )}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
