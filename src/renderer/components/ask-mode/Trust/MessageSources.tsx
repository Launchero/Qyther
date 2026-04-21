import React from 'react';
import { CitationSource, validateUrl, formatConfidenceScore, formatAccessedDate } from '../../../utils/citationFormatter';
import { SourceCard } from './SourceCard';
import { BooksIcon, WarningIcon } from '@phosphor-icons/react';

interface MessageSourcesProps {
  sources: CitationSource[];
  title?: string;
  onNavigate?: (url: string) => void;
}

export function MessageSources({ sources, title = 'Sources', onNavigate }: MessageSourcesProps) {
  const validSources = sources.filter(source => validateUrl(source.url));
  const invalidSources = sources.filter(source => !validateUrl(source.url));

  return (
    <div className="message-sources">
      <div className="sources-header">
        <BooksIcon className="sources-icon" />
        <h4 className="sources-title">{title}</h4>
        <span className="sources-count">{sources.length} sources</span>
      </div>
      
      <div className="sources-list">
        {sources.map((source, index) => (
          <SourceCard
            key={source.id || index}
            source={source}
            index={index + 1}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      
      {invalidSources.length > 0 && (
        <div className="sources-warning">
          <WarningIcon className="warning-icon" />
          <span>
            {invalidSources.length} source(s) have invalid URLs and cannot be navigated to
          </span>
        </div>
      )}
    </div>
  );
}
