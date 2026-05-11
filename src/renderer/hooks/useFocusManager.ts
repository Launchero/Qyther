import { useCallback, useEffect, useRef } from 'react';
import type { SearchMode } from '../components/ModeTabs';

export interface FocusManagerConfig {
  searchMode: SearchMode;
  windowMode: 'compact' | 'expanded' | 'custom';
}

type InputRegistry = Map<string, React.RefObject<HTMLElement | null>>;

/**
 * Centralized focus manager for mode switching.
 *
 * Routes focus to the correct input element based on (searchMode, windowMode):
 * - file mode (any windowMode) -> "searchbar" input
 * - ai mode + expanded window -> "unified-command" textarea
 * - ai mode + compact/custom window -> "searchbar" input
 */
export function useFocusManager({ searchMode, windowMode }: FocusManagerConfig) {
  const registryRef = useRef<InputRegistry>(new Map());

  const registerInput = useCallback(
    (name: string, ref: React.RefObject<HTMLElement | null>) => {
      registryRef.current.set(name, ref);
      return () => {
        registryRef.current.delete(name);
      };
    },
    [],
  );

  const resolveTarget = useCallback((): string => {
    if (searchMode === 'ai' && windowMode === 'expanded') {
      return 'unified-command';
    }
    return 'searchbar';
  }, [searchMode, windowMode]);

  const focusInput = useCallback(() => {
    const targetName = resolveTarget();
    const ref = registryRef.current.get(targetName);
    if (ref?.current && document.contains(ref.current)) {
      ref.current.focus();
    }
  }, [resolveTarget]);

  // Auto-focus when mode or window mode changes
  useEffect(() => {
    requestAnimationFrame(() => {
      focusInput();
    });
  }, [searchMode, windowMode, focusInput]);

  return { registerInput, focusInput };
}
