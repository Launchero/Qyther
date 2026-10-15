/**
 * The provider registry. The array order IS the chain order — there is no second priority list, which
 * is the whole point: the chain and the registry cannot drift.
 *
 * Order is live-verified, not assumed. See `AGENTS.md` for what each rung is worth and what happens
 * when it stops answering: the keyless MCP endpoints answer from any IP, the HTML engines are the ones
 * that get rate-limited, captcha-walled or served a result-less shell.
 */

import type { SearchProvider } from '../types';
import { exaProvider } from './exa';
import { parallelProvider } from './parallel';
import { searxngProvider } from './searxng';
import { marginaliaProvider } from './marginalia';
import { duckduckgoProvider } from './duckduckgo';
import { tavilyProvider } from './tavily';
import { braveProvider } from './brave';

export const SEARCH_PROVIDERS: readonly SearchProvider[] = [
  exaProvider,
  parallelProvider,
  searxngProvider,
  marginaliaProvider,
  duckduckgoProvider,
  tavilyProvider,
  braveProvider,
];