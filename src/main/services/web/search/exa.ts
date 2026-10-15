/**
 * Exa's keyless MCP search endpoint — the chain's primary.
 *
 * Keyless: `POST https://mcp.exa.ai/mcp` with a JSON-RPC `tools/call` answers without a key and
 * returns the highest-quality results of anything in this chain. The response is **SSE**, not JSON:
 * `Accept` must offer *both* `application/json` and `text/event-stream` (verified live — sending
 * `application/json` alone is answered 406), and the payload arrives as `event: message` followed by
 * a `data:` line whose JSON carries the results as a text block, one per result:
 *
 *     Title: Context Isolation
 *     URL: https://electronjs.org/docs/latest/tutorial/context-isolation
 *     Published: N/A
 *     Author: N/A
 *     Highlights:
 *     <multi-paragraph text, blank lines included>
 *
 * Parsing is line-anchored rather than split-on-blank-line, because the highlights themselves contain
 * blank lines — a blank-line split truncates every result to its first paragraph.
 *
 * No native freshness knob, so `recency` rides in the query text (see `recencyHint`).
 */

import { collapseWhitespace } from '../html';
import { normalizePublishedDate, parseSearchQuery, recencyHint } from '../query';
import type { SearchProvider, SearchRequest, SearchSource } from '../types';

const ENDPOINT = 'https://mcp.exa.ai/mcp';

/**
 * One result block: the four single-line fields, then everything up to the next block.
 *
 * The terminator is `(?![\s\S])`, **not** `$`. With the `m` flag `$` matches at every line end, so a
 * lazy capture terminated by `$` stops at the first blank line — which is inside every set of
 * highlights, silently truncating each result to its first paragraph. `(?![\s\S])` means "no
 * character follows", which is true at the end of input and nowhere else, flag-independent.
 */
const RESULT_BLOCK = /^Title:[ \t]*(.*)$\n^URL:[ \t]*(\S+)$\n^Published:[ \t]*(.*)$\n^Author:[ \t]*(.*)$\n^Highlights:\n([\s\S]*?)(?=\nTitle:[ \t]|(?![\s\S]))/gm;

interface ExaEnvelope {
  result?: { content?: Array<{ type?: string; text?: string }> };
  error?: { message?: string };
}

/** The `data:` line of the SSE frame. Servers may emit more than one frame; the first carries the result. */
export function parseSseData(body: string): ExaEnvelope | null {
  const line = body.split('\n').find((candidate) => candidate.startsWith('data:'));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(5).trim()) as ExaEnvelope;
  } catch {
    return null;
  }
}

export function parseExaResults(body: string, limit: number): SearchSource[] {
  const envelope = parseSseData(body);
  const text = envelope?.result?.content?.find((part) => part.type === 'text')?.text ?? '';
  if (!text) throw new Error(envelope?.error?.message ?? 'exa returned no text payload');

  const sources: SearchSource[] = [];
  for (const match of text.matchAll(RESULT_BLOCK)) {
    if (sources.length >= limit) break;
    const [, title, url, publishedDate, , highlights] = match;
    if (!url.startsWith('http')) continue;

    const published = normalizePublishedDate(publishedDate);
    sources.push({
      title: collapseWhitespace(title),
      url,
      snippet: collapseWhitespace(highlights),
      ...(published ? { publishedDate: published } : {}),
    });
  }

  if (sources.length === 0) throw new Error('exa returned no parseable results');
  return sources;
}

async function searchExa(req: SearchRequest): Promise<SearchSource[]> {
  const parsed = parseSearchQuery(req.query);
  const query = `${parsed.raw} ${recencyHint(parsed, req.recency)}`.trim();

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'x-exa-source': 'qyther',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'web_search_exa', arguments: { query, numResults: Math.min(req.limit, 10), type: 'auto' } },
    }),
    signal: req.signal,
  });

  if (!response.ok) throw new Error(`exa HTTP ${response.status}`);
  return parseExaResults(await response.text(), req.limit);
}

export const exaProvider: SearchProvider = {
  id: 'exa',
  label: 'Exa',
  isAvailable: () => true,
  search: searchExa,
};