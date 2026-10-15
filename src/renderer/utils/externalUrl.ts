/**
 * Model-authored URLs are untrusted input: an `<a href>` with a `javascript:` or
 * `file:` scheme executes in this renderer, which holds the `command:execute` bridge.
 */
export function safeExternalUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}
