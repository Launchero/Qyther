import React from 'react';
import { ResultsList, SearchResult } from './ResultsList';
import { AskModePanel } from './AskModePanel';

export interface CommandPaletteBodyProps {
  showAskMode: boolean;
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
  showAskMode,
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
      {showAskMode ? (
        <AskModePanel initialQuery={searchQuery} />
      ) : (
        <ResultsList
          results={results}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          onExecute={onExecute}
          searchQuery={searchQuery}
          executingId={executingId || undefined}
        />
      )}
    </div>
  );
}
