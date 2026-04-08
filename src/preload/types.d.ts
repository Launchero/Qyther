// File search result type
interface FileSearchResult {
  path: string;
  name: string;
  size?: string;
  dateModified?: string;
  isFolder: boolean;
}

// Window mode type
type WindowMode = 'compact' | 'expanded' | 'custom';

// Command execution result
interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

// Re-export ElectronAPI from renderer types to avoid duplication
// The complete definition is in src/renderer/types.d.ts
export type { ElectronAPI } from '../renderer/types';
