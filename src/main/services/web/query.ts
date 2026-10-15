/**
 * Google-style query directive parsing, per-engine formatting, and the lenient post-filter.
 *
 * The chain is not one query: the same parsed query is re-emitted in whatever dialect each engine
 * understands (a keyed API takes `include_domains`, an HTML scraper takes the raw string), and any
 * directive an engine ignored is applied afterwards as a filter over the returned sources.
 *
 * Two properties are load-bearing and tested: a constraint that matches *nothing* is relaxed with a
 * note rather than treated as a failure (a model that asked for `site:` and got nothing must still get
 * results), and an undated source passes a date bound (most engines omit dates, and dropping those
 * sources would silently empty the result set).
 */

import type { Recency, SearchSource } from './types';

export interface ParsedQuery {
  raw: string;
  /** Plain terms, quoted phrases preserved, directives removed. */
  terms: string[];
  includeDomains: string[];
  excludeDomains: string[];
  inurl: string[];
  intitle: string[];
  filetype: string[];
  after?: string;
  before?: string;
  lang?: string;
}

/** Which directives an engine understands natively; everything else falls through to the post-filter. */
export interface EngineSyntax {
  site?: boolean;
  dates?: boolean;
  inurl?: boolean;
  intitle?: boolean;
  filetype?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pushValue(target: string[], value: string): void {
  const clean = value.replace(/^["']|["']$/g, '').trim().toLowerCase();
  if (clean.length > 0 && !target.includes(clean)) target.push(clean);
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = {
    raw, terms: [], includeDomains: [], excludeDomains: [], inurl: [], intitle: [], filetype: [],
  };

  // Quoted phrases are lifted out first so a phrase survives as one term instead of splitting on its
  // own spaces. The placeholder is a token no directive can collide with.
  const phrases: string[] = [];
  const masked = raw.replace(/"([^"]*)"/g, (_match, phrase: string) => {
    phrases.push(phrase.trim());
    return ` \u0000${phrases.length - 1} `;
  });

  for (const token of masked.split(/\s+/)) {
    if (token.length === 0) continue;

    const directive = /^(site|domain|host):(.+)$/i.exec(token);
    if (directive) { pushValue(parsed.includeDomains, directive[2]); continue; }

    const negatedSite = /^-?(site|domain|host):(.+)$/i.exec(token);
    if (negatedSite) { pushValue(parsed.excludeDomains, negatedSite[2]); continue; }

    if (/^inurl:/i.test(token)) { pushValue(parsed.inurl, token.slice(6)); continue; }
    if (/^intitle:/i.test(token)) { pushValue(parsed.intitle, token.slice(8)); continue; }
    if (/^filetype:/i.test(token)) { pushValue(parsed.filetype, token.slice(9)); continue; }
    if (/^lang:/i.test(token)) {
      parsed.lang = token.slice(5).replace(/^["']|["']$/g, '').trim().toLowerCase() || undefined;
      continue;
    }

    const date = /^(after|before|until|since):(\S+)$/i.exec(token);
    if (date) {
      if (!ISO_DATE.test(date[2])) continue;
      if (/^(after|since)$/i.test(date[1])) parsed.after = date[2];
      else parsed.before = date[2];
      continue;
    }

    if (token.startsWith('-') && token.length > 1) continue;
    if (/^(or|and|not)$/i.test(token)) continue;

    const phrase = /^\u0000(\d+)$/.exec(token);
    if (phrase) { parsed.terms.push(phrases[Number(phrase[1])]); continue; }
    parsed.terms.push(token.replace(/^\+/, ''));
  }

  return parsed;
}

/**
 * Reduce whatever an engine calls a date to `YYYY-MM-DD`, or nothing.
 *
 * Providers disagree: Brave gives a full ISO timestamp, Exa gives `2026-10-11T00:00:00.000Z`, Tavily
 * gives a date, and Parallel and DuckDuckGo usually give nothing. The model reads this field and the
 * date post-filter compares it, so one shape is the only honest contract. Unparseable values are
 * dropped rather than passed through: an invented date is worse than a missing one.
 */
export function normalizePublishedDate(raw: string | null | undefined): string | undefined {
  if (!raw || raw === 'N/A') return undefined;
  const stamp = Date.parse(raw);
  return Number.isNaN(stamp) ? undefined : new Date(stamp).toISOString().slice(0, 10);
}

/**
 * The keyword hint that carries a recency window to an engine with no freshness knob.
 *
 * Two of the four providers (Exa, Parallel) have no `df`/`freshness`/`time_range` parameter, and the
 * post-filter cannot help them: most of their sources carry no date, and an undated source passes a
 * date bound by design. So the window has to reach the query as words, and the words have to be
 * computed rather than hardcoded — the previous implementation appended a literal `" 2025 2026"`,
 * which is wrong every year and was the reason this exists.
 */
export function recencyHint(parsed: ParsedQuery, recency?: Recency, now: Date = new Date()): string {
  if (!recency) return '';
  const year = now.getFullYear();
  switch (recency) {
    case 'day': return 'today';
    case 'week': return 'this week';
    case 'month': return 'this month';
    case 'year': return `${year}`;
    default: return '';
  }
}

/** Re-emit the query for an engine, dropping directives it cannot act on. */
export function formatQuery(parsed: ParsedQuery, syntax: EngineSyntax): string {
  const parts: string[] = [];

  for (const domain of parsed.includeDomains) parts.push('site:' + domain);
  for (const domain of parsed.excludeDomains) parts.push('-site:' + domain);
  if (syntax.dates) {
    if (parsed.after) parts.push('after:' + parsed.after);
    if (parsed.before) parts.push('before:' + parsed.before);
  }
  for (const value of syntax.inurl ? parsed.inurl : []) parts.push('inurl:' + value);
  for (const value of syntax.intitle ? parsed.intitle : []) parts.push('intitle:' + value);
  for (const value of syntax.filetype ? parsed.filetype : []) parts.push('filetype:' + value);

  // A query made only of directives ("site:electronjs.org") still has to reach the engine as words.
  const terms = parsed.terms.length > 0
    ? parsed.terms
    : [...parsed.includeDomains, ...parsed.intitle, ...parsed.filetype, ...parsed.inurl];

  parts.push(...(terms.length > 0 ? terms : [parsed.raw.trim()]));

  return parts.join(' ').trim();
}

function matchesDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === domain.replace(/^www\./, '') || host.endsWith('.' + domain);
  } catch {
    return false;
  }
}

