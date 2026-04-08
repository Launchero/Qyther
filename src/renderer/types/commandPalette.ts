/**
 * Centralized type definitions for Command Palette
 * Re-exports from types.d.ts for better organization
 */

import type { WindowMode, FileSearchResult } from '../types.d';

export type { WindowMode, FileSearchResult };

/**
 * Search mode for command palette
 */
export type SearchMode = 'file' | 'ai' | 'code';

/**
 * Command Palette Configuration
 */
export interface CommandPaletteConfig {
  defaultMode: WindowMode;
  autoExpandOnQuery: boolean;
  maxResults: number;
}

/**
 * Execution Result
 */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  executionTime?: number;
}

/**
 * Keyboard Navigation Config
 */
export interface KeyboardNavConfig {
  pageSize: number;
  enableLooping: boolean;
}
