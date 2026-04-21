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
      
      // Cmd/Ctrl+Shift+M - Toggle MCP
      if (modifierKey && e.shiftKey && e.key === 'm') {
        e.preventDefault();
        onToggleMCP?.();
      }
      
      // Cmd/Ctrl+T - Open MCP Modal (or close if already open)
      if (modifierKey && e.key === 't') {
        e.preventDefault();
        if (isModalOpen && closeModal) {
          closeModal();
        } else {
          onOpenMCPModal?.();
        }
      }
      
      // Escape - Close modal (consume event to prevent global handler from firing)
      if (e.key === 'Escape' && isModalOpen && closeModal) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleMCP, onOpenMCPModal, isModalOpen, closeModal]);
}
