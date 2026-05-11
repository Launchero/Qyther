import { describe, it, expect } from 'vitest';

describe('URL Validation Logic', () => {
  const ALLOWED_PROTOCOLS = ['http:', 'https:'];

  function validateUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url);
      if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return { valid: false, error: 'Invalid URL protocol' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  it('allows http URLs', () => {
    expect(validateUrl('http://example.com').valid).toBe(true);
  });

  it('allows https URLs', () => {
    expect(validateUrl('https://example.com').valid).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(validateUrl('javascript:alert(1)').valid).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(validateUrl('file:///etc/passwd').valid).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(validateUrl('data:text/html,<script>alert(1)</script>').valid).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateUrl('not-a-url').valid).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(validateUrl('').valid).toBe(false);
  });
});

describe('Path Validation Logic', () => {
  function validatePath(path: string): { valid: boolean; error?: string } {
    if (!path || typeof path !== 'string' || path.length > 1000) {
      return { valid: false, error: 'Invalid path' };
    }
    if (path.includes('\\\\') && !path.startsWith('\\\\')) {
      return { valid: false, error: 'Invalid path' };
    }
    return { valid: true };
  }

  it('allows normal Windows paths', () => {
    expect(validatePath('C:\\Users\\test\\file.txt').valid).toBe(true);
  });

  it('allows UNC paths', () => {
    expect(validatePath('\\\\server\\share\\file.txt').valid).toBe(true);
  });

  it('rejects paths with double backslash in middle', () => {
    expect(validatePath('C:\\Users\\\\\\file.txt').valid).toBe(false);
  });

  it('rejects empty paths', () => {
    expect(validatePath('').valid).toBe(false);
  });

  it('rejects overly long paths', () => {
    expect(validatePath('a'.repeat(1001)).valid).toBe(false);
  });
});

describe('Command Security Patterns', () => {
  const DANGEROUS_PATTERNS = ['rm -rf', 'del /s', 'format', 'shutdown'];

  function isCommandSafe(command: string): boolean {
    const lower = command.toLowerCase();
    return !DANGEROUS_PATTERNS.some(pattern => lower.includes(pattern));
  }

  it('allows safe commands', () => {
    expect(isCommandSafe('dir')).toBe(true);
    expect(isCommandSafe('echo hello')).toBe(true);
    expect(isCommandSafe('ping localhost')).toBe(true);
  });

  it('blocks rm -rf', () => {
    expect(isCommandSafe('rm -rf /')).toBe(false);
  });

  it('blocks del /s', () => {
    expect(isCommandSafe('del /s /q C:\\')).toBe(false);
  });

  it('blocks format', () => {
    expect(isCommandSafe('format C:')).toBe(false);
  });

  it('blocks shutdown', () => {
    expect(isCommandSafe('shutdown /s')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isCommandSafe('RM -RF /')).toBe(false);
    expect(isCommandSafe('SHUTDOWN /r')).toBe(false);
  });
});
