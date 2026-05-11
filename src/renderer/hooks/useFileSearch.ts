import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
/* eslint-disable @typescript-eslint/no-explicit-any -- Vite HMR type lacks .hot property */
import type { SearchResult } from '../components/ResultsList';
import { getFileTypeFromName } from '../utils/fileUtils';
import { logInfo, logError } from '../utils/debugLogger';

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
  excludeHidden?: boolean;
  excludeSystem?: boolean;
  includeMetadata?: boolean;
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

// Cleanup cache on Vite HMR
if (typeof import.meta !== 'undefined' && 'hot' in import.meta) {
  (import.meta as any).hot.dispose(() => {
    lruCache.clear();
  });
}

/**
 * Hook for file search with debouncing and caching
 */
export function useFileSearch(query: string, options: UseFileSearchOptions) {
  const { enabled, debounceMs = 300 } = options;
  
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [everythingStatus, setEverythingStatus] = useState<{ running: boolean; esExists: boolean; platformSupported: boolean } | null>(null);
  
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Check Everything status on mount
  useEffect(() => {
    window.electronAPI.file.getEverythingStatus()
      .then(status => {
        if (isMountedRef.current) {
          setEverythingStatus(status);
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setEverythingStatus({ running: false, esExists: false, platformSupported: false });
        }
      });
  }, []);


  // Note: IPC calls cannot be cancelled. The isMountedRef pattern prevents stale state updates.

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
          maxResults: options.maxResults ?? 50,
          excludeHidden: options.excludeHidden ?? true,
          excludeSystem: options.excludeSystem ?? true,
          includeMetadata: options.includeMetadata ?? true,
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
          logInfo(`[useFileSearch] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }, [options.maxResults, options.excludeHidden, options.excludeSystem, options.includeMetadata]);

  const searchFiles = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Check Everything status before searching
    if (everythingStatus && !everythingStatus.running) {
      if (!everythingStatus.platformSupported) {
        setError('File search is only available on Windows');
        setResults([]);
        setIsLoading(false);
        return;
      }
      if (!everythingStatus.esExists) {
        setError('es.exe not found. Please restart the application to download it.');
        setResults([]);
        setIsLoading(false);
        return;
      }
      setError('Everything application is not running. Please start Everything to use file search.');
      setResults([]);
      setIsLoading(false);
      return;
    }

    const trimmedQuery = searchQuery.trim().toLowerCase();
    
    // Check cache first (LRU automatically updates access time)
    const cached = lruCache.get(trimmedQuery);
    if (cached) {
      logInfo(`[useFileSearch] Cache hit for "${searchQuery}"`);
      setResults(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fileResults = await searchWithRetry(trimmedQuery);
      
      if (isMountedRef.current) {
        lruCache.set(trimmedQuery, fileResults);
        
        logInfo(`[useFileSearch] Found ${fileResults.length} results for "${searchQuery}"`);
        setResults(fileResults);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Search failed';
        logError('[useFileSearch] Search error:', errorMessage, err);
        setError(errorMessage);
        setResults([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [searchWithRetry, everythingStatus]);

  // Debounced search effect
  useEffect(() => {
    if (!enabled) {
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
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Debounce the search
    debounceTimeoutRef.current = setTimeout(() => {
      searchFiles(query);
    }, debounceMs);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, enabled, debounceMs, searchFiles]);

  const searchResults: SearchResult[] = useMemo(() => results.map((file, index) => {
    // Normalize folder detection: path ending with separator is always a folder
    const isFolder = file.isFolder || file.path.endsWith('\\') || file.path.endsWith('/');
    const fileType = getFileTypeFromName(file.name, isFolder);
    return ({
      id: `file-${index}-${file.path}`,
      title: file.name,
      subtitle: `${file.path}${file.size ? ` � ${file.size}` : ''}${file.dateModified ? ` � ${file.dateModified}` : ''}`,
      icon: isFolder ? '' : '📄',
      type: 'file',
      action: file.path,
      metadata: {
        path: file.path,
        isFolder,
        size: file.size,
        dateModified: file.dateModified,
        fileType,
      },
    });
  }), [results]);

  return {
    fileResults: searchResults,
    isLoading,
    error,
    clearError: () => setError(null),
    everythingStatus,
    // NEW optional fields for enhanced UI feedback (backward compatible)
    retry: () => {
      if (query && query.trim()) {
        searchFiles(query);
      }
    },
  };
}
