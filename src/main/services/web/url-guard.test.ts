import { describe, it, expect } from 'vitest';
import { checkFetchUrl, normalizeFetchUrl } from './url-guard';

describe('checkFetchUrl', () => {
  it('accepts ordinary http and https URLs', () => {
    expect(checkFetchUrl('https://example.com/docs').ok).toBe(true);
    expect(checkFetchUrl('http://example.com').ok).toBe(true);
  });

  it('rejects non-string and empty input', () => {
    expect(checkFetchUrl(undefined).ok).toBe(false);
    expect(checkFetchUrl('').ok).toBe(false);
    expect(checkFetchUrl('   ').ok).toBe(false);
  });

  it('rejects non-http protocols, including file: and javascript:', () => {
    for (const raw of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,<b>x', 'ftp://example.com']) {
      expect(checkFetchUrl(raw).ok).toBe(false);
    }
  });

  it('rejects embedded credentials', () => {
    const verdict = checkFetchUrl('https://user:pass@example.com/');
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/credentials/);
  });

  it('rejects loopback, private, CGNAT, link-local and metadata hosts', () => {
    const blocked = [
      'http://localhost:11434/v1',
      'http://app.localhost/',
      'http://127.0.0.1/',
      'http://0.0.0.0/',
      'http://10.1.2.3/',
      'http://172.16.0.5/',
      'http://192.168.1.1/admin',
      'http://100.64.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[fd00::1]/',
      'http://metadata.google.internal/',
    ];
    for (const raw of blocked) {
      expect(checkFetchUrl(raw).ok, raw).toBe(false);
    }
  });

  it('allows a public address in the same numeric neighbourhood as a blocked one', () => {
    expect(checkFetchUrl('http://172.32.0.1/').ok).toBe(true);
    expect(checkFetchUrl('http://11.0.0.1/').ok).toBe(true);
  });

  it('enforces a length ceiling', () => {
    expect(checkFetchUrl(`https://example.com/${'a'.repeat(2100)}`).ok).toBe(false);
  });
});

describe('normalizeFetchUrl', () => {
  it('repairs the shapes a model actually emits', () => {
    expect(normalizeFetchUrl('example.com')).toBe('https://example.com');
    expect(normalizeFetchUrl('  https://example.com ')).toBe('https://example.com');
    expect(normalizeFetchUrl('https:/example.com')).toBe('https://example.com');
    expect(normalizeFetchUrl('http://example.com/a')).toBe('http://example.com/a');
  });
});