/**
 * DuckDuckGo's no-JavaScript HTML endpoint — the chain's credential-free primary.
 *
 * Scraped with the POST form and the `df` freshness knob rather than the older `GET /html/?q=`, which
 * now answers with an anomaly page. Anomaly bodies are reported as a 429 so the chain moves on instead
 * of returning "zero results", which is indistinguishable from a genuinely empty result set.
 */

import { stripTags, collapseWhitespace } from '../html';
import { formatQuery, parseSearchQuery } from '../query';
import type { SearchProvider, SearchRequest, SearchSource } from '../types';

const ENDPOINT = 'https://html.duckduckgo.com/html/';
const RECENCY_CODE: Record<string, string> = { day: 'd', week: 'w', month: 'm', year: 'y' };
const ANOMALY = /anomaly|unusual traffic|are you a robot|captcha/i;

const RESULT_BLOCK = /<div[^>]*class="[^"]*result__body[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi;
const TITLE_LINK = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
const SNIPPET = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i;
const REDIRECT = /^\/\/duckduckgo\.com\/l\/\?uddg=([^&]+)/i;

/** DDG hides the real URL behind a redirector; unwrap it or every result points at DDG. */
function unwrap(href: string): string {
  const match = REDIRECT.exec(href);
  if (!match) return href;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return href;
  }
}

export function parseDuckDuckGoHtml(html: string, limit: number): SearchSource[] {
  const sources: SearchSource[] = [];
  if (ANOMALY.test(html)) throw new Error('duckduckgo returned an anomaly page (rate limited)');

  for (const match of html.matchAll(RESULT_BLOCK)) {
    if (sources.length >= limit) break;
    const block = match[0];

    const link = TITLE_LINK.exec(block);
    if (!link) continue;
    const snippet = SNIPPET.exec(block);

    sources.push({
      url: unwrap(link[1]),
      title: collapseWhitespace(stripTags(link[2])),
      snippet: snippet ? collapseWhitespace(stripTags(snippet[1])) : '',
    });
  }

  return sources.filter((source) => source.url.startsWith('http'));
}

async function searchDuckDuckGo(req: SearchRequest): Promise<SearchSource[]> {
  const parsed = parseSearchQuery(req.query);
  const body = new URLSearchParams({ q: formatQuery(parsed, {}), kl: 'us-en', b: '' });
  if (req.recency) body.set('df', RECENCY_CODE[req.recency]);

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://html.duckduckgo.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: body.toString(),
    signal: req.signal,
  });

  if (!response.ok) throw new Error(`duckduckgo HTTP ${response.status}`);

  return parseDuckDuckGoHtml(await response.text(), req.limit);
}

export const duckduckgoProvider: SearchProvider = {
  id: 'duckduckgo',
  label: 'DuckDuckGo',
  isAvailable: () => true,
  search: searchDuckDuckGo,
};