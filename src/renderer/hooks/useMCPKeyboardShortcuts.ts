import { useEffect } from 'react';
import { usesMetaKey } from '@/utils/shortcuts';

interface UseMCPKeyboardShortcutsProps {
  onToggleMCP?: () => void;
  onOpenMCPModal?: () => void;
  isModalOpen?: boolean;
  closeModal?: () => void;
}

export function useMCPKeyboardShortcuts({ 
  onToggleMCP, 
  onOpenMCPModal,
  isModalOpen = false,
  closeModal,
}: UseMCPKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifierKey = usesMetaKey() ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl+Shift+M - Toggle MCP (Shift yields 'M', so compare case-insensitively)
      if (modifierKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        onToggleMCP?.();
      }

      // Cmd/Ctrl+T - Open MCP Modal (or close if already open).
      // Case-insensitive; require !shiftKey so Ctrl+Shift+T does not trigger.
      if (modifierKey && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (isModalOpen && closeModal) {
          closeModal();
        } else {
          onOpenMCPModal?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleMCP, onOpenMCPModal, isModalOpen, closeModal]);
}
