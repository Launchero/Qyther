import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isSafeSearchQuery, isUsablePath, SEARCH_QUERY_METACHARACTERS, MAX_SEARCH_QUERY_LENGTH } from './file-guard';

/**
 * `command-guard.ts` exists because a rule that lives only in the preload layer is not a boundary —
 * the renderer can invoke a channel directly. `file:search` and `file:revealInFolder` were the last
 * two channels in that shape. These tests drive the production guard, and the preload-equivalence
 * check is what keeps the duplicated list (the sandboxed preload cannot import `src/main`) honest.
 */
const relative = (...parts: string[]) => join(process.cwd(), ...parts);

describe('isSafeSearchQuery', () => {
  it('accepts ordinary search terms', () => {
    for (const query of ['report', 'quarterly report.pdf', 'C:\\notes\\todo.txt', 'a'.repeat(MAX_SEARCH_QUERY_LENGTH)]) {
      expect(isSafeSearchQuery(query), query).toBe(true);
    }
  });

  it('rejects every shell metacharacter the preload layer rejects', () => {
    for (const pattern of SEARCH_QUERY_METACHARACTERS) {
      expect(isSafeSearchQuery(`report ${pattern} del /s C:\\`), pattern).toBe(false);
    }
  });

  it('rejects empty, oversized, embedded-NUL and non-string payloads', () => {
    expect(isSafeSearchQuery('')).toBe(false);
    expect(isSafeSearchQuery('a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1))).toBe(false);
    expect(isSafeSearchQuery('report\0 && echo')).toBe(false);
    for (const value of [undefined, null, 42, {}, ['report']]) {
      expect(isSafeSearchQuery(value)).toBe(false);
    }
  });
});

describe('isUsablePath', () => {
  it('accepts drive, UNC and POSIX paths', () => {
    for (const path of ['C:\\Users\\me\\doc.pdf', '\\\\server\\share\\file.txt', '/home/me/doc.txt']) {
      expect(isUsablePath(path), path).toBe(true);
    }
  });

  it('rejects empty, oversized, embedded-NUL, interior-escape and non-string payloads', () => {
    expect(isUsablePath('')).toBe(false);
    expect(isUsablePath('a'.repeat(1001))).toBe(false);
    expect(isUsablePath('C:\\a\\b\0.txt')).toBe(false);
    expect(isUsablePath('C:\\a\\\\..\\\\b')).toBe(false);
    for (const value of [undefined, null, 7, {}]) {
      expect(isUsablePath(value)).toBe(false);
    }
  });
});

describe('the rule is not declared two ways', () => {
  it('matches the preload copy of the metacharacter list exactly', () => {
    const preload = readFileSync(relative('src', 'preload', 'preload.ts'), 'utf8');
    // preload declares two arrays with the same name — the `command:execute` keyword blocklist and
    // the `file:search` metacharacter list. Select by content, not by name.
    const declared = [...preload.matchAll(/const dangerousPatterns = \[([^\]]*)\]/g)]
      .map((match) => match[1]);
    const metacharDecl = declared.find((body) => body.includes('&&'));
    expect(metacharDecl, 'preload.ts has no metacharacter list to compare against').toBeDefined();

    const preloadPatterns = metacharDecl!
      .split(',')
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    expect(preloadPatterns.sort()).toEqual([...SEARCH_QUERY_METACHARACTERS].sort());
  });

  it('is consulted by every file channel that needs it', () => {
    const handlers = readFileSync(relative('src', 'main', 'ipc', 'handlers.ts'), 'utf8');

    expect(handlers).toContain('if (!isSafeSearchQuery(query))');
    expect(handlers).toContain('if (!isUsablePath(path))');
    // The unguarded form: shell.showItemInFolder must never be reached without the check above it.
    const revealHandler = handlers.slice(
      handlers.indexOf("ipcMain.handle('file:revealInFolder'"),
      handlers.indexOf("ipcMain.handle('apps:list'"),
    );
    expect(revealHandler).toContain('isUsablePath(path)');
    expect(revealHandler).toContain('shell.showItemInFolder(path)');
  });
});
