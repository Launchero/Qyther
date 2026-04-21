import { useState, useMemo, useEffect } from 'react';
import type { SearchResult } from '../components/ResultsList';
import { fuzzyMatch, scoreMatch } from '../utils/fuzzySearch';

export function useSearch(allItems: SearchResult[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter and sort results based on search query
  const results = useMemo(() => {
    if (!searchQuery.trim()) {
      return allItems.slice(0, 10);
    }

    const query = searchQuery.trim();
    
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
  }, [results.map(r => r.id).join(',')]);

  return {
    searchQuery,
    setSearchQuery,
    results,
    selectedIndex,
    setSelectedIndex,
  };
}
