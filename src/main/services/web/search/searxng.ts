/**
 * SearXNG — a pool of public instances rather than one host, because no single one can be relied on.
 *
 * This is the highest-value keyless *general* web engine that exists for a desktop app, and the reason
 * it is a pool: measured live 2026-10-15 from one IP, **2 of 20 instances served JSON**, then both
 * went 429 and **0 of 71 instances** in the graded pool served JSON at all. Public instances rate-limit
 * by IP and several refuse cloud ranges outright (403/418/429). From a residential connection the hit
 * rate is far better; from one it is zero. Either way the shape is the same: try the pool, take the
 * first answer, and never let it cost the turn — hence the per-instance cap and the whole-pool budget.
 *
 * The pool is ordered by the public `searx.space` instance list (grade, then mean search time), copied
 * on 2026-10-15. Order is not cosmetic: it is the difference between one request and twenty.
 *
 * SearXNG is also the only provider in the chain with a **native** freshness knob — `time_range` takes
 * the same day/week/month/year vocabulary as `Recency`, so no query-text hint is needed here.
 */

import { withTimeout } from '../abort';
import { collapseWhitespace, stripTags } from '../html';
import { formatQuery, parseSearchQuery } from '../query';
import type { SearchProvider, SearchRequest, SearchSource } from '../types';

/**
 * Ordered by **observed** success first, then by the public `searx.space` grade.
 *
 * `etsi.me` and `searx.perennialte.ch` are the two instances that actually served JSON to this machine
 * in the session where the pool was built; everything after them is ordered by searx.space grade and
 * mean search time. Order is not cosmetic: it is the difference between one request and twelve.
 */
const INSTANCE_POOL = [
  'https://etsi.me/',
  'https://searx.perennialte.ch/',
  'https://searxng.deggo.fyi/',
  'https://searxng.website/',
  'https://searxng.site/',
  'https://searx.ononoki.org/',
  'https://www.isci.si/',
  'https://baresearch.org/',
  'https://searx.ro/',
  'https://opnxng.com/',
  'https://search.serpensin.com/',
  'https://searxng.buffon.cloud/',
] as const;

/** One instance must answer inside this. A healthy one answers in 0.2-3.1s (measured). */
const INSTANCE_TIMEOUT_MS = 4_000;

/**
 * The whole pool must be exhausted inside this, or the chain moves on. Cut from 12s to 6s after
 * measuring the failure: a pool that cannot reach a single JSON-enabled instance cost 11.1s of a 120s
 * Ask turn to report the same failure twice as fast. At 6s a healthy first or second instance still
 * gets its turn, because the pool is ordered by observed success.
 */
const POOL_BUDGET_MS = 6_000;

const TIME_RANGE: Record<string, string> = { day: 'day', week: 'week', month: 'month', year: 'year' };

interface SearxngResponse {
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
    publishedDate?: string | null;
  }>;
}

function buildUrl(base: string, query: string, recency?: string, language?: string): string {
  const url = new URL(`${base}search`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query);
  if (recency) url.searchParams.set('time_range', recency);
  if (language) url.searchParams.set('language', language);
  return url.toString();
}

export function parseSearxngResults(body: string, limit: number): SearchSource[] {
  let payload: SearxngResponse;
  try {
    payload = JSON.parse(body) as SearxngResponse;
  } catch {
    // The common failure: the instance has JSON disabled and answered HTML with a 200.
    throw new Error('searxng instance does not serve JSON');
  }

  const sources = (payload.results ?? [])
    .filter((result): result is typeof result & { url: string } =>
      typeof result.url === 'string' && result.url.startsWith('http'))
    .slice(0, limit)
    .map((result) => {
      const date = result.publishedDate && !Number.isNaN(Date.parse(result.publishedDate))
        ? result.publishedDate.slice(0, 10)
        : undefined;
      return {
        title: collapseWhitespace(stripTags(result.title ?? '')),
        url: result.url,
        snippet: collapseWhitespace(stripTags(result.content ?? '')),
        ...(date ? { publishedDate: date } : {}),
      };
    });

  if (sources.length === 0) throw new Error('searxng instance returned no results');
  return sources;
}

/** One instance, one request, one deadline. Returns its sources or throws with the reason. */
async function queryInstance(
  base: string,
  req: SearchRequest,
  query: string,
  signal: AbortSignal,
): Promise<SearchSource[]> {
  const scoped = AbortSignal.any([signal, AbortSignal.timeout(INSTANCE_TIMEOUT_MS)]);
  const response = await fetch(buildUrl(base, query, req.recency ? TIME_RANGE[req.recency] : undefined), {
    redirect: 'follow',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    signal: scoped,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseSearxngResults(await response.text(), req.limit);
}

export async function searchSearxng(req: SearchRequest): Promise<SearchSource[]> {
  // SearXNG passes Google-style syntax to its engines, so every directive is kept inline and the
  // per-engine re-emission is a no-op that only normalises ordering.
  const parsed = parseSearchQuery(req.query);
  const query = formatQuery(parsed, { site: true, dates: true, inurl: true, intitle: true, filetype: true });
  const failures: string[] = [];

  // One budget for the whole pool: twelve instances at four seconds each would otherwise cost 48s of
  // an Ask turn that has 120s in total. The per-instance cap is composed *under* this one, so the
  // effective timeout is whichever runs out first.
  const deadline = withTimeout(POOL_BUDGET_MS, req.signal);

  try {
    for (const base of INSTANCE_POOL) {
      if (deadline.signal.aborted) break;
      try {
        return await queryInstance(base, req, query, deadline.signal);
      } catch (error) {
        if (req.signal?.aborted) throw error;
        failures.push(`${new URL(base).host}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    deadline.dispose();
  }

  throw new Error(`no instance answered (${failures.length} tried) — ${failures.slice(0, 4).join('; ')}`);
}

export const searxngProvider: SearchProvider = {
  id: 'searxng',
  label: 'SearXNG',
  isAvailable: () => true,
  search: searchSearxng,
};