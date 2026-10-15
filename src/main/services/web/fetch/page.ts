/**
 * The single network transport for `fetchWebPage`.
 *
 * Three behaviours here are contracts rather than preferences, because each one is the difference
 * between "the tool returns text" and "the tool returns text most of the time":
 * - UA rotation. A first request is a plausible browser; a bot-walled or error response rotates to the
 *   next agent and retries once. `curl` goes last, not first, because it invites exactly the 403.
 * - `Accept-Encoding: identity`. Compressed bodies have to be decoded before the charset sniff, and some
 *   reader endpoints corrupt their markdown stream under content encoding.
 * - the size cap is applied while streaming. Checking `content-length` after `arrayBuffer()` would be
 *   the check that arrives too late; this loop stops reading at the cap and flags the page truncated.
 */

import { checkFetchUrl } from '../url-guard';

/** 50 MiB. Above this a page is not a document the model can use, and the buffer is the real cost. */
const MAX_PAGE_BYTES = 50 * 1024 * 1024;

/** One retry for 429, and never longer than this wait, however long the server asks for. */
const MAX_RETRY_AFTER_MS = 10_000;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; TextBot/1.0)',
  'curl/8.0',
];

export class WebPageError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'WebPageError';
  }
}

interface LoadedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

/** Header charset first, then a `<meta charset>` sniff over the first 2 KiB, then UTF-8. */
function decodeBody(bytes: Uint8Array, contentType: string): string {
  const headerCharset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (headerCharset ?? metaCharset ?? 'utf-8').toLowerCase();

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function readCapped(response: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, truncated: bytes.length > MAX_PAGE_BYTES };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= MAX_PAGE_BYTES) { truncated = true; break; }
  }
  await reader.cancel().catch(() => undefined);

  const merged = new Uint8Array(Math.min(total, MAX_PAGE_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    merged.set(chunk.subarray(0, merged.length - offset), offset);
    offset += chunk.length;
  }

  return { bytes: merged, truncated };
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get('retry-after');
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(header);
  return Number.isNaN(date) ? 0 : Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

interface LoadOptions {
  signal?: AbortSignal;
  /** Extra request headers (`Accept: text/markdown` for negotiation). */
  headers?: Record<string, string>;
  referer?: string;
}

type Attempt =
  | { kind: 'ok'; page: LoadedPage }
  | { kind: 'retry'; waitMs: number }
  | { kind: 'rotate'; error: WebPageError }
  | { kind: 'fail'; error: WebPageError }
  | { kind: 'blocked'; error: WebPageError };

/** Statuses that mean "you were recognised as a bot" — the only ones worth retrying with another agent. */
const BOT_WALL_STATUSES = new Set([403, 503]);

/** One request with one agent. Decides, it does not decide-and-loop. */
async function attemptLoad(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
  userAgent: string,
): Promise<Attempt> {
  const response = await fetch(url.toString(), {
    redirect: 'follow',
    headers: { ...headers, 'User-Agent': userAgent },
    signal,
  });

  // A redirect is the classic way an allowed literal becomes an internal request; re-check where we landed.
  if (response.url) {
    const landed = checkFetchUrl(response.url);
    if (!landed.ok) return { kind: 'blocked', error: new WebPageError(`blocked redirect target: ${landed.reason}`) };
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const error = new WebPageError(`HTTP ${response.status}`, response.status);
    if (response.status === 429) return { kind: 'retry', waitMs: retryAfterMs(response) };
    // A 404 is a missing page, not a bot wall: rotating three agents to learn that three times is
    // three requests for a fact the first one already gave.
    return BOT_WALL_STATUSES.has(response.status) ? { kind: 'rotate', error } : { kind: 'fail', error };
  }

  const { bytes, truncated } = await readCapped(response);
  const contentType = response.headers.get('content-type') ?? '';
  return {
    kind: 'ok',
    page: {
      finalUrl: response.url || url.toString(),
      status: response.status,
      contentType,
      body: decodeBody(bytes, contentType),
      truncated,
    },
  };
}

/** Fetch a page through the guard. Throws `WebPageError`; never returns a non-2xx body. */
export async function loadPage(url: URL, options: LoadOptions = {}): Promise<LoadedPage> {
  const verdict = checkFetchUrl(url.toString());
  if (!verdict.ok) throw new WebPageError(`blocked URL: ${verdict.reason}`);

  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    ...options.headers,
  };
  if (options.referer) headers.Referer = options.referer;

  let lastError: WebPageError | undefined;

  for (const userAgent of USER_AGENTS) {
    const attempt = await attemptLoad(url, headers, options.signal, userAgent);
    if (attempt.kind === 'ok') return attempt.page;
    if (attempt.kind === 'blocked' || attempt.kind === 'fail') throw attempt.error;

    lastError = attempt.kind === 'rotate' ? attempt.error : new WebPageError('HTTP 429');
    if (attempt.kind === 'retry' && attempt.waitMs > 0) {
      await sleep(attempt.waitMs, options.signal);
      continue;
    }
  }

  throw lastError ?? new WebPageError('no usable response');
}