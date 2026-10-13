/**
 * `command:execute` blocklist, enforced in the main process.
 *
 * The same four patterns have lived in `src/preload/preload.ts` since the handler
 * existed, but that layer is renderer-reachable: any direct `ipcRenderer.invoke`
 * — or any driver holding a DevTools `Runtime.evaluate` — skipped it and hit raw
 * `promisify(exec)` in `handlers.ts`. Keeping both layers on one list is what makes
 * the guard meaningful; this module is deliberately Electron-free so it is testable.
 *
 * `preload.ts` cannot import this: the sandboxed preload must not depend on
 * `src/main` (root `AGENTS.md`), so it keeps its own copy. Change one, change both.
 *
 * This narrows a bypass. It does not make the blocklist strong: `Remove-Item
 * -Recurse -Force`, aliases and encoded commands all pass through. Treat any exposed
 * CDP endpoint on this app as code execution as the logged-in user.
 */

/** The main-process list; keep byte-identical to the preload copy. */
export const DANGEROUS_COMMAND_PATTERNS = ['rm -rf', 'del /s', 'format', 'shutdown'];

export function isCommandSafe(command: unknown): boolean {
  if (typeof command !== 'string' || command.length === 0) return false;
  const lowered = command.toLowerCase();
  return !DANGEROUS_COMMAND_PATTERNS.some((pattern) => lowered.includes(pattern));
}
