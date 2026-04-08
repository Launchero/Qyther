import React from 'react';

export interface ResultItemProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  isSelected: boolean;
  onClick: () => void;
  resultType?: 'app' | 'command' | 'url' | 'file';
  searchQuery?: string;
  isExecuting?: boolean;
}

// Highlight matched characters in text
function highlightMatches(text: string, query: string) {
  if (!query || query.trim().length === 0) return text;
  
  const escapedQuery = query.trim().toLowerCase();
  const lowerText = text.toLowerCase();
  const parts: (string | React.JSX.Element)[] = [];
  let lastIndex = 0;
  let searchIndex = 0;
  
  // Simple character-by-character matching
  for (let i = 0; i < text.length; i++) {
    if (searchIndex < escapedQuery.length && lowerText[i] === escapedQuery[searchIndex]) {
      // Add non-matched text before this character
      if (i > lastIndex) {
        parts.push(text.slice(lastIndex, i));
      }
      // Add matched character
      parts.push(
        <mark key={i} className="match-highlight">
          {text[i]}
        </mark>
      );
      lastIndex = i + 1;
      searchIndex++;
    }
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? <>{parts}</> : text;
}

export function ResultItem({ 
  title, 
  subtitle, 
  icon, 
  isSelected, 
  onClick,
  id,
  resultType,
  searchQuery,
  isExecuting
}: ResultItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      id={id}
      className={`result-item ${isSelected ? 'selected' : ''}`}
      data-type={resultType}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="option"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
    >
      {icon && (
        <div className="result-icon">
          <span>{icon}</span>
        </div>
      )}
      <div className="result-content">
        <div className="result-title">
          {searchQuery ? highlightMatches(title, searchQuery) : title}
        </div>
        {subtitle && (
          <div className="result-subtitle">
            {searchQuery && resultType === 'file' 
              ? highlightMatches(subtitle, searchQuery) 
              : subtitle}
          </div>
        )}
      </div>
      {isExecuting && (
        <div className="execution-indicator">
          <svg className="checkmark" viewBox="0 0 24 24">
            <circle 
              cx="12" 
              cy="12" 
              r="10"
              className="checkmark-circle"
            />
            <path 
              d="M8 12l3 3 5-5"
              className="checkmark-tick"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
