/**
 * Fuzzy search utilities
 * Extracted from useSearch hook for reusability
 */

import type { SearchResult } from '../components/ResultsList';

/**
 * Simple fuzzy search implementation
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  
  // Simple substring match
  if (lowerText.includes(lowerQuery)) {
    return true;
  }
  
  // Fuzzy match
  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === lowerQuery.length;
}

/**
 * Score for ranking results
 */
export function scoreMatch(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  
  // Exact match gets highest score
  if (lowerText === lowerQuery) {
    return 100;
  }
  
  // Starts with query gets high score
  if (lowerText.startsWith(lowerQuery)) {
    return 50;
  }
  
  // Contains query
  if (lowerText.includes(lowerQuery)) {
    return 25;
  }
  
  // Fuzzy match
  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  
  if (queryIndex === lowerQuery.length) {
    return 10;
  }
  
  return 0;
}

/**
 * Calculate match score for a search result
 */
export function calculateResultScore(query: string, result: SearchResult): number {
  const titleScore = scoreMatch(query, result.title);
  const subtitleScore = result.subtitle ? scoreMatch(query, result.subtitle) : 0;
  return Math.max(titleScore, subtitleScore);
}

/**
 * Returns the character indices in text that match the query using fuzzy matching.
 * Uses the same greedy left-to-right algorithm as fuzzyMatch for consistency.
 */
export function getFuzzyMatchIndices(query: string, text: string): number[] {
  if (!query || query.trim().length === 0 || !text) return [];

  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // Check substring first for exact match (all chars match contiguously)
  const substringIndex = lowerText.indexOf(lowerQuery);
  if (substringIndex !== -1) {
    return Array.from({ length: lowerQuery.length }, (_, i) => substringIndex + i);
  }

  // Fuzzy match: greedy left-to-right
  const indices: number[] = [];
  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      indices.push(i);
      queryIndex++;
    }
  }

  return queryIndex === lowerQuery.length ? indices : [];
}

/**
 * Test helper: Create mock search result
 */
export function createMockSearchResult(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: 'test-1',
    title: 'Test',
    type: 'command',
    ...overrides,
  };
}

/**
 * Test helper: Create multiple mock search results
 */
export function createMockSearchResults(count: number, baseOverrides: Partial<SearchResult> = {}): SearchResult[] {
  return Array.from({ length: count }, (_, i) => 
    createMockSearchResult({
      ...baseOverrides,
      id: `test-${i}`,
      title: baseOverrides.title || `Test Result ${i + 1}`,
    })
  );
}
