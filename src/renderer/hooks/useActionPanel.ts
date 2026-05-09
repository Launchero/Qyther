import { useState, useCallback, useMemo } from 'react';
import type { SearchResult } from '@/components/ResultsList';
import { getActionsForItem, type FileAction } from '@/utils/fileActions';

export function useActionPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions = useMemo(() => {
    if (!selectedItem) return [];
    return getActionsForItem(selectedItem);
  }, [selectedItem]);

  const open = useCallback((result: SearchResult) => {
    setSelectedItem(result);
    setSelectedIndex(0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedItem(null);
    setSelectedIndex(0);
  }, []);

  const toggle = useCallback((result?: SearchResult) => {
    if (isOpen) {
      close();
    } else if (result) {
      open(result);
    }
  }, [isOpen, close, open]);

  const executeAction = useCallback(async (action: FileAction) => {
    if (!selectedItem) return;
    await action.handler(selectedItem);
    close();
  }, [selectedItem, close]);

  return {
    isOpen,
    selectedItem,
    actions,
    selectedIndex,
    setSelectedIndex,
    open,
    close,
    toggle,
    executeAction,
  };
}
