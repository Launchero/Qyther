import React from 'react';
import { ResultsList, SearchResult } from './ResultsList';
import { AskModeExpanded } from './AskModeExpanded';

export interface CommandPaletteBodyProps {
  showResults: boolean;
  searchQuery: string;
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (result: SearchResult) => void;
  executingId?: string | null;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  searchMode?: 'file' | 'ai' | 'code';
  windowMode?: 'expanded' | 'compact' | 'custom';
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
  searchMode = 'file',
  windowMode = 'expanded',
}: CommandPaletteBodyProps) {
  if (!showResults) {
    return null;
  }

  // Show chat interface in expanded Ask mode
  if (searchMode === 'ai' && windowMode === 'expanded') {
    return (
      <div ref={bodyRef} className="command-palette-body chat-mode">
        <AskModeExpanded />
      </div>
    );
  }

  // Show results list for other modes
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
