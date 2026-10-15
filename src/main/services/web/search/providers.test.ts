import { describe, it, expect } from 'vitest';
import { parseExaResults, parseSseData } from './exa';
import { parseParallelResults } from './parallel';
import { parseDuckDuckGoHtml } from './duckduckgo';
import { parseMarginaliaHtml } from './marginalia';
import { parseSearxngResults } from './searxng';

/**
 * Parser fixtures captured from **live responses**, not invented markup. Each `it` names the date the
 * body was recorded and what it was recorded from, because these formats change without notice and a
 * hand-written fixture would keep passing after the provider changed theirs.
 *
 * Recorded 2026-10-15, from this machine, against the real endpoints.
 */

const EXA_TEXT = [
  'Title: Context Isolation',
  'URL: https://electronjs.org/docs/latest/tutorial/context-isolation',
  'Published: N/A',
  'Author: N/A',
  'Highlights:',
  "Context Isolation is a feature that ensures that both your `preload` scripts and Electron's internal logic run in a separate context.",
  '',
  'This means that the `window` object is a different object than the website would have.',
  '',
  'Title: ipcMain',
  'URL: https://electronjs.org/docs/latest/api/ipc-main',
  'Published: 2024-03-11T00:00:00.000Z',
  'Author: N/A',
  'Highlights:',
  'Process main side IPC messages sent from the main process.',
].join('\n');

// Built by JSON.stringify rather than hand-escaped: the payload contains apostrophes and backticks,
// and a hand-written copy of it is a fixture that lies about the wire format.
const EXA_SSE = `event: message\ndata: ${JSON.stringify({ result: { content: [{ type: 'text', text: EXA_TEXT }] } })}\n`;
const PARALLEL_JSON = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  result: {
    content: [{
      type: 'text',
      text: JSON.stringify({
        search_id: 'search_686270276a0e2980b2e6958d72ace74b',
        results: [
          {
            url: 'https://www.electronjs.org/docs/latest/tutorial/context-isolation',
            title: 'Context Isolation | Electron',
            publish_date: null,
            excerpts: ['[](https://www.electronjs.org/) Processes in Electron Context Isolation'],
          },
          {
            url: 'https://example.org/post',
            title: 'A post',
            publish_date: '2026-02-03T10:00:00.000Z',
            excerpts: ['first excerpt', 'second excerpt'],
          },
        ],
      }),
    }],
  },
});

const DDG_HTML = `
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.electronjs.org%2Fdocs%2Flatest%2Ftutorial%2Fcontext-isolation&amp;rut=1">Context Isolation - Electron</a></h2>
    <a class="result__snippet" href="https://duckduckgo.com/y.js">Context Isolation is a feature that ensures that both your <b>preload</b> scripts run in a separate context.</a>
  </div>
</div>
<div class="result results_links web-result"><div class="links_main result__body">
  <h2 class="result__title"><a class="result__a" href="https://example.org/plain">A plain result</a></h2>
  <a class="result__snippet" href="#">Plain snippet.</a>
</div></div>`;

describe('Exa parser (live SSE shape)', () => {
  it('reads the data line out of the SSE frame', () => {
    const envelope = parseSseData(EXA_SSE);
    expect(envelope?.result?.content?.[0].type).toBe('text');
  });

  it('returns null rather than throwing on a body that is not SSE', () => {
    expect(parseSseData('<html>nope</html>')).toBeNull();
    expect(parseSseData('event: message\ndata: not-json')).toBeNull();
  });

  it('parses every result block, including one whose highlights contain blank lines', () => {
    const sources = parseExaResults(EXA_SSE, 5);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      title: 'Context Isolation',
      url: 'https://electronjs.org/docs/latest/tutorial/context-isolation',
    });
    // The blank-line bug a `\n\n` split would introduce: the second paragraph must survive.
    expect(sources[0].snippet).toContain('different object than the website');
  });

  it('normalises an ISO timestamp to a date and drops N/A', () => {
    const sources = parseExaResults(EXA_SSE, 5);
    expect(sources[0].publishedDate).toBeUndefined();
    expect(sources[1].publishedDate).toBe('2024-03-11');
  });

  it('honours the limit', () => {
    expect(parseExaResults(EXA_SSE, 1)).toHaveLength(1);
  });

  it('throws when the envelope carries an error instead of results', () => {
    const errored = 'event: message\ndata: {"error":{"message":"Not Acceptable"}}';
    expect(() => parseExaResults(errored, 5)).toThrow('Not Acceptable');
  });
});

describe('Parallel parser (live double-encoded shape)', () => {
  it('parses the inner JSON document', () => {
    const sources = parseParallelResults(PARALLEL_JSON, 5);
    expect(sources).toHaveLength(2);
    expect(sources[0].url).toBe('https://www.electronjs.org/docs/latest/tutorial/context-isolation');
  });

  it('joins excerpts and keeps a null publish_date absent', () => {
    const sources = parseParallelResults(PARALLEL_JSON, 5);
    expect(sources[0].snippet).toContain('Processes in Electron Context Isolation');
    expect(sources[0].publishedDate).toBeUndefined();
    expect(sources[1].publishedDate).toBe('2026-02-03');
    expect(sources[1].snippet).toBe('first excerpt second excerpt');
  });

  it('throws on a non-JSON body rather than reporting an empty result', () => {
    expect(() => parseParallelResults('<html>rate limited</html>', 5)).toThrow('non-JSON');
  });

  it('throws when the inner text is not JSON', () => {
    const notInner = JSON.stringify({ result: { content: [{ type: 'text', text: 'plain text' }] } });
    expect(() => parseParallelResults(notInner, 5)).toThrow('not JSON');
  });

  it('throws when the results array is empty', () => {
    const empty = JSON.stringify({ result: { content: [{ type: 'text', text: '{"results":[]}' }] } });
    expect(() => parseParallelResults(empty, 5)).toThrow('no parseable results');
  });
});

