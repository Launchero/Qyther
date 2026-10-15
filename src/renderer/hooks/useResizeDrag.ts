import { useCallback, useEffect, useRef, useState } from 'react';
import { logError } from '../utils/debugLogger';

/** Local floor only; main clamps authoritatively via `setMinimumSize`/`setMaximumSize`. */
const MIN_RESIZE_HEIGHT = 300;

function requestHeight(next: number): void {
  const clamped = Math.max(MIN_RESIZE_HEIGHT, next);
  window.electronAPI.window.resizeHeight(clamped).catch((err) => logError('[useResizeDrag] resizeHeight failed:', err));
}

/**
 * Bottom-edge drag resize for the expanded palette, at App level because `CommandPalette`'s
 * `overflow-hidden` would clip the handle.
 *
 * The listeners attach from an effect keyed on `isResizing` state, deliberately not on a ref:
 * the previous inline version guarded `if (!isResizingRef.current) return;` inside a `[]`-dep
 * effect, so it ran once at mount while the ref was still false and `mousemove`/`mouseup` were
 * never registered — which made `window:resizeHeight` unreachable from the UI and left main's
 * `setMaximumSize` ceiling with nothing to constrain.
 */
export function useResizeDrag(): { onResizeMouseDown: (event: React.MouseEvent) => void; resizeByKeyboard: (deltaPx: number) => void } {
  const [isResizing, setIsResizing] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  // `getHeight` is async, so a move that beats its answer must be ignored rather than resize
  // the window to the drag delta alone.
  const baseHeightReady = useRef(false);
  const pointerY = useRef<number | null>(null);
  const scheduled = useRef<number | null>(null);

  const onResizeMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    startY.current = event.clientY;
    baseHeightReady.current = false;
    window.electronAPI.window.getHeight()
      .then((height) => {
        startHeight.current = height;
        baseHeightReady.current = true;
      })
      .catch((err) => logError('[useResizeDrag] getHeight failed:', err));
    setIsResizing(true);
  }, []);

  const resizeByKeyboard = useCallback((deltaPx: number) => {
    window.electronAPI.window.getHeight()
      .then((height) => {
        requestHeight(height + deltaPx);
      })
      .catch((err) => logError('[useResizeDrag] getHeight failed:', err));
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const flush = () => {
      scheduled.current = null;
      const y = pointerY.current;
      if (y === null || !baseHeightReady.current) return;
      requestHeight(startHeight.current + (y - startY.current));
    };

    // One IPC per animation frame: a raw `mousemove` invoke would flood the bridge.
    const handleMouseMove = (event: MouseEvent) => {
      pointerY.current = event.clientY;
      if (scheduled.current !== null) return;
      scheduled.current = requestAnimationFrame(flush);
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (scheduled.current !== null) {
        cancelAnimationFrame(scheduled.current);
        scheduled.current = null;
      }
      pointerY.current = null;
    };
  }, [isResizing]);

  return { onResizeMouseDown, resizeByKeyboard };
}
