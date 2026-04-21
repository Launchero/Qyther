import { useState, useCallback, useEffect } from 'react';

export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

const STORAGE_KEY = 'recent-files';

function readRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentFile[];
  } catch {
    return [];
  }
}

function writeRecentFiles(files: RecentFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // localStorage full or unavailable
  }
}

export function useRecentFiles(maxFiles: number = 4): {
  recentFiles: RecentFile[];
  addRecentFile: (path: string, name: string) => void;
} {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => readRecentFiles());

  // Re-read from storage on mount to handle cross-tab sync
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setRecentFiles(readRecentFiles());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const addRecentFile = useCallback(
    (path: string, name: string) => {
      setRecentFiles((prev) => {
        // Remove existing entry with same path
        const filtered = prev.filter((f) => f.path !== path);
        // Prepend new entry
        const updated = [{ path, name, lastOpened: Date.now() }, ...filtered].slice(0, maxFiles);
        writeRecentFiles(updated);
        return updated;
      });
    },
    [maxFiles],
  );

  return { recentFiles, addRecentFile };
}
