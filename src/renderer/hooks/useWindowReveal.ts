import { useEffect, type RefObject } from 'react';
import { motionDurationMs } from '../utils/motion';

/** Applied imperatively and never through `className`: if React re-wrote it on a mode change
 *  the palette would re-reveal every time the window resized, including mid-typing. */
const REVEAL_CLASS = 'palette-revealing';

/** `--animate-palette-reveal` composes `--duration-150`; the guard adds one `--duration-100` of
 *  margin so the fallback can only arm once that fade has finished. Both rungs are read from the
 *  same tokens the CSS composes, so retiming the reveal cannot leave this guard stale. */
const REVEAL_DURATION_TOKEN = '--duration-150';
const REVEAL_MARGIN_TOKEN = '--duration-100';

/**
 * Play the surface reveal on first paint and on every subsequent Alt+Space summon.
 *
 * The window is frameless and transparent, so Win32 gives it no open animation of its own and
 * this card is the only surface that can animate. The restart is a DOM operation rather than
 * React state: a class removed and re-added across two commits paints one frame of
 * fully-visible palette before the fade begins, which reads as a blink.
 *
 * **The clock is `document.visibilitychange`, not `electron-window-shown`.** Main calls `show()`
 * and only then sends the IPC (`src/main/windows.ts:145-149`), so a reveal armed on that event
 * starts a round trip after the window is already on screen — measured as 4 sampled frames at
 * `opacity < 0.1` (34-67 ms) of an always-on-top palette the user can click but cannot see.
 * Visibility flips in the same frame the window appears, so the fade begins with it. The IPC
 * event stays as the fallback for a summon that does not change visibility state, but it must
 * not restart a fade that is already running: re-adding the class mid-animation resets opacity
 * to 0 and makes the slab *longer*, which is the defect this replaced.
 *
 * Hiding stays instant on purpose — a global-hotkey launcher that fades out feels laggy, and
 * delaying `window.hide()` would put the Alt+Space toggle path in a race with itself.
 */
export function useWindowReveal(surfaceRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let startedAt = 0;
    const fallbackGuardMs =
      motionDurationMs(REVEAL_DURATION_TOKEN, 150) + motionDurationMs(REVEAL_MARGIN_TOKEN, 100);

    const reveal = () => {
      startedAt = performance.now();
      surface.classList.remove(REVEAL_CLASS);
      void surface.offsetWidth; // flush the removal, otherwise re-adding restarts nothing
      surface.classList.add(REVEAL_CLASS);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') reveal();
    };

    /** Only re-arm if no visibility fade is in flight — see `fallbackGuardMs`. */
    const onShown = () => {
      if (performance.now() - startedAt > fallbackGuardMs) reveal();
    };

    // Child animations bubble `animationend` up here, so only clear our own.
    const clear = (event: AnimationEvent) => {
      if (event.target === surface) surface.classList.remove(REVEAL_CLASS);
    };

    reveal();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('electron-window-shown', onShown);
    surface.addEventListener('animationend', clear);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('electron-window-shown', onShown);
      surface.removeEventListener('animationend', clear);
    };
  }, [surfaceRef]);
}
