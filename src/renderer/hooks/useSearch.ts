import { useState, useMemo, useEffect } from 'react';
import type { SearchResult } from '../components/ResultsList';

// Simple fuzzy search implementation
function fuzzyMatch(query: string, text: string): boolean {
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

// Score for ranking results
function scoreMatch(query: string, text: string): number {
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

export function useSearch(allItems: SearchResult[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter and sort results based on search query
  const results = useMemo(() => {
    if (!searchQuery.trim()) {
      // Return first 10 items when no search query
      return allItems.slice(0, 10);
    }

    const query = searchQuery.trim();
    
    // Filter items that match the query
    const matchingItems = allItems.filter(item => {
      const titleMatch = fuzzyMatch(query, item.title);
      const subtitleMatch = item.subtitle ? fuzzyMatch(query, item.subtitle) : false;
      return titleMatch || subtitleMatch;
    });

    // Sort by relevance score
    matchingItems.sort((a, b) => {
      const scoreA = Math.max(
        scoreMatch(query, a.title),
        a.subtitle ? scoreMatch(query, a.subtitle) : 0
      );
      const scoreB = Math.max(
        scoreMatch(query, b.title),
        b.subtitle ? scoreMatch(query, b.subtitle) : 0
      );
      return scoreB - scoreA;
    });

    // Limit to 20 results for performance
    return matchingItems.slice(0, 20);
  }, [searchQuery, allItems]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  return {
    searchQuery,
    setSearchQuery,
    results,
    selectedIndex,
    setSelectedIndex,
  };
}
