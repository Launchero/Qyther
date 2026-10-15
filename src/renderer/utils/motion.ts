import { logWarn } from './debugLogger';

/**
 * Read a duration token from `:root` the way CSS does.
 *
 * `prefers-reduced-motion` zeroes the whole `--duration-*` scale in `globals.css`, so a JS
 * animation knob that reads its duration here stops itself when the OS asks for reduced
 * motion — a media query in CSS cannot reach `setTimeout`, `scrollIntoView` or auto-animate.
 *
 * @param name Token name, e.g. `--duration-150`
 * @param fallback Used only when the token is missing, never when it is legitimately `0ms`.
 */
export function motionDurationMs(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ms = Number.parseFloat(raw);
  if (!Number.isFinite(ms)) {
    logWarn(`[motion] Missing duration token ${name}; using ${fallback}ms`);
    return fallback;
  }
  return ms;
}

/** The easing paired with a duration token. Returns a CSS `<easing-value>` string. */
export function motionEasing(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

/** Whether the OS asks for reduced motion, for APIs that take no duration at all. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
