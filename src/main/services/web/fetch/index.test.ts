import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_MAX_FETCH_CHARS, fetchWebPage, formatFetchForModel, MAX_RENDERED_CHARS } from './index';

interface FakeResponseInit {
  body?: string;
  status?: number;
  headers?: Record<string, string>;
  url?: string;
}

function fakeResponse(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: init.url ?? 'https://example.com/',
    headers: new Headers(init.headers ?? {}),
    body: new Response(init.body ?? '').body,
    arrayBuffer: async () => new TextEncoder().encode(init.body ?? '').buffer,
  } as unknown as Response;
}

const RICH_HTML = `<!doctype html><html><body><main>
<h1>Release notes</h1>
<p>The renderer was rewritten. ${'Detail sentence. '.repeat(40)}</p>
<ul><li>One</li><li>Two</li></ul>
</main></body></html>`;

const CHROME_HTML = '<!doctype html><html><body>Please enable JavaScript to continue</body></html>';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWebPage guard', () => {
  it('never opens a socket for a blocked URL', async () => {
    const page = await fetchWebPage('http://169.254.169.254/latest/meta-data/');
    expect(page.method).toBe('failed');
    expect(page.notes.join(' ')).toMatch(/loopback, private or link-local/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-checks the URL after a redirect', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html' }, url: 'http://localhost:8080/secret' }));
    const page = await fetchWebPage('https://example.com/docs');
    expect(page.method).toBe('failed');
    expect(page.notes.join(' ')).toMatch(/blocked redirect target/);
  });
});

describe('fetchWebPage pipeline order', () => {
  it('prefers the markdown sibling over the HTML page', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ body: '# Docs\n\n' + 'markdown body '.repeat(20), headers: { 'content-type': 'text/markdown' }, url: 'https://example.com/docs.md' }))
      .mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html' } }));

    const page = await fetchWebPage('https://example.com/docs');
    expect(page.method).toBe('url-md');
    expect(page.text).toContain('# Docs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a server that answers the markdown Accept header', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValue(fakeResponse({ body: 'plain markdown ' + 'body '.repeat(30), headers: { 'content-type': 'text/markdown' } }));

    const page = await fetchWebPage('https://example.com/docs');
    expect(page.method).toBe('content-negotiation');
    const accept = fetchMock.mock.calls[1][1].headers.Accept as string;
    expect(accept).toContain('text/markdown');
  });

  it('runs the local reader on HTML', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html; charset=utf-8' } }));

    const page = await fetchWebPage('https://example.com/notes');
    expect(page.method).toBe('reader');
    expect(page.text).toContain('# Release notes');
    expect(page.text).toContain('- One');
  });

  it('pretty-prints JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValue(fakeResponse({ body: '{"b":2,"a":1}', headers: { 'content-type': 'application/json' } }));

    const page = await fetchWebPage('https://example.com/data.json');
    expect(page.method).toBe('json');
    expect(page.text).toContain('"a": 1');
  });

  it('falls back to the remote reader when the local one returns a script gate', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValueOnce(fakeResponse({ body: CHROME_HTML, headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(fakeResponse({ body: 'Markdown Content:\n\n# Real title\n\n' + 'Extracted prose. '.repeat(30), headers: { 'content-type': 'text/plain' } }));

    const page = await fetchWebPage('https://example.com/spa');
    expect(page.method).toBe('jina');
    expect(page.text).toContain('# Real title');
    expect(fetchMock.mock.calls[2][0]).toMatch(/^https:\/\/r\.jina\.ai\//);
  });

  it('returns raw HTML, flagged, when no reader can help', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValueOnce(fakeResponse({ body: CHROME_HTML, headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(fakeResponse({ body: CHROME_HTML, headers: { 'content-type': 'text/plain' } }));

    const page = await fetchWebPage('https://example.com/spa');
    expect(page.method).toBe('raw-html');
    expect(page.text).toContain('enable JavaScript');
    expect(page.notes.join(' ')).toMatch(/navigation chrome|script gate|no reader/);
  });
});

describe('fetchWebPage transport', () => {
  it('rotates the user agent after a 403 and returns the next response', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValueOnce(fakeResponse({ status: 403, body: 'blocked' }))
      .mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html' } }));

    const page = await fetchWebPage('https://example.com/notes');
    expect(page.method).toBe('reader');

    // [0] is the markdown-sibling probe, [1] and [2] are the same URL under two different agents.
    const blockedUa = fetchMock.mock.calls[1][1].headers['User-Agent'] as string;
    const retryUa = fetchMock.mock.calls[2][1].headers['User-Agent'] as string;
    expect(blockedUa).toContain('Chrome');
    expect(retryUa).not.toBe(blockedUa);
  });

  it('treats a 429 as a rotate, not a dead end', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValueOnce(fakeResponse({ status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html' } }));

    const page = await fetchWebPage('https://example.com/notes');
    expect(page.method).toBe('reader');
  });

  it('fails fast on a 404 instead of spending three user agents on it', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 404, body: 'not found' }));
    const page = await fetchWebPage('https://example.com/missing');
    expect(page.method).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks for an unencoded body so the charset sniff sees real bytes', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html' } }));

    await fetchWebPage('https://example.com/notes');
    expect(fetchMock.mock.calls[1][1].headers['Accept-Encoding']).toBe('identity');
  });

  it('decodes a latin-1 page from its declared charset', async () => {
    const latin = Uint8Array.from(Buffer.from('<html><body><p>caf\u00e9 r\u00e9sum\u00e9 ' + 'detail '.repeat(40) + '</p></body></html>', 'latin1'));
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: '' }))
      .mockResolvedValueOnce({
        ...fakeResponse({ headers: { 'content-type': 'text/html; charset=iso-8859-1' } }),
        body: new Response(latin).body,
      } as unknown as Response);

    const page = await fetchWebPage('https://example.com/latin');
    expect(page.text).toContain('café résumé');
  });
});

