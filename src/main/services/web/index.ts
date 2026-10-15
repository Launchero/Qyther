/**
 * The web substrate: web search and URL fetching, with no Electron, no LangChain and no zod.
 *
 * Import from here, never from the individual files. The layering is the point:
 *
 *   url-guard  -> every outbound URL is checked here, and checked again after redirects
 *   query      -> one parse of the model's query, re-emitted per engine, re-applied as a post-filter
 *   search/*   -> the provider chain: first usable response wins, failures become notes
 *   fetch/*    -> URL to readable text: markdown sibling, content negotiation, reader chain, budgets
 *
 * The barrel exports the four functions a consumer calls and the types they need, plus the two
 * primitives a *test* imports directly. Everything else is module-internal on purpose: an export with
 * no caller is a promise nobody kept.
 */

export { searchWeb, formatSearchForModel } from './search';
export { fetchWebPage, formatFetchForModel, MAX_RENDERED_CHARS, DEFAULT_MAX_FETCH_CHARS } from './fetch';
export { checkFetchUrl } from './url-guard';
export { isUsableReaderOutput, htmlToMarkdown } from './html';
export { parseSearchQuery, formatQuery, applyQueryConstraints } from './query';

export type { SearchOptions } from './search';
export type { ParsedQuery, EngineSyntax } from './query';
export type {
  FetchMethod,
  FetchOptions,
  FetchPage,
  Recency,
  SearchProvider,
  SearchProviderId,
  SearchRequest,
  SearchResponse,
  SearchSource,
} from './types';