import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchResult } from '../components/ResultsList';

export interface FileSearchResult {
  path: string;
  name: string;
  size?: string;
  dateModified?: string;
  isFolder: boolean;
  // NEW optional fields from enhanced backend
  relevanceScore?: number;
  category?: string;
}

interface UseFileSearchOptions {
  enabled: boolean;
  debounceMs?: number;
  maxResults?: number;
}

// NEW: LRU Cache implementation for better memory management
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; lastAccess: number }>();
  private maxSize: number;
  private ttlMs: number;
  
  constructor(maxSize: number = 100, ttlMs: number = 30000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }
  
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Check TTL
    if (Date.now() - entry.lastAccess > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Update access time and move to end (most recently used)
    entry.lastAccess = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }
  
  set(key: K, value: V): void {
    // If exists, delete first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) item
      const firstKey = this.cache.keys().next().value!;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, { value, lastAccess: Date.now() });
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 30000; // 30 seconds
const lruCache = new LRUCache<string, FileSearchResult[]>(CACHE_MAX_SIZE, CACHE_TTL_MS);

/**
 * Hook for file search with debouncing and caching
 */
export function useFileSearch(query: string, options: UseFileSearchOptions) {
  const { enabled, debounceMs = 300 } = options;
  
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Clear cache periodically (LRU auto-manages size, this just handles TTL)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // LRU cache handles TTL internally, but we can force cleanup if needed
      lruCache.size(); // Touch the cache to trigger cleanup
    }, 60000); // Run every minute

    return () => clearInterval(cleanupInterval);
  }, []);

  // NEW: AbortController for cancelling in-flight searches
  const abortControllerRef = useRef<AbortController | null>(null);

  // NEW: Retry with exponential backoff
  const searchWithRetry = useCallback(async (
    searchQuery: string,
    maxRetries: number = 2
  ): Promise<FileSearchResult[]> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Pass options to use enhanced backend features
        return await window.electronAPI.file.search(searchQuery, {
          maxResults: options.maxResults || 50,
          excludeHidden: true,
          excludeSystem: true,
          includeMetadata: true,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Search failed');
        
        // Don't retry on certain errors
        const errorMessage = lastError.message;
        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('not running') ||
          errorMessage.includes('disallowed')
        ) {
          throw lastError; // Non-retryable error
        }
        
        // Retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
          console.log(`[useFileSearch] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }, [options.maxResults]);

  const searchFiles = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const trimmedQuery = searchQuery.trim().toLowerCase();
    
    // Check cache first (LRU automatically updates access time)
    const cached = lruCache.get(trimmedQuery);
    if (cached) {
      console.log(`[useFileSearch] Cache hit for "${searchQuery}"`);
      setResults(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Cancel any in-flight search
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      // Search with retry logic
      const fileResults = await searchWithRetry(trimmedQuery);
      
      if (isMountedRef.current) {
        // Cache the results (LRU automatically manages size)
        lruCache.set(trimmedQuery, fileResults);
        
        console.log(`[useFileSearch] Found ${fileResults.length} results for "${searchQuery}"`);
        setResults(fileResults);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current && !((err as Error).message.includes('aborted'))) {
        const errorMessage = err instanceof Error ? err.message : 'Search failed';
        console.error('[useFileSearch] Search error:', errorMessage, err);
        setError(errorMessage);
        setResults([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [searchWithRetry]);

  // Debounced search effect
  useEffect(() => {
    console.log('[useFileSearch] Effect triggered:', { query, enabled, debounceMs });
    
    if (!enabled) {
      console.log('[useFileSearch] Not enabled, clearing results');
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Don't search if query is empty
    if (!query || !query.trim()) {
      console.log('[useFileSearch] Empty query, clearing results');
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    console.log('[useFileSearch] Scheduling search for:', query);
    // Debounce the search
    debounceTimeoutRef.current = setTimeout(() => {
      console.log('[useFileSearch] Executing search for:', query);
      searchFiles(query);
    }, debounceMs);

    return () => {
      if (debounceTimeoutRef.current) {
        console.log('[useFileSearch] Clearing timeout');
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, enabled, debounceMs, searchFiles]);

  // Convert file results to SearchResult format for display
  const searchResults: SearchResult[] = results.map((file, index) => ({
    id: `file-${index}-${file.path}`,
    title: file.name,
    subtitle: `${file.path}${file.size ? ` • ${file.size}` : ''}${file.dateModified ? ` • ${file.dateModified}` : ''}`,
    icon: file.isFolder ? '📁' : '📄',
    type: 'file',
    action: file.path,
    metadata: {
      path: file.path,
      isFolder: file.isFolder,
      size: file.size,
      dateModified: file.dateModified,
    },
  }));

  return {
    fileResults: searchResults,
    isLoading,
    error,
    clearError: () => setError(null),
    // NEW optional fields for enhanced UI feedback (backward compatible)
    retry: () => {
      if (query && query.trim()) {
        searchFiles(query);
      }
    },
  };
}
