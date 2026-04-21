import React from 'react';
import { CitationSource, validateUrl, formatConfidenceScore, formatAccessedDate } from '../../../utils/citationFormatter';
import { LinkIcon, StarIcon, ClockIcon } from '@phosphor-icons/react';

interface SourceCardProps {
  source: CitationSource;
  index: number;
  onNavigate?: (url: string) => void;
}

export function SourceCard({ source, index, onNavigate }: SourceCardProps) {
  const isValidUrl = validateUrl(source.url);
  const confidenceLabel = formatConfidenceScore(source.confidence);
  const accessedDate = formatAccessedDate(source.accessedAt);

  const handleClick = () => {
    if (isValidUrl && onNavigate) {
      onNavigate(source.url);
    } else if (isValidUrl) {
      window.open(source.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={`source-card ${isValidUrl ? 'clickable' : 'invalid'}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      aria-label={`Source ${index}: ${source.title}`}
    >
      <div className="source-card-header">
        <span className="source-index">[{index}]</span>
        <h4 className="source-title">{source.title}</h4>
      </div>
      
      <div className="source-card-content">
        <p className="source-excerpt">{source.excerpt}</p>
        
        <div className="source-card-meta">
          <a 
            href={isValidUrl ? source.url : undefined}
            className="source-url"
            onClick={(e) => {
              e.preventDefault();
              handleClick();
            }}
            rel="noopener noreferrer"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            {source.url}
          </a>
          
          {source.confidence && (
            <span className={`source-confidence confidence-${confidenceLabel.toLowerCase().replace(' ', '-')}`}>
              <StarIcon className="w-3.5 h-3.5" weight="fill" />
              {confidenceLabel} ({source.confidence}%)
            </span>
          )}
          
          {accessedDate && (
            <span className="source-accessed">
              <ClockIcon className="w-3.5 h-3.5" />
              Accessed {accessedDate}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
