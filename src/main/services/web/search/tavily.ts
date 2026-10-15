/**
 * Tavily — the first keyed provider. It was already the old fallback (`TAVILY_API_KEY` at
 * `langgraph/tools.ts`), so it keeps that slot in the chain and now also carries recency.
 */

import { formatQuery, normalizePublishedDate, parseSearchQuery } from '../query';
import type { SearchProvider, SearchRequest, SearchSource } from '../types';

const ENDPOINT = 'https://api.tavily.com/search';
const TIME_RANGE: Record<string, string> = { day: 'day', week: 'week', month: 'month', year: 'year' };

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
}

function tavilyKey(): string | undefined {
  const key = process.env.TAVILY_API_KEY;
  return key && key.length > 0 ? key : undefined;
}

async function searchTavily(req: SearchRequest): Promise<SearchSource[]> {
  const key = tavilyKey();
  if (!key) throw new Error('tavily API key not configured');

  const parsed = parseSearchQuery(req.query);
  const payload: Record<string, unknown> = {
    query: formatQuery(parsed, {}),
    max_results: req.limit,
    search_depth: 'basic',
    topic: 'general',
    include_answer: false,
  };
  if (req.recency) payload.time_range = TIME_RANGE[req.recency];
  if (parsed.after) payload.start_date = parsed.after;
  if (parsed.before) payload.end_date = parsed.before;
  if (parsed.includeDomains.length > 0) payload.include_domains = parsed.includeDomains;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
    signal: req.signal,
  });

  if (!response.ok) throw new Error(`tavily HTTP ${response.status}`);
  const data = (await response.json()) as TavilyResponse;

  return (data.results ?? [])
    .filter((result) => typeof result.url === 'string' && result.url.startsWith('http'))
    .slice(0, req.limit)
    .map((result) => {
      const published = normalizePublishedDate(result.published_date);
      return {
        title: result.title ?? '',
        url: result.url as string,
        snippet: result.content ?? '',
        ...(published ? { publishedDate: published } : {}),
      };
    });
}

export const tavilyProvider: SearchProvider = {
  id: 'tavily',
  label: 'Tavily',
  isAvailable: () => tavilyKey() !== undefined,
  search: searchTavily,
};