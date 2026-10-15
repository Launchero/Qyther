import { describe, it, expect, vi } from 'vitest';
import { formatSearchForModel, searchWeb } from './index';
import { SEARCH_PROVIDERS } from './registry';
import type { SearchProvider, SearchProviderId, SearchSource } from '../types';

const source = (url: string, over: Partial<SearchSource> = {}): SearchSource => ({
  title: `Title for ${url}`, url, snippet: 'x'.repeat(400), ...over,
});

function fake(id: SearchProviderId, behaviour: 'ok' | 'empty' | 'throw' | 'unavailable'): SearchProvider {
  return {
    id,
    label: id,
    isAvailable: () => behaviour !== 'unavailable',
    search: async () => {
      if (behaviour === 'throw') throw new Error(`${id} exploded`);
      if (behaviour === 'empty') return [];
      return [source(`https://${id}.test/a`), source(`https://${id}.test/b`)];
    },
  };
}

describe('searchWeb chain policy', () => {
  it('returns the first provider that answers', async () => {
    const response = await searchWeb(
      { query: 'electron', limit: 5 },
      { providers: [fake('duckduckgo', 'ok'), fake('parallel', 'ok')] },
    );
    expect(response.provider).toBe('duckduckgo');
    expect(response.sources).toHaveLength(2);
  });

  it('advances past a provider that throws and records the failure', async () => {
    const response = await searchWeb(
      { query: 'electron', limit: 5 },
      { providers: [fake('duckduckgo', 'throw'), fake('parallel', 'ok')] },
    );
    expect(response.provider).toBe('parallel');
    expect(response.notes.join(' ')).toContain('duckduckgo');
    expect(response.notes.join(' ')).toContain('exploded');
  });

  it('treats an empty result as a failure, not an answer', async () => {
    const response = await searchWeb(
      { query: 'electron', limit: 5 },
      { providers: [fake('duckduckgo', 'empty'), fake('parallel', 'ok')] },
    );
    expect(response.provider).toBe('parallel');
  });

  it('skips a provider with no credentials without reporting it', async () => {
    const unavailable = { ...fake('tavily', 'throw'), isAvailable: () => false };
    const response = await searchWeb({ query: 'electron', limit: 5 }, { providers: [unavailable, fake('brave', 'ok')] });
    expect(response.provider).toBe('brave');
    expect(response.notes).toEqual([]);
  });

  it('reports provider none when every provider fails', async () => {
    const response = await searchWeb(
      { query: 'electron', limit: 5 },
      { providers: [fake('duckduckgo', 'throw'), fake('parallel', 'empty')] },
    );
    expect(response.provider).toBe('none');
    expect(response.sources).toEqual([]);
    expect(response.notes.join(' ')).toContain('all providers failed');
  });

  it('rethrows a caller abort instead of walking the rest of the chain', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled by user'));
    const aborting: SearchProvider = {
      id: 'duckduckgo',
      label: 'aborting',
      isAvailable: () => true,
      search: async ({ signal }: { signal?: AbortSignal }) => {
        if (signal?.aborted) throw signal.reason;
        return [];
      },
    };

    await expect(
      searchWeb({ query: 'x', limit: 5, signal: controller.signal }, { providers: [aborting, fake('parallel', 'ok')] }),
    ).rejects.toThrow('cancelled by user');
  });

  it('enforces the caller limit and dedupes by URL', async () => {
    const duplicate: SearchProvider = {
      id: 'duckduckgo', label: 'dupes', isAvailable: () => true,
      search: async () => [
        source('https://a.test/x'), source('https://a.test/x/'), source('http://www.a.test/x'),
        source('https://a.test/y'),
      ],
    };
    const response = await searchWeb({ query: 'x', limit: 3 }, { providers: [duplicate] });
    expect(response.sources.map((s) => s.url)).toEqual(['https://a.test/x', 'https://a.test/y']);
  });

  it('turns an exhausted timeout into a provider failure, not a cancellation', async () => {
    vi.useFakeTimers();
    try {
      const hanging: SearchProvider = {
        id: 'duckduckgo', label: 'hangs', isAvailable: () => true,
        search: ({ signal }: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      };
      const pending = searchWeb({ query: 'x', limit: 5 }, { providers: [hanging], timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1100);
      const response = await pending;
      expect(response.provider).toBe('none');
      expect(response.notes.join(' ')).toContain('timed out after 1000ms');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to unfiltered sources when every constraint misses', async () => {
    const response = await searchWeb({ query: 'q site:nowhere.example', limit: 5 }, { providers: [fake('duckduckgo', 'ok')] });
    expect(response.sources).toHaveLength(2);
    expect(response.notes.join(' ')).toContain('constraint was relaxed');
  });
});

describe('formatSearchForModel', () => {
  it('numbers sources, keeps the URL on its own line and clips the snippet', () => {
    const text = formatSearchForModel({
      provider: 'duckduckgo',
      sources: [source('https://a.test/x', { title: 'A', publishedDate: '2026-01-02' })],
      notes: ['parallel unavailable: parallel: HTTP 403'],
    });
    expect(text).toContain('Note: parallel unavailable: parallel: HTTP 403');
    expect(text).toContain('## Sources (duckduckgo)');
    expect(text).toContain('[1] A (2026-01-02)');
    expect(text).toContain('https://a.test/x\n');
    expect(text.match(/x{240}/)).toBeTruthy();
    expect(text).not.toMatch(/x{241}/);
  });

  it('renders a total failure as readable error text', () => {
    const text = formatSearchForModel({ provider: 'none', sources: [], notes: ['all providers failed: duckduckgo: HTTP 429'] });
    expect(text.startsWith('Error: web search failed.')).toBe(true);
    expect(text).toContain('HTTP 429');
  });
});

describe('registry', () => {
  it('orders the chain keyless-API first, then pool/small-web, then scraper, then keyed', () => {
    expect(SEARCH_PROVIDERS.map((p) => p.id))
      .toEqual(['exa', 'parallel', 'searxng', 'marginalia', 'duckduckgo', 'tavily', 'brave']);
  });

  it('keeps every keyless provider reachable with no configuration at all', () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.BRAVE_API_KEY;
    const keyless = SEARCH_PROVIDERS.filter((p) => p.isAvailable()).map((p) => p.id);
    expect(keyless).toEqual(['exa', 'parallel', 'searxng', 'marginalia', 'duckduckgo']);
  });

  it('keys the two paid providers on their env vars', () => {
    const tavily = SEARCH_PROVIDERS.find((p) => p.id === 'tavily');
    const brave = SEARCH_PROVIDERS.find((p) => p.id === 'brave');
    delete process.env.TAVILY_API_KEY;
    delete process.env.BRAVE_API_KEY;
    expect(tavily?.isAvailable()).toBe(false);
    expect(brave?.isAvailable()).toBe(false);
    process.env.TAVILY_API_KEY = 'k';
    expect(tavily?.isAvailable()).toBe(true);
    delete process.env.TAVILY_API_KEY;
  });
});