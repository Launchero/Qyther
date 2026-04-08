import React, { useRef, useEffect } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { ResultItem } from './ResultItem';

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  type: 'app' | 'command' | 'url' | 'file';
  action?: string;
  metadata?: {
    path?: string;
    isFolder?: boolean;
    size?: string;
    dateModified?: string;
    [key: string]: any;
  };
}

export interface ResultsListProps {
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (result: SearchResult) => void;
  searchQuery?: string;
  executingId?: string;
}

export function ResultsList({ results, selectedIndex, onSelect, onExecute, searchQuery, executingId }: ResultsListProps) {
  const [animationRef] = useAutoAnimate({
    duration: 200,
    easing: 'ease-in-out',
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Attach AutoAnimate to our container ref
  useEffect(() => {
    if (containerRef.current) {
      animationRef(containerRef.current);
    }
  }, [animationRef]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && containerRef.current) {
      const container = containerRef.current;
      const selected = selectedRef.current;
      
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      
      if (selectedRect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - selectedRect.top;
      } else if (selectedRect.bottom > containerRect.bottom) {
        container.scrollTop += selectedRect.bottom - containerRect.bottom;
      }
    }
  }, [selectedIndex]);

  if (results.length === 0) {
    return (
      <div className="results-empty">
        <div className="empty-icon">
          <span className="floating-emoji">🔍</span>
        </div>
        <p>No results found</p>
        <p className="empty-hint">Try a different search term</p>
      </div>
    );
  }

  return (
    <div 
      className="results-list" 
      ref={containerRef}
      role="listbox"
      aria-activedescendant={results[selectedIndex]?.id}
      aria-labelledby="search-input"
    >
      {results.map((result, index) => (
        <div
          key={result.id}
          ref={index === selectedIndex ? selectedRef : null}
        >
          <ResultItem
            id={result.id}
            title={result.title}
            subtitle={result.subtitle}
            icon={result.icon}
            isSelected={index === selectedIndex}
            onClick={() => {
              onSelect(index);
              onExecute(result);
            }}
            resultType={result.type}
            searchQuery={searchQuery}
            isExecuting={executingId === result.id}
          />
        </div>
      ))}
    </div>
  );
}
