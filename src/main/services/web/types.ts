/**
 * Shared value types for the web substrate: search (provider chain) and fetch (URL to readable text).
 *
 * Deliberately Electron-free, LangChain-free and zod-free, so the same modules are importable from
 * an AskGraph node, from a Pi tool, and from a unit test with no mocks. Types only — no behaviour.
 */

/** Freshness window. The vocabulary is closed on purpose: every provider maps it onto its own knob. */
export type Recency = 'day' | 'week' | 'month' | 'year';

/** The provider chain is a closed union so `SEARCH_PROVIDERS` is exhaustively checkable. */
export type SearchProviderId = 'exa' | 'parallel' | 'searxng' | 'marginalia' | 'duckduckgo' | 'tavily' | 'brave';

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  /** ISO-ish date string when the engine published one. Absent is normal, not an error. */
  publishedDate?: string;
}

export interface SearchRequest {
  query: string;
  limit: number;
  recency?: Recency;
  signal?: AbortSignal;
}

/** A provider returns sources or throws. It never returns a partial response — the chain owns the policy. */
export interface SearchProvider {
  id: SearchProviderId;
  label: string;
  /** False when the provider needs a credential this process does not have; the chain then skips it. */
  isAvailable(): boolean;
  search(req: SearchRequest): Promise<SearchSource[]>;
}

/** The normalised response the chain returns. `provider: 'none'` means every provider failed. */
export interface SearchResponse {
  provider: SearchProviderId | 'none';
  sources: SearchSource[];
  /** Constraint-relaxation notes and per-provider failures, rendered as `Note:` lines for the model. */
  notes: string[];
}

/** How the text was obtained. Surfaced in the tool header so a model can weigh a weak extraction. */
export type FetchMethod =
  | 'url-md'
  | 'content-negotiation'
  | 'reader'
  | 'jina'
  | 'json'
  | 'text'
  | 'raw-html'
  | 'failed';

export interface FetchOptions {
  signal?: AbortSignal;
  /** Hard ceiling on the returned text. Default `DEFAULT_MAX_FETCH_CHARS`. */
  maxChars?: number;
  timeoutMs?: number;
}

export interface FetchPage {
  url: string;
  /** The URL the response actually came from, after redirects. */
  finalUrl: string;
  contentType: string;
  method: FetchMethod;
  text: string;
  /** True when either the 500k hard cut or the caller budget cut the text. */
  truncated: boolean;
  notes: string[];
}