/**
 * Path and query validation for the `file:*` channels, enforced in the main process.
 *
 * `preload.ts` has carried a metacharacter blocklist for `file:search` since the channel existed,
 * but that layer is renderer-reachable: any direct `ipcRenderer.invoke` — or any driver holding a
 * DevTools `Runtime.evaluate` on the debug port — skipped it and handed the raw string to the
 * `es.exe` invocation. `file:revealInFolder` had no check at either layer. Both now consult this
 * module, so the rule exists once and cannot be stepped around by choosing a different entry point.
 *
 * Deliberately Electron-free and pure, like `command-guard.ts`, so it is testable on its own.
 * `preload.ts` cannot import it (the sandboxed preload must not depend on `src/main`), so preload
 * keeps its own copy of the pattern list — change one, change both.
 *
 * This narrows a bypass. It is not a containment guarantee: an accepted path can still be anywhere
 * on any drive, because the palette's job is opening whatever the user searched for.
 */

/** Shell metacharacters. Kept byte-identical to the `preload.ts` copy. */
export const SEARCH_QUERY_METACHARACTERS = ['&&', '||', ';', '|', '&', '>', '<', '^'];

/** Ceiling on a search query, so a huge string cannot become a huge command line. */
export const MAX_SEARCH_QUERY_LENGTH = 500;

/** Ceiling on a path, matching what `file:open` has always allowed. */
export const MAX_PATH_LENGTH = 1000;

export function isSafeSearchQuery(query: unknown): query is string {
  if (typeof query !== 'string' || query.length === 0) return false;
  if (query.length > MAX_SEARCH_QUERY_LENGTH) return false;
  if (query.includes('\0')) return false;
  return !SEARCH_QUERY_METACHARACTERS.some((pattern) => query.includes(pattern));
}

export function isUsablePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.length > MAX_PATH_LENGTH) return false;
  // An embedded NUL truncates the string on the Win32 side, which makes the rest unvalidated.
  if (path.includes('\0')) return false;
  // Reject interior escapes that could re-point a UNC-ish string, while allowing a real UNC prefix.
  if (path.includes('\\\\') && !path.startsWith('\\\\')) return false;
  return true;
}
