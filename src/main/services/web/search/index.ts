/**
 * The search chain: parse once, walk the providers in registry order, first usable response wins.
 *
 * Contract, and each clause is tested in `search/index.test.ts`:
 * - a provider that fails is recorded, not thrown; the chain advances and the failures come back as notes
 * - a provider that returns nothing is treated as a failure, because "zero results" and "bot-walled"
 *   are the same shape and must not silently end the chain
 * - a caller abort rethrows and is never reported as a provider failure — a cancelled turn must not
 *   walk the rest of the chain and then hand the model a fabricated error
 * - every directive the provider ignored is re-applied as a post-filter, and a constraint that empties
 *   the set is relaxed with a note rather than returned as an empty answer
 */

import { withTimeout } from '../abort';
import { applyQueryConstraints, parseSearchQuery } from '../query';
import { createLogger } from '../../../utils/logger';
import type { SearchProvider, SearchRequest, SearchResponse, SearchSource } from '../types';
import { SEARCH_PROVIDERS } from './registry';

const log = createLogger('Search');

/**
 * Per-provider transport budget, composed with the caller's signal, never replacing it.
 *
 * 20s, not the 60s the design this was ported from uses: this chain is walked from inside an Ask
 * turn that has 120s in total for search, three page fetches, synthesis and streaming. Five providers
 * at 60s each is a turn that dies on the clock before it reaches the model.
 */
const SEARCH_TIMEOUT_MS = 20_000;

/** The snippet budget in the model-facing text. Sources are the model's working memory. */
const MAX_SNIPPET_CHARS = 240;

export interface SearchOptions {
  /** Test seam and override point. Defaults to the registry order. */
  providers?: readonly SearchProvider[];
  timeoutMs?: number;
}

/** Same page reached two ways: scheme, `www.` and a trailing slash are not differences. */
function dedupe(sources: SearchSource[]): SearchSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runProvider(
  provider: SearchProvider,
  req: SearchRequest,
  timeoutMs: number,
): Promise<SearchSource[]> {
  const composed = withTimeout(timeoutMs, req.signal);
  try {
    return await provider.search({ ...req, signal: composed.signal });
  } catch (error) {
    // An abort we raised is a timeout; an abort the caller raised is cancellation and must survive.
    if (composed.timedOut() && !req.signal?.aborted) {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    composed.dispose();
  }
}

export async function searchWeb(req: SearchRequest, options: SearchOptions = {}): Promise<SearchResponse> {
  const providers = options.providers ?? SEARCH_PROVIDERS;
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const parsed = parseSearchQuery(req.query);
  const failures: string[] = [];

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;

    let raw: SearchSource[];
    try {
      raw = await runProvider(provider, req, timeoutMs);
    } catch (error) {
      if (req.signal?.aborted) throw error;
      const failure = `${provider.id}: ${errorMessage(error)}`;
      log.debug(`provider failed — ${failure}`);
      failures.push(failure);
      continue;
    }

    const sources = dedupe(raw).slice(0, req.limit);
    if (sources.length === 0) {
      failures.push(`${provider.id}: no results`);
      continue;
    }

    const constrained = applyQueryConstraints(sources, parsed);
    const skipped = failures.map((failure) => `${provider.id} unavailable: ${failure}`);
    log.info(`search answered by ${provider.id}: ${sources.length} sources for "${req.query}"`);

    return { provider: provider.id, sources: constrained.sources, notes: [...skipped, ...constrained.notes] };
  }

  log.warn(`every search provider failed for "${req.query}": ${failures.join('; ')}`);
  return { provider: 'none', sources: [], notes: [`all providers failed: ${failures.join('; ')}`] };
}

/** Model-facing text: notes, then numbered sources. Never JSON — the model reads prose. */
export function formatSearchForModel(response: SearchResponse): string {
  if (response.provider === 'none') {
    return `Error: web search failed. ${response.notes.join(' ')}`;
  }

  const lines: string[] = [];
  for (const note of response.notes) lines.push(`Note: ${note}`);

  lines.push(`## Sources (${response.provider})`);
  response.sources.forEach((source, index) => {
    const age = source.publishedDate ? ` (${source.publishedDate})` : '';
    lines.push(`[${index + 1}] ${source.title}${age}`);
    lines.push(source.url);
    if (source.snippet) lines.push(source.snippet.slice(0, MAX_SNIPPET_CHARS));
  });

  return lines.join('\n');
}