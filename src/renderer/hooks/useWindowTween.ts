import { useEffect } from 'react';

/**
 * A lost `window:modeSettled` must not leave this pumping forever. Generous: main snaps its own
 * tween after 120 ms of silence, so a real transition is always bracketed well inside this.
 */
const PUMP_MAX_MS = 1000;

/**
 * The page clock for the window height tween.
 *
 * Main owns the curve and is the only writer of `setBounds`, but it cannot see when the
 * compositor presents a frame, so it used to pace the tween on a 16 ms timer of its own — a
 * cadence unrelated to vsync, which the frame sampler measured as 6 duplicate heights per
 * transition. This offers one report per animation frame, for exactly the span of one transition:
 * armed by the mode announcement main pushes before the tween, stopped by the settle it pushes
 * after the last write. Nothing here knows a height, so the renderer keeps no geometry of its own.
 */
export function useWindowTween(): void {
  useEffect(() => {
    let frame: number | null = null;
    let deadline = 0;

    const tick = (): void => {
      if (performance.now() >= deadline) {
        frame = null;
        return;
      }
      window.electronAPI.window.animationFrame();
      frame = requestAnimationFrame(tick);
    };

    const start = (): void => {
      deadline = performance.now() + PUMP_MAX_MS;
      if (frame === null) frame = requestAnimationFrame(tick);
    };

    const stop = (): void => {
      deadline = 0;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    };

    window.addEventListener('electron-window-mode-changed', start);
    window.addEventListener('electron-window-mode-settled', stop);
    return () => {
      window.removeEventListener('electron-window-mode-changed', start);
      window.removeEventListener('electron-window-mode-settled', stop);
      stop();
    };
  }, []);
}
