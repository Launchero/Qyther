import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResultItem } from './ResultItem';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/utils/motion';
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

/**
 * Maps `file:search`'s error string to the pair the empty state shows. Extracted to module
 * scope so the render body stays a single branch instead of a five-deep `if` ladder.
 */
function describeFileSearchError(error: string): { message: string; hint: string } {
  if (error.includes('Everything')) {
    return { message: 'No results found', hint: 'Everything app is not running. Start it to enable file search.' };
  }
  if (error.includes('es.exe') || error.includes('not found')) {
    return { message: 'No results found', hint: 'es.exe is missing. Restart the app to download it.' };
  }
  if (error.includes('Windows')) {
    return { message: 'No results found', hint: 'File search is only available on Windows' };
  }
  if (error.includes('timed out')) {
    return { message: 'Search timed out', hint: 'Try a more specific query' };
  }
  return { message: 'No results found', hint: 'File search unavailable' };
}

/** The one placeholder shape the list renders for "nothing to show", loading-error or not. */
function PlaceholderState({ message, hint, hintIsError = false }: { message: string; hint: string; hintIsError?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
      <p className={cn('text-xs mt-1', hintIsError ? 'text-destructive' : 'text-muted-foreground')}>{hint}</p>
    </div>
  );
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
          // The reduced-motion signal comes from the same token layer CSS does: a keyboard
          // sweep through the list scrolls smoothly until the OS asks for none.
          behavior: prefersReducedMotion() ? 'instant' : 'smooth',
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
        // Skeleton rows, not a spinner: the placeholder holds the shape of the list that is
        // about to arrive, so the swap does not move the surface. `.skeleton-row` + `.shimmer`
        // are styled in styles/globals.css — nothing here may restyle them.
        <div className="py-[var(--padding-block-section)]" role="status" aria-live="polite">
          <p className="px-4 text-xs text-muted-foreground">Searching files…</p>
          <div className="skeleton-row shimmer" />
          <div className="skeleton-row shimmer" />
          <div className="skeleton-row shimmer" />
        </div>
      );
    }

    if (fileSearchError) {
      const { message, hint } = describeFileSearchError(fileSearchError);
      return <PlaceholderState message={message} hint={hint} hintIsError />;
    }

    return <PlaceholderState message="No results found" hint="Try a different search term" />;
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
      {/* Screen reader announcement for results count */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {results.length === 0 
          ? 'No results found' 
          : `${results.length} result${results.length === 1 ? '' : 's'} found`}
      </div>
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
              "px-4 pt-[var(--padding-block-section)] pb-[var(--padding-block-row)]"
            )}>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[var(--tracking-label)]">
                {section.title}
              </span>
              <span className={cn(
                "text-xs font-medium",
                "px-[var(--gap-inline)] py-[var(--spacing-1)] rounded-sm",
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
          <div className="py-[var(--padding-block-row)]" role="status" aria-live="polite">
            <p className="sr-only">Searching files…</p>
            <div className="skeleton-row shimmer" />
          </div>
        )}

        {/* Inline error indicator (non-blocking) */}
        {fileSearchError && results.length > 0 && (
          <div className="flex items-center gap-[var(--gap-inline)] px-4 py-[var(--padding-block-row)]">
            <span className="text-xs text-destructive">File search unavailable</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
});
