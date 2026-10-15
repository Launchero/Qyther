import { useState, useEffect, useMemo, useRef } from 'react';
import type { SearchMode } from '@/components/ModeTabs';

export interface Tip {
  id: string;
  text: string;
  modes: SearchMode[];
}

// Every tip below maps to a binding the code actually implements — hooks/useKeyboard.ts,
// components/ask-mode/UnifiedCommandBar.tsx, components/AskModeExpanded.tsx, App.tsx (theme)
// and src/main/shortcuts.ts (OS-level). Keys that have no handler are not advertised here
// and must not be added to the shortcuts dialog either.
const TIPS: Tip[] = [
  // General tips (all modes)
  { id: 'tab-cycle', text: 'Press Shift+Tab to cycle between File and AI modes', modes: [] },
  { id: 'arrows-navigate', text: 'Use arrow keys to navigate through results', modes: [] },
  { id: 'help', text: 'Press Ctrl+/ to open the full keyboard shortcut list', modes: [] },
  { id: 'esc-close', text: 'Press Esc to close a dialog, clear the search, or hide this window', modes: [] },
  { id: 'global-shortcut', text: 'Press Alt+Space from anywhere to open this launcher', modes: [] },
  { id: 'mode-toggle', text: 'Click the mode tabs to switch between File and AI', modes: [] },
  // File mode tips
  { id: 'ask-about', text: 'Press Ctrl+Shift+Enter to ask AI about the selected file', modes: ['file'] },
  // AI mode tips
  { id: 'send-message', text: 'Press Enter to send your message', modes: ['ai'] },
  { id: 'shift-enter', text: 'Press Shift+Enter for a new line in AI chat', modes: ['ai'] },
  { id: 'browser-mode', text: 'Press Ctrl+Shift+B to enable browser automation in AI mode', modes: ['ai'] },
];

const ROTATION_INTERVAL_MS = 4000;

export function useRotatingTips(searchMode: SearchMode, hasQuery: boolean) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const isHoveringRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const tips = useMemo(
    () => TIPS.filter((tip) => tip.modes.length === 0 || tip.modes.includes(searchMode)),
    [searchMode]
  );

  // Reset tip index when search mode changes to avoid out-of-bounds access
  useEffect(() => {
    setCurrentIndex(0);
  }, [searchMode]);

  // Pause conditions: has query, hovering, or no tips
  const isPaused = hasQuery || isHoveringRef.current || tips.length === 0;

  useEffect(() => {
    if (isPaused) {
      clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tips.length);
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(timerRef.current);
  }, [isPaused, tips.length]);

  const hoverHandlers = {
    onMouseEnter: () => {
      isHoveringRef.current = true;
    },
    onMouseLeave: () => {
      isHoveringRef.current = false;
    },
  };

  const currentTip = tips[currentIndex]?.text ?? '';

  return { currentTip, isPaused, hoverHandlers };
}
