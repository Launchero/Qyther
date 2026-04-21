import React from 'react';
import { ResultsList, SearchResult } from './ResultsList';
import { AskModeExpanded } from './AskModeExpanded';
import { SearchEmptyState } from './SearchEmptyState';
import type { AttachedFile } from './ChatInputArea';
import type { RecentFile } from '@/hooks/useRecentFiles';
import type { SearchMode } from './SearchBar';

export interface CommandPaletteBodyProps {
  showResults: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (result: SearchResult) => void;
  executingId?: string | null;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  searchMode?: SearchMode;
  windowMode?: 'expanded' | 'compact' | 'custom';
  onRegisterSendMessage?: (fn: ((message?: string) => void) | null) => void;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  onAttachFile?: () => void;
  onAttachFolder?: () => void;
  onClearAttachments?: () => void;
  isFileSearchLoading?: boolean;
  fileSearchError?: string | null;
  recentFiles?: RecentFile[];
  onAskAboutFile?: (result: SearchResult) => void;
  onQuickAction?: (action: string) => void;
}

export function CommandPaletteBody({
  showResults,
  searchQuery,
  onSearchChange,
  results,
  selectedIndex,
  onSelect,
  onExecute,
  executingId,
  bodyRef,
  searchMode = 'file',
  windowMode = 'expanded',
  onRegisterSendMessage,
  attachedFiles = [],
  onRemoveFile,
  onAttachFile,
  onAttachFolder,
  onClearAttachments,
  isFileSearchLoading,
  fileSearchError,
  recentFiles = [],
  onQuickAction,
  onAskAboutFile,
}: CommandPaletteBodyProps) {
  // Show chat interface in expanded Ask mode
  if (searchMode === 'ai' && windowMode === 'expanded') {
    return (
      <div ref={bodyRef} className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card">
        <AskModeExpanded
          searchQuery={searchQuery}
          onSearchChange={(_q) => {}}
          onRegisterSendMessage={onRegisterSendMessage}
          attachedFiles={attachedFiles}
          onRemoveFile={onRemoveFile}
          onAttachFile={onAttachFile}
          onAttachFolder={onAttachFolder}
          onClearAttachments={onClearAttachments}
        />
      </div>
    );
  }

  // Show empty state with quick actions when no query (file mode)
  if (!searchQuery.trim() && searchMode !== 'ai') {
    return (
      <div ref={bodyRef} className="flex-1 min-h-0 overflow-hidden flex flex-col bg-card">
        <SearchEmptyState
          recentFiles={recentFiles}
          onOpenFile={(path) => {
            onExecute({
              id: `recent-${path}`,
              title: path.split(/[\\/]/).pop() || path,
              type: 'file',
              action: path,
            });
          }}
          onQuickAction={(action) => {
            onQuickAction?.(action);
          }}
        />
      </div>
    );
  }

  // Show results list for other modes
  if (!showResults) {
    return null;
  }

  return (
    <div
      ref={bodyRef}
      className="flex-1 min-h-0 overflow-hidden flex flex-col bg-card"
    >
      <ResultsList
        results={results}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        onExecute={onExecute}
        searchQuery={searchQuery}
        executingId={executingId || undefined}
        isFileSearchLoading={isFileSearchLoading}
        fileSearchError={fileSearchError}
        onAskAbout={onAskAboutFile}
      />
    </div>
  );
}

