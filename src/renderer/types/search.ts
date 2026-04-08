/**
 * Search-related type definitions
 */

/**
 * Search configuration
 */
export interface SearchConfig {
  debounceMs: number;
  maxResults: number;
  cacheTtlMs: number;
}

/**
 * Search metadata
 */
export interface SearchMetadata {
  source: 'file' | 'app' | 'command' | 'url';
  confidence: number;
  timestamp: number;
}

/**
 * Fuzzy search result
 */
export interface FuzzyMatchResult {
  matches: boolean;
  score: number;
  matchedIndices?: number[];
}

/**
 * Search hook options
 */
export interface UseSearchOptions {
  enabled: boolean;
  debounceMs?: number;
  maxResults?: number;
}
