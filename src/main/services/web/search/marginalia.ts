/**
 * Marginalia — an independent index of the "small web", and the only other **general** web search
 * found to answer with no key at all.
 *
 * Verified live 2026-10-15: repeatable 200s, relevant results, no rate limiting observed across a
 * full probe run. It indexes non-commercial and older sites, so it is a genuinely different corpus
 * from the commercial engines rather than a second view of the same one — which is exactly what a
 * fallback rung is for.
 *
 * HTML shape (`section.search-result`), stable and self-describing enough to parse by class:
 *   <section data-ms-rank="5" class="card search-result">
 *     <div class="url"><a href="URL">URL</a></div>
 *     <h2><a class="title" href="URL">TITLE</a></h2>
 *     <p class="description">SNIPPET</p>
 * The href is taken from `a.title`, not from the `div.url` block, because the title anchor is the one
 * that carries `rel="nofollow external"`; either works, and using both would be a second source of
 * truth for the same field.
 *
 * No freshness knob and no dates, so `recency` rides in the query text (`recencyHint`).
 */

import { collapseWhitespace, stripTags } from '../html';
import { parseSearchQuery, recencyHint } from '../query';
import type { SearchProvider, SearchRequest, SearchSource } from '../types';

const ENDPOINT = 'https://old-search.marginalia.nu/search';

const RESULT_SECTION = /<section[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
const TITLE_ANCHOR = /<a[^>]*class="[^"]*title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
const DESCRIPTION = /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i;

export function parseMarginaliaHtml(html: string, limit: number): SearchSource[] {
  const sources: SearchSource[] = [];

  for (const match of html.matchAll(RESULT_SECTION)) {
    if (sources.length >= limit) break;
    const link = TITLE_ANCHOR.exec(match[1]);
    if (!link) continue;
    const description = DESCRIPTION.exec(match[1]);

    sources.push({
      url: link[1],
      title: collapseWhitespace(stripTags(link[2])),
      snippet: description ? collapseWhitespace(stripTags(description[1])) : '',
    });
  }

  return sources.filter((source) => source.url.startsWith('http'));
}

export async function searchMarginalia(req: SearchRequest): Promise<SearchSource[]> {
  const parsed = parseSearchQuery(req.query);
  const url = new URL(ENDPOINT);
  url.searchParams.set('query', `${parsed.raw} ${recencyHint(parsed, req.recency)}`.trim());

  const response = await fetch(url.toString(), {
    redirect: 'follow',
    headers: {
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    signal: req.signal,
  });

  if (!response.ok) throw new Error(`marginalia HTTP ${response.status}`);

  const sources = parseMarginaliaHtml(await response.text(), req.limit);
  if (sources.length === 0) throw new Error('marginalia returned no parseable results');
  return sources;
}

export const marginaliaProvider: SearchProvider = {
  id: 'marginalia',
  label: 'Marginalia',
  isAvailable: () => true,
  search: searchMarginalia,
};