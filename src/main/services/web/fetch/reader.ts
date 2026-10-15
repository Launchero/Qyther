/**
 * The HTML reader chain: local extraction first, a remote reader second.
 *
 * Order is the contract. Local extraction is free and instant, so it goes first; a remote reader is a
 * second network round trip with its own latency and rate limits, so it only runs when the local pass
 * produced something the quality gate rejects — the navigation-chrome case. A page that needs
 * JavaScript to render is exactly the case the remote reader exists for.
 *
 * Each reader must clear `isUsableReaderOutput`. If none does, the best low-quality attempt is returned
 * anyway with a note: handing back "please enable JavaScript" is useless, but handing back a nav menu
 * plus a note is honest, and the caller can decide.
 */

import { withTimeout } from '../abort';
import { htmlToMarkdown, isUsableReaderOutput } from '../html';
import { loadPage } from './page';
import type { FetchMethod } from '../types';

/** Per-attempt budget for a remote reader. A slow reader must not spend the caller's whole budget. */
const REMOTE_READER_TIMEOUT_MS = 10_000;

const JINA_READER = 'https://r.jina.ai/';
const MIN_ACCEPTED_CHARS = 100;

/**
 * Jina prefixes its markdown with its own front matter, verified live:
 *   `Title: Context Isolation | Electron`
 *   `URL Source: https://…`
 *   `Published Time: …`
 *   `Markdown Content:`
 *   `## What is it?`
 * All of it is redundant with the header `formatFetchForModel` already prints, so the whole leading
 * key/value block goes — not just the `Markdown Content:` marker, which is what the first draft did.
 */
const JINA_FRONT_MATTER = /^(?:[A-Z][A-Za-z ]*:\s*.*\n|\s*\n)*Markdown Content:\s*\n+/;

interface RenderedPage {
  text: string;
  method: FetchMethod;
  notes: string[];
}

interface Reader {
  method: FetchMethod;
  label: string;
  render(url: URL, html: string, signal?: AbortSignal): Promise<string | null>;
}

const localReader: Reader = {
  method: 'reader',
  label: 'local extractor',
  render: async (_url, html) => htmlToMarkdown(html),
};

const jinaReader: Reader = {
  method: 'jina',
  label: 'jina reader',
  render: async (url, _html, signal) => {
    const composed = withTimeout(REMOTE_READER_TIMEOUT_MS, signal);
    try {
      const page = await loadPage(new URL(JINA_READER + url.toString()), {
        signal: composed.signal,
        headers: {
          Accept: 'text/markdown',
          'X-No-Cache': 'true',
          ...(process.env.JINA_API_KEY ? { Authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}),
        },
      });
      return page.body.replace(JINA_FRONT_MATTER, '').trim();
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    } finally {
      composed.dispose();
    }
  },
};

/** Order matters: local first, remote only as a rescue. Adding a reader is one entry. */
const READERS: readonly Reader[] = [localReader, jinaReader];

function quality(text: string | null): number {
  return text ? text.replace(/\s/g, '').length : 0;
}

export async function renderHtml(url: URL, html: string, signal?: AbortSignal): Promise<RenderedPage> {
  let best: RenderedPage | null = null;

  for (const reader of READERS) {
    let text: string | null;
    try {
      text = await reader.render(url, html, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      best ??= { text: '', method: 'failed', notes: [`${reader.label} failed: ${describe(error)}`] };
      continue;
    }

    if (text === null || quality(text) < MIN_ACCEPTED_CHARS) continue;
    if (isUsableReaderOutput(text)) return { text, method: reader.method, notes: [] };

    best = { text, method: reader.method, notes: ['extraction looks like navigation chrome or a script gate'] };
  }

  return best ?? { text: '', method: 'failed', notes: ['no reader produced usable text'] };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}