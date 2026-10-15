import { useState, useMemo, useEffect } from 'react';
import type { SearchResult } from '../components/ResultsList';
import { fuzzyMatch, scoreMatch } from '../utils/fuzzySearch';

export function useSearch(allItems: SearchResult[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

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

  // Memoize the results key to avoid creating new string on every render
  const resultsKey = useMemo(() => results.map(r => r.id).join(','), [results]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [resultsKey]);

  // Add to search history when query changes (debounced)
  useEffect(() => {
    if (!searchQuery.trim()) return;
    
    const timer = setTimeout(() => {
      setSearchHistory(prev => {
        // Don't add duplicates
        if (prev[0] === searchQuery) return prev;
        // Keep last 20 searches
        return [searchQuery, ...prev.filter(q => q !== searchQuery)].slice(0, 20);
      });
      setHistoryIndex(-1);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Navigate search history
  const navigateHistory = (direction: 'up' | 'down') => {
    if (searchHistory.length === 0) return;

    if (direction === 'up') {
      const newIndex = historyIndex < searchHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      setSearchQuery(searchHistory[newIndex]);
    } else {
      const newIndex = historyIndex > 0 ? historyIndex - 1 : -1;
      setHistoryIndex(newIndex);
      setSearchQuery(newIndex === -1 ? '' : searchHistory[newIndex]);
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    results,
    selectedIndex,
    setSelectedIndex,
    searchHistory,
    navigateHistory,
  };
}