function withinDateBound(source: SearchSource, after?: string, before?: string): boolean {
  if (!source.publishedDate) return true;
  const stamp = Date.parse(source.publishedDate);
  if (Number.isNaN(stamp)) return true;
  const day = stamp / 86_400_000;
  if (after && day < Date.parse(after) / 86_400_000) return false;
  if (before && day > Date.parse(before) / 86_400_000) return false;
  return true;
}

/** Apply one dimension. An empty result is *relaxed*, not obeyed — dropped, and reported as relaxed. */
function applyDimension(
  sources: SearchSource[],
  label: string,
  predicate: (source: SearchSource) => boolean,
): { sources: SearchSource[]; note?: string } {
  const kept = sources.filter(predicate);
  if (kept.length === sources.length) return { sources: kept };
  if (kept.length === 0) return { sources, note: 'no results matched the constraint; it was relaxed' };
  return { sources: kept };
}

/** Build the dimensions the query actually asked for — an absent directive must never filter. */
function buildDimensions(parsed: ParsedQuery): Array<[string, (source: SearchSource) => boolean]> {
  const dimensions: Array<[string, (source: SearchSource) => boolean]> = [];

  if (parsed.includeDomains.length > 0) {
    const domains = parsed.includeDomains;
    dimensions.push(['site:' + domains.join(','), (s) => domains.every((d) => matchesDomain(s.url, d))]);
  }
  if (parsed.excludeDomains.length > 0) {
    const domains = parsed.excludeDomains;
    dimensions.push(['-site:' + domains.join(','), (s) => !domains.some((d) => matchesDomain(s.url, d))]);
  }
  if (parsed.inurl.length > 0) {
    const values = parsed.inurl;
    dimensions.push(['inurl:' + values.join(','), (s) => values.every((v) => s.url.toLowerCase().includes(v))]);
  }
  if (parsed.intitle.length > 0) {
    const values = parsed.intitle;
    dimensions.push(['intitle:' + values.join(','), (s) => values.every((v) => s.title.toLowerCase().includes(v))]);
  }
  if (parsed.filetype.length > 0) {
    const values = parsed.filetype;
    dimensions.push(['filetype:' + values.join(','), (s) => values.some((v) => s.url.toLowerCase().includes('.' + v))]);
  }
  if (parsed.after || parsed.before) {
    const label = 'after:' + (parsed.after ?? '') + ' before:' + (parsed.before ?? '');
    dimensions.push([label, (s) => withinDateBound(s, parsed.after, parsed.before)]);
  }

  return dimensions;
}

export function applyQueryConstraints(
  sources: SearchSource[],
  parsed: ParsedQuery,
): { sources: SearchSource[]; notes: string[] } {
  const notes: string[] = [];
  let current = sources;

  for (const [label, predicate] of buildDimensions(parsed)) {
    if (current.length === 0) break;
    const result = applyDimension(current, label, predicate);
    current = result.sources;
    if (result.note) notes.push('no results matched `' + label + '`; the constraint was relaxed');
  }

  return { sources: current, notes };
}