describe('fetchWebPage budgets', () => {
  it('clips to the caller budget and flags the truncation', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html' } }));

    const page = await fetchWebPage('https://example.com/notes', { maxChars: 200 });
    expect(page.text.length).toBeLessThanOrEqual(200);
    expect(page.truncated).toBe(true);
    expect(page.notes).toContain('output was truncated');
  });

  it('does not flag a short page as truncated', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 404, body: 'not found' }))
      .mockResolvedValue(fakeResponse({ body: RICH_HTML, headers: { 'content-type': 'text/html' } }));

    const page = await fetchWebPage('https://example.com/notes');
    expect(page.truncated).toBe(false);
    expect(page.text.length).toBeLessThan(MAX_RENDERED_CHARS);
    expect(page.text.length).toBeLessThanOrEqual(DEFAULT_MAX_FETCH_CHARS);
  });

  it('gives up on a body that never finishes, and names the budget', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      // The real fetch rejects on abort; a mock that ignores the signal cannot test a budget.
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));

    const page = await fetchWebPage('https://example.com/slow', { timeoutMs: 20 });
    expect(page.method).toBe('failed');
    expect(page.notes.join(' ')).toBe('timed out after 20ms');
  });
});

describe('formatFetchForModel', () => {
  it('leads with provenance and the method used', () => {
    const text = formatFetchForModel({
      url: 'https://example.com/a', finalUrl: 'https://example.com/b', contentType: 'text/html',
      method: 'reader', text: 'body', truncated: true, notes: ['a note'],
    });
    expect(text).toBe('URL: https://example.com/b\nContent-Type: text/html\nMethod: reader (truncated)\nNotes: a note\n\n---\n\nbody');
  });

  it('renders a failure as error text', () => {
    const text = formatFetchForModel({
      url: 'x', finalUrl: 'x', contentType: '', method: 'failed', text: '', truncated: false, notes: ['HTTP 500'],
    });
    expect(text).toBe('Error: could not read that URL. HTTP 500');
  });
});