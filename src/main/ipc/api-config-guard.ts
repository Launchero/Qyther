/**
 * `api-config:test` / `api-config:save` URL guard, enforced in the main process.
 *
 * Both channels take a whole `ApiConfig` from the renderer: `test` POSTs to
 * `<baseUrl>/chat/completions` with the supplied key and hands the first 100 characters of the
 * response back, and `save` persists the pair that every later chat request uses. So a renderer
 * that is being steered — Ask mode renders model-authored text, and a DevTools holder on the dev
 * CDP port is the same thing with more rights — can otherwise turn the main process into an
 * arbitrary internal-network probe and deliver the user's key to a host it chose.
 *
 * Deliberately Electron-free, like `command-guard.ts`, so the rule is testable on its own.
 *
 * What this does NOT do: it inspects the URL literal, not the address the name resolves to, so a
 * hostname that resolves to a link-local address still passes. Loopback and private ranges are
 * allowed on purpose — pointing the palette at a local OpenAI-compatible server (`http://localhost:11434/v1`)
 * is the main reason this field accepts a custom base URL at all.
 */

export type BaseUrlVerdict = { ok: true; url: URL } | { ok: false; reason: string };

/** Link-local and cloud-metadata literals. `169.254.169.254` is the AWS/Azure/GCP IMDS address. */
function isLinkLocalOrMetadata(host: string): boolean {
  if (host === 'metadata.google.internal') return true;

  const octets = /^(\d{1,3})\.(\d{1,3})\./.exec(host);
  if (octets && Number(octets[1]) === 169 && Number(octets[2]) === 254) return true;

  const v6 = host.toLowerCase();
  return /^fe[89ab]/.test(v6);
}

export function checkBaseUrl(raw: unknown): BaseUrlVerdict {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'baseUrl must be a non-empty string' };
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'baseUrl must be an absolute URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'baseUrl must be http or https' };
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return { ok: false, reason: 'baseUrl must not embed credentials' };
  }
  if (url.hostname.length === 0) {
    return { ok: false, reason: 'baseUrl must name a host' };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isLinkLocalOrMetadata(host)) {
    return { ok: false, reason: 'baseUrl may not point at a link-local or cloud-metadata address' };
  }

  return { ok: true, url };
}
