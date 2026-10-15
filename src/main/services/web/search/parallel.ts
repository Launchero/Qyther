/**
 * Parallel's keyless MCP search endpoint — the chain's second provider.
 *
 * Keyless: `POST https://search.parallel.ai/mcp`. Two live-verified quirks:
 * - `objective` is **required**, not optional. Omitting it returns HTTP 200 with `isError: true` and
 *   the message "web_search requires both objective and search_queries" — a success status code
 *   carrying a failure, which is exactly why the chain treats an unparseable body as a provider
 *   failure rather than an empty result.
 * - the result is **double-encoded**: `result.content[0].text` is itself a JSON document, so the body
 *   is parsed twice. `excerpts` is an array of strings and `publish_date` is often null.
 *
 * Same freshness situation as Exa: no native knob, so `recency` rides in the query text.
 */

import { collapseWhitespace } from '../html';
import { normalizePublishedDate, parseSearchQuery, recencyHint } from '../query';
import type { SearchProvider, SearchRequest, SearchSource } from '../types';

const ENDPOINT = 'https://search.parallel.ai/mcp';
const EXCERPT_CHARS = 600;

interface ParallelEnvelope {
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  error?: { message?: string };
}

interface ParallelPayload {
  results?: Array<{
    url?: string;
    title?: string;
    publish_date?: string | null;
    excerpts?: string[];
  }>;
}

export function parseParallelResults(body: string, limit: number): SearchSource[] {
  let envelope: ParallelEnvelope;
  try {
    envelope = JSON.parse(body) as ParallelEnvelope;
  } catch {
    throw new Error('parallel returned a non-JSON body');
  }

  const text = envelope.result?.content?.find((part) => part.type === 'text')?.text ?? '';
  if (!text) throw new Error(envelope.error?.message ?? 'parallel returned no text payload');

  let payload: ParallelPayload;
  try {
    payload = JSON.parse(text) as ParallelPayload;
  } catch {
    throw new Error('parallel text payload was not JSON');
  }

  const sources = (payload.results ?? [])
    .filter((result): result is typeof result & { url: string } =>
      typeof result.url === 'string' && result.url.startsWith('http'))
    .slice(0, limit)
    .map((result) => {
      const published = normalizePublishedDate(result.publish_date);
      return {
        title: collapseWhitespace(result.title ?? ''),
        url: result.url,
        snippet: collapseWhitespace((result.excerpts ?? []).join(' ')).slice(0, EXCERPT_CHARS),
        ...(published ? { publishedDate: published } : {}),
      };
    });

  if (sources.length === 0) throw new Error('parallel returned no parseable results');
  return sources;
}

/** Parallel wants a goal, not a keyword list; the user query is already that. */
function objectiveFor(query: string): string {
  return `Find the most relevant, up-to-date pages answering: ${query}`;
}

async function searchParallel(req: SearchRequest): Promise<SearchSource[]> {
  const parsed = parseSearchQuery(req.query);
  const query = `${parsed.raw} ${recencyHint(parsed, req.recency)}`.trim();

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': 'Qyther/1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search',
        arguments: {
          objective: objectiveFor(query),
          search_queries: [query],
          mode: 'fast',
          excerpts: { max_chars_per_result: EXCERPT_CHARS },
        },
      },
    }),
    signal: req.signal,
  });

  if (!response.ok) throw new Error(`parallel HTTP ${response.status}`);
  return parseParallelResults(await response.text(), req.limit);
}

export const parallelProvider: SearchProvider = {
  id: 'parallel',
  label: 'Parallel',
  isAvailable: () => true,
  search: searchParallel,
};