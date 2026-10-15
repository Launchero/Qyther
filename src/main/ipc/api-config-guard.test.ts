import { describe, it, expect, vi, beforeEach } from 'vitest';

import { checkBaseUrl } from './api-config-guard';

/**
 * `api-config:test` POSTs to a renderer-supplied `baseUrl` with the supplied key and returns part
 * of the response body; `api-config:save` persists a `baseUrl` that every later chat request uses
 * with the real key. Both therefore need the check in main, not preload. These tests drive the
 * production guard and the production registrar — no copies of the rule live here.
 */
const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, arg: unknown) => Promise<unknown>>(),
  writes: [] as string[],
  fetches: [] as string[],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, arg: unknown) => Promise<unknown>) => {
      hoisted.handlers.set(channel, fn);
    },
  },
  app: { getPath: () => '/tmp/qyther-test-userdata' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf-8'),
  },
}));

vi.mock('fs', () => ({
  existsSync: () => false,
  readFileSync: () => '',
  writeFileSync: (path: string) => {
    hoisted.writes.push(String(path));
  },
  unlinkSync: () => {},
}));

const { registerApiConfigHandlers } = await import('./api-config');

const METADATA = 'http://169.254.169.254/latest/meta-data';
const LOCAL_LLM = 'http://localhost:11434/v1';

beforeEach(() => {
  hoisted.handlers.clear();
  hoisted.writes.length = 0;
  hoisted.fetches.length = 0;
  registerApiConfigHandlers();
  vi.stubGlobal('fetch', async (input: unknown) => {
    hoisted.fetches.push(String(input));
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
  });
});

describe('checkBaseUrl', () => {
  it('accepts an https endpoint', () => {
    expect(checkBaseUrl('https://api.example.com/v1').ok).toBe(true);
  });

  it('accepts loopback, because a local OpenAI-compatible server is the point of the field', () => {
    for (const url of [LOCAL_LLM, 'http://127.0.0.1:8000/v1', 'http://[::1]:8000/v1']) {
      expect(checkBaseUrl(url), url).toMatchObject({ ok: true });
    }
  });

  it('rejects a non-empty string that is not an absolute http(s) URL', () => {
    for (const url of ['', '   ', 'not a url', '/v1', 'file:///C:/Windows/win.ini', 'ftp://example.com', 'http://']) {
      const verdict = checkBaseUrl(url);
      expect(verdict.ok, url).toBe(false);
      if (!verdict.ok) expect(verdict.reason.length, url).toBeGreaterThan(0);
    }
  });

  it('rejects a non-string payload outright', () => {
    for (const value of [undefined, null, 42, {}, ['http://localhost:11434/v1']]) {
      expect(checkBaseUrl(value).ok).toBe(false);
    }
  });

  it('rejects embedded credentials, which would carry a secret in the URL', () => {
    expect(checkBaseUrl('http://user:pass@example.com/v1').ok).toBe(false);
  });

  it('rejects link-local and cloud-metadata addresses', () => {
    for (const url of [METADATA, 'http://169.254.1.1/', 'http://metadata.google.internal/', 'http://[fe80::1]/v1']) {
      expect(checkBaseUrl(url), url).toMatchObject({ ok: false });
    }
  });

  it('rejects the fe80::/10 link-local range and nothing above it', () => {
    for (const host of ['fe80', 'fe90', 'fea0', 'feb0']) {
      expect(checkBaseUrl(`http://[${host}::1]/v1`).ok, host).toBe(false);
    }
    // fe80::/10 is the first ten bits, so fec0:: is a different block and must not be blocked.
    expect(checkBaseUrl('http://[fec0::1]/v1').ok).toBe(true);
  });
});

describe('api-config handlers enforce the guard in main', () => {
  const invoke = (channel: string, arg: unknown) =>
    hoisted.handlers.get(channel)!({ sender: { send: () => {} } }, arg);

  it('refuses to persist a metadata baseUrl instead of writing it', async () => {
    const result = await invoke('api-config:save', { apiKey: 'sk-test', baseUrl: METADATA, model: 'gpt' });

    expect(result).toMatchObject({ success: false });
    expect(hoisted.writes).toEqual([]);
  });

  it('still persists a legitimate custom endpoint', async () => {
    const result = await invoke('api-config:save', { apiKey: 'sk-test', baseUrl: LOCAL_LLM, model: 'gpt' });

    expect(result).toMatchObject({ success: true });
    expect(hoisted.writes).toHaveLength(1);
  });

  it('never puts the key on the wire for a rejected test URL', async () => {
    const result = await invoke('api-config:test', { apiKey: 'sk-secret', baseUrl: 'file:///etc/passwd', model: 'gpt' });

    expect(result).toMatchObject({ success: false });
    expect(hoisted.fetches).toEqual([]);
  });

  it('tests <baseUrl>/chat/completions when the URL is accepted', async () => {
    const result = await invoke('api-config:test', { apiKey: 'sk-test', baseUrl: `${LOCAL_LLM}/`, model: 'gpt' });

    expect(result).toMatchObject({ success: true });
    expect(hoisted.fetches).toEqual([`${LOCAL_LLM}/chat/completions`]);
  });
});
