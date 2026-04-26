import { useState, useCallback } from 'react';
import type { SearchResult } from '../components/ResultsList';
import { logInfo, logError } from '../utils/debugLogger';

/**
 * Hook for managing command execution
 * Consolidates execution logic from App.tsx
 */
export function useCommandExecution({
  onExecuted,
}: {
  onExecuted?: (result: SearchResult) => void;
} = {}) {
  const [executingId, setExecutingId] = useState<string | null>(null);

  const execute = useCallback(
    async (result: SearchResult) => {
      logInfo('[useCommandExecution] Executing:', result);

      // Set executing state
      setExecutingId(result.id);

      try {
        if (result.type === 'command') {
          if (result.action === 'quit') {
            await window.electronAPI.quit();
          } else if (result.action === 'hide') {
            await window.electronAPI.window.hide();
          }
        } else if (result.type === 'url') {
          await window.electronAPI.url.open(result.action!);
          await window.electronAPI.window.hide();
        } else if (result.type === 'app') {
          // On Windows, just open the path
          await window.electronAPI.file.open(result.action!);
          await window.electronAPI.window.hide();
        } else if (result.type === 'file') {
          // Open file or folder
          await window.electronAPI.file.open(result.action!);
          await window.electronAPI.window.hide();
        }

        // Notify caller of successful execution
        onExecuted?.(result);
      } catch (error) {
        logError('[useCommandExecution] Execution error:', error);
      } finally {
        // Clear executing state after a delay
        setTimeout(() => setExecutingId(null), 500);
      }
    },
    [onExecuted],
  );

  return { executingId, execute };
}
