/**
 * URL guard for model-supplied fetch targets, enforced in the main process before any socket opens.
 *
 * `checkFetchUrl` is the one rule module here: `fetchWebPage` calls it on the raw string and again on
 * the post-redirect URL, because following a redirect is exactly how an allowed literal turns into a
 * request for `http://169.254.169.254/latest/meta-data/`.
 *
 * This is a deliberate divergence from the design it is modelled on, which has no SSRF rule at all.
 * The reason is local, not theoretical: in this app the URL comes from model output, main is the only
 * process that can reach the network, and the host is a desktop with a real LAN — a router admin page,
 * a NAS admin UI and an Ollama server are all one fetch away and all answer to unauthenticated GETs.
 * Note the difference from `src/main/ipc/api-config-guard.ts`, which deliberately *allows* loopback:
 * a user pointing their palette at `http://localhost:11434/v1` is the feature, whereas a search result
 * naming `localhost` is never the feature.
 *
 * Deliberately Electron-free, like the two IPC guard modules, so the rule is testable on its own.
 */

type FetchUrlVerdict = { ok: true; url: URL } | { ok: false; reason: string };

/** Loopback, RFC1918, CGNAT, link-local and unique-local literals. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');

  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === 'metadata.google.internal' || h === 'metadata.goog') return true;
  if (h === '0.0.0.0' || h === '::') return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  const v6 = h.replace(/^\[|\]$/g, '');
  if (v6 === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  if (/^fe[89ab]/.test(v6)) return true;

  return false;
}

/** Repair the shapes a model actually emits: bare hosts, collapsed `https:/`, stray whitespace. */
export function normalizeFetchUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\/*$/i.test(trimmed)) return `${trimmed.replace(/:\/\/*$/, '')}://`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed.replace(/^(https?):\/(?!\/)/i, '$1://');
  return `https://${trimmed}`;
}

export function checkFetchUrl(raw: unknown): FetchUrlVerdict {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'url must be a non-empty string' };
  }
  if (raw.length > 2048) {
    return { ok: false, reason: 'url must be under 2048 characters' };
  }

  let url: URL;
  try {
    url = new URL(normalizeFetchUrl(raw));
  } catch {
    return { ok: false, reason: 'url must be an absolute http or https URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `url protocol ${url.protocol} is not allowed (http or https only)` };
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return { ok: false, reason: 'url must not embed credentials' };
  }
  if (url.hostname.length === 0) {
    return { ok: false, reason: 'url must name a host' };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, reason: 'url may not point at a loopback, private or link-local address' };
  }

  return { ok: true, url };
}