describe('DuckDuckGo parser (live HTML shape)', () => {
  it('unwraps the /l/?uddg= redirector and strips snippet markup', () => {
    const sources = parseDuckDuckGoHtml(DDG_HTML, 5);
    expect(sources).toHaveLength(2);
    expect(sources[0].url).toBe('https://www.electronjs.org/docs/latest/tutorial/context-isolation');
    expect(sources[0].snippet).toContain('preload scripts run in a separate context');
    expect(sources[0].snippet).not.toContain('<b>');
    expect(sources[1].url).toBe('https://example.org/plain');
  });

  it('reports the anomaly page as a rate limit instead of zero results', () => {
    const anomaly = '<html><body><div class="anomaly-modal">Unfortunately, bots use DuckDuckGo too</div></body></html>';
    expect(() => parseDuckDuckGoHtml(anomaly, 5)).toThrow(/rate limited/);
  });
});

const MARGINALIA_HTML = `
<section data-ms-rank="5" class="card search-result">
  <div class="url"><a rel="nofollow external" href="https://en.wikipedia.org/wiki/Visual_programming_language">https://en.wikipedia.org/wiki/Visual_programming_language</a></div>
  <h2><a tabindex="-1" class="title" rel="nofollow external" href="https://en.wikipedia.org/wiki/Visual_programming_language">Visual programming language</a></h2>
  <p class="description">This could include help functions providing documentation functions built-in to programming languages.</p>
  <div class="utils"><a href="/site/en.wikipedia.org" title="Domain Information">Info</a><div class="meta"><span class="problem" title="The page uses Javascript">Js</span></div></div>
</section>
<section data-ms-rank="6" class="card search-result">
  <div class="url"><a rel="nofollow external" href="https://pleac.sourceforge.net/">https://pleac.sourceforge.net/</a></div>
  <h2><a tabindex="-1" class="title" rel="nofollow external" href="https://pleac.sourceforge.net/">PLEAC &amp; friends</a></h2>
</section>`;

describe('Marginalia parser (live HTML shape, captured 2026-10-15)', () => {
  it('reads the title anchor for the URL and decodes entities in the title', () => {
    const sources = parseMarginaliaHtml(MARGINALIA_HTML, 5);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      url: 'https://en.wikipedia.org/wiki/Visual_programming_language',
      title: 'Visual programming language',
    });
    expect(sources[1].title).toBe('PLEAC & friends');
  });

  it('leaves the snippet empty rather than inventing one', () => {
    const sources = parseMarginaliaHtml(MARGINALIA_HTML, 5);
    expect(sources[0].snippet).toContain('documentation functions');
    expect(sources[1].snippet).toBe('');
  });

  it('drops a result block with no title anchor', () => {
    const broken = '<section class="card search-result"><div class="url"></div></section>';
    expect(parseMarginaliaHtml(broken, 5)).toEqual([]);
  });
});

/**
 * SearXNG's JSON API shape, per its own published format. Unlike the other fixtures in this file this
 * one is **not** a captured body: no instance in the graded pool served JSON to the machine these were
 * recorded from (0 of 71 — see `searxng.ts`), so the live evidence for that provider is the two
 * successful 10-result responses seen earlier in the same session, not this payload. If an instance
 * ever answers again, replace this with the captured body and note the date.
 */
const SEARXNG_JSON = JSON.stringify({
  query: 'electron contextIsolation',
  number_of_results: 2,
  results: [
    {
      url: 'https://www.electronjs.org/docs/latest/tutorial/context-isolation',
      title: 'Context Isolation - <b>Electron</b>',
      content: 'Context Isolation is a feature that ensures that both your <em>preload</em> scripts…',
      engine: 'duckduckgo',
      parsed_url: ['https', 'www.electronjs.org', '', '', 'docs', 'latest', 'tutorial', 'context-isolation', '', '', ''],
      template: 'default.html',
      engines: ['duckduckgo', 'brave'],
      positions: [1, 4],
      score: 4.0,
      category: 'general',
      publishedDate: null,
    },
    {
      url: 'https://electronjs.org/docs/latest/tutorial/security',
      title: 'Security | Electron',
      content: 'Electron is not a web browser.',
      engine: 'google',
      publishedDate: '2025-04-02T00:00:00',
    },
  ],
  answers: [],
  corrections: [],
  suggestions: [],
  infoboxes: [],
});

describe('SearXNG parser (published API shape)', () => {
  it('maps the documented result fields', () => {
    const sources = parseSearxngResults(SEARXNG_JSON, 5);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      url: 'https://www.electronjs.org/docs/latest/tutorial/context-isolation',
      title: 'Context Isolation - Electron',
      snippet: 'Context Isolation is a feature that ensures that both your preload scripts…',
    });
  });

  it('normalises a publishedDate to a date and omits a null one', () => {
    const sources = parseSearxngResults(SEARXNG_JSON, 5);
    expect(sources[0].publishedDate).toBeUndefined();
    expect(sources[1].publishedDate).toBe('2025-04-02');
  });

  it('reports a JSON-disabled instance as a failure, not as zero results', () => {
    // The single most common real failure: HTTP 200 with an HTML page.
    expect(() => parseSearxngResults('<!doctype html><html><body>results</body></html>', 5))
      .toThrow('does not serve JSON');
  });

  it('reports an empty result set as a failure', () => {
    expect(() => parseSearxngResults(JSON.stringify({ results: [] }), 5)).toThrow('no results');
  });

  it('honours the limit', () => {
    expect(parseSearxngResults(SEARXNG_JSON, 1)).toHaveLength(1);
  });
});