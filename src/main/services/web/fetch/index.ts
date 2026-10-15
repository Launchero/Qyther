/**
 * URL to readable text: the pipeline, in order.
 *
 * Order is the contract, and every step exists because the step before it is unreliable for some site:
 *  1. `<url>.md` — the llms.txt convention. Free, exact, and the reason a docs site beats a scrape.
 *  2. `Accept: text/markdown` negotiation on the URL itself — same idea, served by content type.
 *  3. content-type dispatch for what comes back: JSON is pretty-printed, other text passes through,
 *     HTML goes to step 4.
 *  4. the reader chain for HTML (`reader.ts`), falling back to the raw HTML when every reader declines.
 *
 * Two budgets are applied at the end and they are not the same thing: a 500k hard cut so a pathological
 * page cannot occupy the process, then the caller's `maxChars` so the model gets a head it can hold.
 */

import { collapseWhitespace } from '../html';
import { checkFetchUrl, normalizeFetchUrl } from '../url-guard';
import { createLogger } from '../../../utils/logger';
import { withTimeout } from '../abort';
import { loadPage, WebPageError } from './page';
import { renderHtml } from './reader';
import type { FetchOptions, FetchPage, FetchMethod } from '../types';

const log = createLogger('Search');

/** Absolute ceiling on a rendered page, before the caller's budget. */
export const MAX_RENDERED_CHARS = 500_000;

/** The default model head. A page larger than this is truncated, not silently paged. */
export const DEFAULT_MAX_FETCH_CHARS = 12_000;

/**
 * Whole-pipeline budget. `loadPage` has no timeout of its own — a server that trickles one byte per
 * second would otherwise hold the Ask turn open until the graph's own 120s clock kills it.
 */
const FETCH_TIMEOUT_MS = 30_000;

/** Below this a "markdown" response is an error page, not content. */
const MIN_MARKDOWN_CHARS = 100;

function finalize(text: string, maxChars: number): { text: string; truncated: boolean } {
  const collapsed = collapseWhitespace(text);
  const hardCut = collapsed.slice(0, MAX_RENDERED_CHARS);
  return {
    text: hardCut.slice(0, maxChars),
    truncated: hardCut.length > maxChars || collapsed.length > MAX_RENDERED_CHARS,
  };
}

function buildPage(
  url: string,
  finalUrl: string,
  contentType: string,
  method: FetchMethod,
  text: string,
  options: FetchOptions,
  notes: string[] = [],
): FetchPage {
  const { text: clipped, truncated } = finalize(text, options.maxChars ?? DEFAULT_MAX_FETCH_CHARS);
  return {
    url,
    finalUrl,
    contentType,
    method,
    text: clipped,
    truncated,
    notes: truncated ? [...notes, 'output was truncated'] : notes,
  };
}

/** Step 1: the llms.txt-style markdown sibling. A miss is normal and silent. */
async function tryUrlMarkdown(url: URL, options: FetchOptions): Promise<FetchPage | null> {
  try {
    const page = await loadPage(new URL(url.toString() + '.md'), { signal: options.signal });
    if (isHtml(page.contentType) || page.body.trim().length < MIN_MARKDOWN_CHARS) return null;
    return buildPage(url.toString(), page.finalUrl, page.contentType, 'url-md', page.body, options);
  } catch (error) {
    // A 404 here is the expected miss, but an abort is not: swallowing it would let the pipeline
    // continue on a dead signal, and every later fetch would wait for an abort that already fired.
    if (options.signal?.aborted) throw error;
    return null;
  }
}

function isHtml(contentType: string): boolean {
  return /^text\/html/i.test(contentType) || contentType.trim() === '';
}

async function resolveContentType(
  url: URL,
  page: { finalUrl: string; contentType: string; body: string; truncated: boolean },
  options: FetchOptions,
): Promise<FetchPage> {
  const notes = page.truncated ? ['page exceeded the 50 MiB transfer cap'] : [];

  if (/^application\/(?:[\w.+-]+\+)?json/i.test(page.contentType)) {
    try {
      return buildPage(url.toString(), page.finalUrl, page.contentType, 'json',
        JSON.stringify(JSON.parse(page.body), null, 2), options, notes);
    } catch {
      // A body labelled JSON that will not parse is text; do not throw away the content over a header.
    }
  }

  if (!isHtml(page.contentType)) {
    const negotiated = /^text\/(?:markdown|plain)/i.test(page.contentType);
    const method: FetchMethod = negotiated ? 'content-negotiation' : 'text';
    return buildPage(url.toString(), page.finalUrl, page.contentType, method, page.body, options, notes);
  }

  // A page cut at the transfer cap has no head; running the reader over it would only strip markup.
  if (page.truncated) {
    return buildPage(url.toString(), page.finalUrl, page.contentType, 'raw-html', page.body, options, notes);
  }

  const rendered = await renderHtml(new URL(page.finalUrl), page.body, options.signal);
  log.debug(`fetched ${page.finalUrl} (${page.contentType}) via ${rendered.method}`);
  const method: FetchMethod = rendered.method === 'failed' ? 'raw-html' : rendered.method;
  const text = rendered.method === 'failed' ? page.body : rendered.text;
  const allNotes = [...notes, ...rendered.notes];

  return buildPage(url.toString(), page.finalUrl, page.contentType, method, text, options, allNotes);
}

/** Steps 2-4. A `url-md` miss falls through to negotiation; a negotiation miss becomes a failure. */
export async function fetchWebPage(rawUrl: string, options: FetchOptions = {}): Promise<FetchPage> {
  const verdict = checkFetchUrl(rawUrl);
  if (!verdict.ok) {
    log.warn(`fetch refused: ${verdict.reason} — "${rawUrl}"`);
    return buildPage(rawUrl, rawUrl, '', 'failed', '', options, [verdict.reason]);
  }
  const url = verdict.url;

  const budget = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const composed = withTimeout(budget, options.signal);
  const bounded: FetchOptions = { ...options, signal: composed.signal };

  try {
    const markdownSibling = await tryUrlMarkdown(url, bounded);
    if (markdownSibling) return markdownSibling;

    const page = await loadPage(url, {
      signal: composed.signal,
      headers: { Accept: 'text/markdown, text/plain;q=0.9, text/html;q=0.8, */*;q=0.5' },
    });

    return await resolveContentType(url, page, bounded);
  } catch (error) {
    const reason = composed.timedOut() && !options.signal?.aborted
      ? `timed out after ${budget}ms`
      : error instanceof WebPageError ? error.message : String(error);

    return buildPage(url.toString(), url.toString(), '', 'failed', '', bounded, [reason]);
  } finally {
    composed.dispose();
  }
}

/** The model-facing rendering of a page: where it came from, how it was read, then the text. */
export function formatFetchForModel(page: FetchPage): string {
  if (page.method === 'failed') return `Error: could not read that URL. ${page.notes.join(' ')}`;

  const header = [
    `URL: ${page.finalUrl}`,
    `Content-Type: ${page.contentType || 'unknown'}`,
    `Method: ${page.method}${page.truncated ? ' (truncated)' : ''}`,
    ...page.notes.map((note) => `Notes: ${note}`),
  ].join('\n');

  return `${header}\n\n---\n\n${page.text}`;
}

/** Normalise a model-supplied URL the way `checkFetchUrl` does, for callers that pre-validate. */
export { normalizeFetchUrl };