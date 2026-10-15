import type { SearchResult } from '@/components/ResultsList';
import { logError } from './debugLogger';

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
    label: 'Open',
    shortcut: ['Enter'],
    handler: (result: SearchResult) => {
      if (result.action) {
        window.electronAPI.file.open(result.action).catch((e) => logError('[fileActions] open failed:', e));
      }
    },
    enabled: (result) => result.type === 'file' || result.type === 'app',
  },
  {
    id: 'execute',
    label: 'Run command',
    shortcut: ['Enter'],
    handler: () => {
      // Routed to onExecute by ActionPanel — the panel owns the execute callback.
    },
    enabled: (result) => result.type === 'command' && result.id !== 'calc-result',
  },
  {
    id: 'ask-ai',
    label: 'Ask AI about this file',
    shortcut: ['modifier', 'Shift', 'Enter'],
    handler: () => {
      // Handled by onAskAbout callback in the parent — the panel closes and
      // the parent wires the file attachment + mode switch.
    },
    enabled: (result) => result.type === 'file',
  },
  {
    id: 'copy-path',
    label: 'Copy path',
    shortcut: ['modifier', 'Shift', 'C'],
    handler: async (result: SearchResult) => {
      const path = result.metadata?.path || result.action || result.subtitle || '';
      if (path) {
        await navigator.clipboard.writeText(path);
      }
    },
    enabled: (result) => result.type === 'file' || result.type === 'app',
  },
  {
    id: 'copy-url',
    label: 'Copy URL',
    shortcut: ['modifier', 'Shift', 'C'],
    handler: async (result: SearchResult) => {
      const url = result.action || result.subtitle || '';
      if (url) {
        await navigator.clipboard.writeText(url);
      }
    },
    enabled: (result) => result.type === 'url',
  },
  {
    id: 'open-url',
    label: 'Open URL',
    shortcut: ['Enter'],
    handler: async (result: SearchResult) => {
      if (result.action) {
        await window.electronAPI.url.open(result.action).catch((e) => logError('[fileActions] url.open failed:', e));
      }
    },
    enabled: (result) => result.type === 'url',
  },
  {
    id: 'reveal-in-folder',
    label: 'Open containing folder',
    shortcut: ['modifier', 'Shift', 'F'],
    handler: async (result: SearchResult) => {
      const path = result.metadata?.path || result.action || '';
      if (path) {
        await window.electronAPI.file.revealInFolder(path).catch((e) => logError('[fileActions] revealInFolder failed:', e));
      }
    },
    enabled: (result) => result.type === 'file' || result.type === 'app',
  },
  {
    id: 'copy-name',
    label: 'Copy name',
    shortcut: ['modifier', 'Shift', 'C'],
    handler: async (result: SearchResult) => {
      if (result.title) {
        await navigator.clipboard.writeText(result.title);
      }
    },
    enabled: (result) => result.type === 'command' && result.id !== 'calc-result',
  },
  {
    id: 'copy-result',
    label: 'Copy result',
    shortcut: ['modifier', 'Shift', 'C'],
    handler: async (result: SearchResult) => {
      const answer = result.title.replace(/^=\s*/, '');
      if (answer) {
        await navigator.clipboard.writeText(answer);
      }
    },
    enabled: (result) => result.id === 'calc-result',
  },
];

export function getActionsForItem(result: SearchResult): FileAction[] {
  return FILE_ACTIONS.filter(action => action.enabled?.(result) ?? true);
}
