import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResultItem } from './ResultItem';
import { cn } from '@/lib/utils';
import { logDebug } from '../utils/debugLogger';

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
    section?: string;
    kind?: string;
    fileType?: string;
    shortcut?: string;
    [key: string]: unknown;
  };
}

export interface ResultsListProps {
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (result: SearchResult) => void;
  searchQuery?: string;
  executingId?: string;
  isFileSearchLoading?: boolean;
  fileSearchError?: string | null;
  onAskAbout?: (result: SearchResult) => void;
}

interface SectionGroup {
  title: string;
  results: SearchResult[];
}

function groupResultsBySection(results: SearchResult[]): SectionGroup[] {
  const sectionMap = new Map<string, SearchResult[]>();
  
  results.forEach(result => {
    const section = result.metadata?.section || 'Results';
    if (!sectionMap.has(section)) {
      sectionMap.set(section, []);
    }
    sectionMap.get(section)!.push(result);
  });
  
  return Array.from(sectionMap.entries()).map(([title, results]) => ({
    title,
    results,
  }));
}

export const ResultsList = React.memo(function ResultsList({ results, selectedIndex, onSelect, onExecute, searchQuery, executingId, isFileSearchLoading, fileSearchError, onAskAbout }: ResultsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Memoize grouped results to avoid recreation on every render
  const groupedResults = useMemo(() => groupResultsBySection(results), [results]);

  // Stable refs for callbacks
  const onSelectRef = useRef(onSelect);
  const onExecuteRef = useRef(onExecute);
  const onAskAboutRef = useRef(onAskAbout);
  const resultsRef = useRef(results);
  onSelectRef.current = onSelect;
  onExecuteRef.current = onExecute;
  onAskAboutRef.current = onAskAbout;
  resultsRef.current = results;

  // Stable callbacks using refs - never change between renders
  const handleItemClick = useCallback((index: number) => {
    onSelectRef.current(index);
    onExecuteRef.current(resultsRef.current[index]);
  }, []);

  const handleItemAskAbout = useCallback((index: number) => {
    onAskAboutRef.current?.(resultsRef.current[index]);
  }, []);

  // Memoize callback map to avoid creating new functions per item on every render
  const clickCallbacks = useMemo(() => {
    const map = new Map<number, () => void>();
    results.forEach((_, index) => {
      map.set(index, () => handleItemClick(index));
    });
    return map;
  }, [results, handleItemClick]);

  const askCallbacks = useMemo(() => {
    if (!onAskAbout) return null;
    const map = new Map<number, () => void>();
    results.forEach((_, index) => {
      map.set(index, () => handleItemAskAbout(index));
    });
    return map;
  }, [results, onAskAbout, handleItemAskAbout]);

  // Scroll selected item into view with RAF batching to avoid layout thrashing
  useEffect(() => {
    let rafId: number | null = null;
    
    if (selectedRef.current) {
      rafId = requestAnimationFrame(() => {
        selectedRef.current?.scrollIntoView({
          behavior: 'instant',
          block: 'nearest',
        });
      });
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [selectedIndex]);

  if (results.length === 0) {
    if (isFileSearchLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary mb-3" />
          <p className="text-muted-foreground text-sm">Searching files...</p>
        </div>
      );
    }

    if (fileSearchError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground text-sm">No results found</p>
          <p className="text-xs text-destructive/80 mt-1">File search unavailable</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">No results found</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
      </div>
    );
  }

  if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_SEARCH === 'true') {
    logDebug('[ResultsList] Grouped sections:', {
      sectionCount: groupedResults.length,
      sections: groupedResults.map(s => ({
        title: s.title,
        count: s.results.length,
        items: s.results.map(r => ({ id: r.id, title: r.title, type: r.type })),
      })),
    });
  }

  let globalIndex = 0;

  return (
    <ScrollArea className="flex-1 w-full">
      <div 
        ref={containerRef}
        className="flex flex-col"
        role="listbox"
        aria-activedescendant={results[selectedIndex]?.id}
        aria-label="Search results"
      >
        {groupedResults.map((section, sectionIndex) => (
          <React.Fragment key={section.title}>
            {/* Section Header */}
            <div className={cn(
              "flex items-center justify-between",
              "px-4 py-3 pb-2"
            )}>
              <span className="text-[var(--text-xs)] font-semibold text-muted-foreground uppercase tracking-wider">
                {section.title}
              </span>
              <span className={cn(
                "text-[var(--text-xs)] font-medium",
                "px-1.5 py-0.5 rounded-[var(--radius-sm)]",
                "bg-muted text-muted-foreground"
              )}>
                {section.results.length}
              </span>
            </div>

            {/* Results */}
            <div className="flex flex-col">
              {section.results.map((result, sectionResultIndex) => {
                const currentIndex = globalIndex + sectionResultIndex;
                const is_selected = currentIndex === selectedIndex;
                return (
                  <div
                    key={result.id}
                    ref={is_selected ? selectedRef : null}
                  >
                    <ResultItem
                      id={result.id}
                      title={result.title}
                      subtitle={result.subtitle}
                      icon={result.icon}
                      isSelected={is_selected}
                      onClick={clickCallbacks.get(currentIndex)!}
                      resultType={result.type}
                      searchQuery={searchQuery}
                      isExecuting={executingId === result.id}
                      metadata={result.metadata}
                      onAskAbout={askCallbacks?.get(currentIndex)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Section Divider */}
            {sectionIndex < groupedResults.length - 1 && (
              <div className="h-px bg-border my-0 mx-4" />
            )}

            {/* Increment global index for next section */}
            {(() => { globalIndex += section.results.length; return null; })()}
          </React.Fragment>
        ))}

        {/* Inline loading indicator (non-blocking) */}
        {isFileSearchLoading && (
          <div className="flex items-center gap-3 px-4 py-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <span className="text-xs">Searching files...</span>
          </div>
        )}

        {/* Inline error indicator (non-blocking) */}
        {fileSearchError && results.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2">
            <span className="text-xs text-destructive/80">File search unavailable</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
});
