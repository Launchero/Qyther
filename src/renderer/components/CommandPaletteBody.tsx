import React from 'react';
import { ResultsList, SearchResult } from './ResultsList';
import { AskModeExpanded } from './AskModeExpanded';
import { SearchEmptyState } from './SearchEmptyState';
import type { AttachedFile } from '@/types/ask-types';
import type { RecentFile } from '@/hooks/useRecentFiles';
import type { SearchMode } from './ModeTabs';
import type { RegisterInputFn } from './CommandPaletteHeader';

interface CommandPaletteBodyProps {
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
  onAddFile?: (file: AttachedFile) => void;
  isFileSearchLoading?: boolean;
  fileSearchError?: string | null;
  recentFiles?: RecentFile[];
  onAskAboutFile?: (result: SearchResult) => void;
  onQuickAction?: (action: string) => void;
  mcpCount?: number;
  registerInput?: RegisterInputFn;
}

function CommandPaletteBodyImpl({
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
  onAddFile,
  isFileSearchLoading,
  fileSearchError,
  recentFiles = [],
  onQuickAction,
  onAskAboutFile,
  mcpCount = 0,
  registerInput,
}: CommandPaletteBodyProps) {
  // Show chat interface in expanded Ask mode
  if (searchMode === 'ai' && windowMode === 'expanded') {
    return (
      <div ref={bodyRef} className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card">
        <AskModeExpanded
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onRegisterSendMessage={onRegisterSendMessage}
          attachedFiles={attachedFiles}
          onRemoveFile={onRemoveFile}
          onAttachFile={onAttachFile}
          onAttachFolder={onAttachFolder}
          onClearAttachments={onClearAttachments}
          onAddFile={onAddFile}
          mcpCount={mcpCount}
          recentSearchResults={results.filter(r => r.type === 'file').slice(0, 3).map(r => ({ title: r.title, type: r.type }))}
          registerInput={registerInput}
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

const MemoizedCommandPaletteBody = React.memo(CommandPaletteBodyImpl, (prev, next) => {
  return (
    prev.results === next.results &&
    prev.selectedIndex === next.selectedIndex &&
    prev.searchQuery === next.searchQuery &&
    prev.showResults === next.showResults &&
    prev.executingId === next.executingId &&
    prev.searchMode === next.searchMode &&
    prev.windowMode === next.windowMode &&
    prev.isFileSearchLoading === next.isFileSearchLoading &&
    prev.fileSearchError === next.fileSearchError &&
    prev.attachedFiles === next.attachedFiles &&
    prev.recentFiles === next.recentFiles &&
    prev.bodyRef === next.bodyRef &&
    prev.onSearchChange === next.onSearchChange &&
    prev.onSelect === next.onSelect &&
    prev.onExecute === next.onExecute &&
    prev.onAskAboutFile === next.onAskAboutFile &&
    prev.onClearAttachments === next.onClearAttachments &&
    prev.onAddFile === next.onAddFile
  );
});

export { MemoizedCommandPaletteBody as CommandPaletteBody };
export type { CommandPaletteBodyProps };