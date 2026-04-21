import { useState, useEffect, useMemo, useRef } from 'react';
import type { SearchMode } from '@/components/SearchBar';

export interface Tip {
  id: string;
  text: string;
  modes: SearchMode[];
}

const TIPS: Tip[] = [
  // General tips (all modes)
  { id: 'tab-cycle', text: 'Press Tab to cycle between File and AI modes', modes: [] },
  { id: 'arrows-navigate', text: 'Use arrow keys to navigate through results', modes: [] },
  { id: 'esc-close', text: 'Press Esc to close this window', modes: [] },
  { id: 'global-shortcut', text: 'Press Alt+Space from anywhere to open this launcher', modes: [] },
  { id: 'mode-toggle', text: 'Click the mode tabs to switch between File and AI', modes: [] },
  // File mode tips
  { id: 'open-panel', text: 'Press right arrow to open a file in the side panel', modes: ['file'] },
  { id: 'terminal', text: 'Press Ctrl+Shift to open the selected file in terminal', modes: ['file'] },
  // AI mode tips
  { id: 'shift-enter', text: 'Press Shift+Enter for a new line in AI chat', modes: ['ai'] },
  { id: 'browser-mode', text: 'Press Ctrl+B to enable browser automation in AI mode', modes: ['ai'] },
  { id: 'send-message', text: 'Press Enter to send your message', modes: ['ai'] },
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
