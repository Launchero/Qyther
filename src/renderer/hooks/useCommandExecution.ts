import { useState, useCallback, useEffect, useRef } from 'react';
import type { SearchResult } from '../components/ResultsList';
import { logInfo, logError } from '../utils/debugLogger';
import { motionDurationMs } from '../utils/motion';
import { getSystemCommandShell } from '../utils/systemCommands';

/** How long a row keeps its "executing" marker. It is a visual confirmation, so it reads the
 *  macro rung of the duration scale — the same token the collapse-flash gesture uses — and is
 *  therefore gone instantly under reduced motion instead of holding a spinner nobody can see. */
const EXECUTING_MARKER_DURATION = '--duration-500';

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
  const markerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (markerTimerRef.current) clearTimeout(markerTimerRef.current);
    };
  }, []);

  const execute = useCallback(
    async (result: SearchResult) => {
      logInfo('[useCommandExecution] Executing:', result);

      // Set executing state
      setExecutingId(result.id);

      try {
        // Calculator result: copy the answer to clipboard
        if (result.action === 'clipboard-copy') {
          const text = result.title.replace(/^=\s*/, '');
          await navigator.clipboard.writeText(text);
        }
        // System commands: execute shell command via command:execute
        else if (result.type === 'command' && result.metadata?.section === 'System Commands') {
          const shellCmd = getSystemCommandShell(result.id);
          if (shellCmd) {
            await window.electronAPI.command.execute(shellCmd);
            await window.electronAPI.window.hide();
          }
          // Info-only commands (like clipboard history) have no shell command — do nothing
        }
        // Built-in commands
        else if (result.type === 'command') {
          if (result.action === 'quit') {
            await window.electronAPI.quit();
          } else if (result.action === 'hide') {
            await window.electronAPI.window.hide();
          }
        }
        // URL results
        else if (result.type === 'url') {
          await window.electronAPI.url.open(result.action!);
          await window.electronAPI.window.hide();
        }
        // App results
        else if (result.type === 'app') {
          await window.electronAPI.file.open(result.action!);
          await window.electronAPI.window.hide();
        }
        // File results
        else if (result.type === 'file') {
          await window.electronAPI.file.open(result.action!);
          await window.electronAPI.window.hide();
        }

        // Notify caller of successful execution
        onExecuted?.(result);
      } catch (error) {
        logError('[useCommandExecution] Execution error:', error);
      } finally {
        // Clear executing state once its confirmation flash has run
        if (markerTimerRef.current) clearTimeout(markerTimerRef.current);
        markerTimerRef.current = setTimeout(
          () => setExecutingId(null),
          motionDurationMs(EXECUTING_MARKER_DURATION, 500),
        );
      }
    },
    [onExecuted],
  );

  return { executingId, execute };
}
