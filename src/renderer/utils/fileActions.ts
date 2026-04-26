import type { SearchResult } from '@/components/ResultsList';

export interface FileAction {
  id: string;
  label: string;
  shortcut: string[]; // Uses 'modifier' for OS-agnostic display
  handler: (result: SearchResult) => Promise<void> | void;
  enabled?: (result: SearchResult) => boolean;
}

export const FILE_ACTIONS: FileAction[] = [
  {
    id: 'open',
    label: 'Open file',
    shortcut: ['Enter'],
    handler: (result: SearchResult) => {
      if (result.action) {
        window.electronAPI.file.open(result.action).catch(console.error);
      }
    },
  },
  {
    id: 'ask-ai',
    label: 'Ask AI about file',
    shortcut: ['modifier', 'Shift', 'Enter'],
    handler: () => {
      // This is handled by onAskAbout callback in the parent
    },
    enabled: (result) => result.type === 'file' || result.type === 'app',
  },
  {
    id: 'copy-path',
    label: 'Copy path',
    shortcut: ['modifier', 'C'],
    handler: async (result: SearchResult) => {
      const path = result.metadata?.path || result.action || result.subtitle || '';
      if (path) {
        await navigator.clipboard.writeText(path);
      }
    },
  },
  {
    id: 'show-in-folder',
    label: 'Show in folder',
    shortcut: ['modifier', 'Shift', 'F'],
    handler: async (result: SearchResult) => {
      const path = result.metadata?.path || result.action || '';
      if (path) {
        await window.electronAPI.file.open(path).catch(console.error);
      }
    },
    enabled: (result) => result.type === 'file',
  },
];

export function getActionsForItem(result: SearchResult): FileAction[] {
  return FILE_ACTIONS.filter(action => action.enabled?.(result) ?? true);
}
