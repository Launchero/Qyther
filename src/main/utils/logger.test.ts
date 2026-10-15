import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSYSTEM_ENV_VARS } from './logger';

/**
 * The registry, not the docs, is what decides whether a subsystem can be switched on. An unregistered
 * name inherits `globalLevel`, which defaults to `error` in production (`logger.ts:41-49`), so its
 * `info`/`debug` lines never appear and no env switch can bring them back — a silent, permanent loss
 * of the only observability those modules have. Eighteen names shipped that way before this gate
 * existed, so the rule is derived from the call sites here rather than restated from prose.
 */
const CREATE_LOGGER = /createLogger\(\s*(['"])([A-Za-z0-9]+)\1\s*\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Every `createLogger('<name>')` in `src/`, mapped to the files that call it. */
function usedSubsystems(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of sourceFiles(join(process.cwd(), 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(CREATE_LOGGER)) {
      const name = match[2];
      const callers = used.get(name) ?? [];
      callers.push(file.slice(process.cwd().length + 1));
      used.set(name, callers);
    }
  }
  return used;
}

const used = usedSubsystems();

describe('logger subsystem registry', () => {
  it('finds call sites to gate against', () => {
    // Guards the gate: if the scan ever matches nothing, the two assertions below pass vacuously.
    expect(used.size).toBeGreaterThan(20);
  });

  it('registers every subsystem that createLogger is called with', () => {
    const unregistered = [...used.keys()].filter((name) => !(name in SUBSYSTEM_ENV_VARS));
    expect(unregistered).toEqual([]);
  });

  it('keeps no registry entry whose subsystem is gone', () => {
    const stale = Object.keys(SUBSYSTEM_ENV_VARS).filter((name) => !used.has(name));
    expect(stale).toEqual([]);
  });
});
