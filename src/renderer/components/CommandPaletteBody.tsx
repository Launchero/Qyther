import React from 'react';
import { ResultsList, SearchResult } from './ResultsList';

export interface CommandPaletteBodyProps {
  showResults: boolean;
  searchQuery: string;
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (result: SearchResult) => void;
  executingId?: string | null;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}

export function CommandPaletteBody({
  showResults,
  searchQuery,
  results,
  selectedIndex,
  onSelect,
  onExecute,
  executingId,
  bodyRef,
}: CommandPaletteBodyProps) {
  if (!showResults) {
    return null;
  }

  return (
    <div ref={bodyRef} className="command-palette-body">
      <ResultsList
        results={results}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        onExecute={onExecute}
        searchQuery={searchQuery}
        executingId={executingId || undefined}
      />
    </div>
  );
}
