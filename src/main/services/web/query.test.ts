import { describe, it, expect } from 'vitest';
import { applyQueryConstraints, formatQuery, parseSearchQuery } from './query';
import type { SearchSource } from './types';

const source = (url: string, over: Partial<SearchSource> = {}): SearchSource => ({
  title: 'Title', url, snippet: '', ...over,
});

describe('parseSearchQuery', () => {
  it('separates directives from terms', () => {
    const parsed = parseSearchQuery('electron ipc site:electronjs.org -site:reddit.com after:2025-01-01 filetype:pdf');
    expect(parsed.terms).toEqual(['electron', 'ipc']);
    expect(parsed.includeDomains).toEqual(['electronjs.org']);
    expect(parsed.excludeDomains).toEqual(['reddit.com']);
    expect(parsed.after).toBe('2025-01-01');
    expect(parsed.filetype).toEqual(['pdf']);
  });

  it('keeps quoted phrases as a single term and drops negations', () => {
    const parsed = parseSearchQuery('"context isolation" -legacy');
    expect(parsed.terms).toEqual(['context isolation']);
  });

  it('ignores a malformed date rather than trusting it', () => {
    expect(parseSearchQuery('x after:yesterday').after).toBeUndefined();
  });
});

describe('formatQuery', () => {
  const parsed = parseSearchQuery('electron ipc site:electronjs.org -site:reddit.com after:2025-01-01');

  it('keeps only the directives an engine understands', () => {
    expect(formatQuery(parsed, {})).toBe('site:electronjs.org -site:reddit.com electron ipc');
    expect(formatQuery(parsed, { site: true, dates: true })).toBe(
      'site:electronjs.org -site:reddit.com after:2025-01-01 electron ipc',
    );
  });

  it('never emits an empty query for a directive-only search', () => {
    expect(formatQuery(parseSearchQuery('site:electronjs.org'), {})).toBe('site:electronjs.org electronjs.org');
  });
});

describe('applyQueryConstraints', () => {
  it('filters by included and excluded domains', () => {
    const parsed = parseSearchQuery('q site:electronjs.org -site:reddit.com');
    const { sources } = applyQueryConstraints(
      [source('https://electronjs.org/docs'), source('https://www.electronjs.org/x'), source('https://reddit.com/r/electron')],
      parsed,
    );
    expect(sources.map((s) => s.url)).toEqual([
      'https://electronjs.org/docs',
      'https://www.electronjs.org/x',
    ]);
  });

  it('lets an undated source pass a date bound', () => {
    const parsed = parseSearchQuery('q after:2026-01-01');
    const { sources } = applyQueryConstraints([source('https://a.dev/x'), source('https://b.dev/y', { publishedDate: '2020-01-01' })], parsed);
    expect(sources.map((s) => s.url)).toEqual(['https://a.dev/x']);
  });

  it('keeps in-range dates and drops out-of-range ones', () => {
    const parsed = parseSearchQuery('q after:2026-01-01 before:2026-02-01');
    const { sources } = applyQueryConstraints(
      [source('https://a.dev/x', { publishedDate: '2026-01-15' }), source('https://b.dev/y', { publishedDate: '2025-12-31' })],
      parsed,
    );
    expect(sources.map((s) => s.url)).toEqual(['https://a.dev/x']);
  });

  it('relaxes a constraint that would empty the set, and says so', () => {
    const parsed = parseSearchQuery('q site:nowhere.example');
    const sources = [source('https://a.dev/x')];
    const result = applyQueryConstraints(sources, parsed);
    expect(result.sources).toEqual(sources);
    expect(result.notes.join(' ')).toMatch(/constraint was relaxed/);
  });

  it('does not let an absent directive filter anything', () => {
    const input = [source('https://a.dev/x'), source('https://b.dev/report.pdf')];
    expect(applyQueryConstraints(input, parseSearchQuery('plain query'))).toEqual({ sources: input, notes: [] });
  });
});