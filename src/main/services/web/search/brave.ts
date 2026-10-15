/**
 * Brave Search — the last link in the chain, keyed. It is the only provider here that returns a
 * `publishedDate` reliably, which is what lets the date post-filter actually bind instead of passing
 * every source through as undated.
 */

import { stripTags, collapseWhitespace } from '../html';
import { formatQuery, normalizePublishedDate, parseSearchQuery } from '../query';
import type { SearchProvider, SearchRequest, SearchSource } from '../types';

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const FRESHNESS: Record<string, string> = { day: 'pd', week: 'pw', month: 'pm', year: 'py' };
const QUERY_MAX_CHARS = 500;

interface BraveResponse {
  web?: {
    results?: Array<{
      title?: string; url?: string; description?: string;
      age?: string; page_age?: string;
    }>;
  };
}

function braveKey(): string | undefined {
  const key = process.env.BRAVE_API_KEY;
  return key && key.length > 0 ? key : undefined;
}

function publishedDate(result: { age?: string; page_age?: string }): string | undefined {
  return normalizePublishedDate(result.page_age ?? result.age);
}

async function searchBrave(req: SearchRequest): Promise<SearchSource[]> {
  const key = braveKey();
  if (!key) throw new Error('brave API key not configured');

  const parsed = parseSearchQuery(req.query);
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', formatQuery(parsed, { site: true, dates: true }).slice(0, QUERY_MAX_CHARS));
  url.searchParams.set('count', String(Math.min(req.limit, 20)));
  if (req.recency) url.searchParams.set('freshness', FRESHNESS[req.recency]);

  const response = await fetch(url.toString(), {
    redirect: 'follow',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': key,
    },
    signal: req.signal,
  });

  if (!response.ok) throw new Error(`brave HTTP ${response.status}`);
  const data = (await response.json()) as BraveResponse;

  return (data.web?.results ?? [])
    .filter((result) => typeof result.url === 'string' && result.url.startsWith('http'))
    .slice(0, req.limit)
    .map((result) => {
      const published = publishedDate(result);
      return {
        title: collapseWhitespace(stripTags(result.title ?? '')),
        url: result.url as string,
        snippet: collapseWhitespace(stripTags(result.description ?? '')),
        ...(published ? { publishedDate: published } : {}),
      };
    });
}

export const braveProvider: SearchProvider = {
  id: 'brave',
  label: 'Brave Search',
  isAvailable: () => braveKey() !== undefined,
  search: searchBrave,
};