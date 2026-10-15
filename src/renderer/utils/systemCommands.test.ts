import { describe, it, expect } from 'vitest';
import { tryCalculator, filterSystemCommands } from './systemCommands';

describe('tryCalculator', () => {
  it('evaluates basic arithmetic', () => {
    expect(tryCalculator('2+2')?.title).toBe('= 4');
    expect(tryCalculator('10 - 3')?.title).toBe('= 7');
    expect(tryCalculator('6*7')?.title).toBe('= 42');
    expect(tryCalculator('20/4')?.title).toBe('= 5');
  });

  it('supports precedence, parentheses and exponents', () => {
    expect(tryCalculator('2+3*4')?.title).toBe('= 14');
    expect(tryCalculator('(2+3)*4')?.title).toBe('= 20');
    expect(tryCalculator('2^10')?.title).toBe('= 1024');
  });

  it('supports common functions and constants', () => {
    expect(tryCalculator('sqrt(144)')?.title).toBe('= 12');
    expect(tryCalculator('abs(0-5)')?.title).toBe('= 5');
    expect(tryCalculator('pi*2')?.title).toBe('= 6.283185307');
  });

  it('copies the answer, not the expression, on execute', () => {
    const result = tryCalculator('2+2');
    expect(result?.action).toBe('clipboard-copy');
    expect(result?.metadata?.section).toBe('Calculator');
  });

  it('rejects file paths, drive letters and shell prefixes', () => {
    expect(tryCalculator('C:\\Windows\\System32')).toBeNull();
    expect(tryCalculator('C:')).toBeNull();
    expect(tryCalculator('> dir')).toBeNull();
    expect(tryCalculator('notes')).toBeNull();
    expect(tryCalculator('2048')).toBeNull();
  });

  it('rejects unsafe input instead of evaluating it', () => {
    expect(tryCalculator('2+process.exit()')).toBeNull();
    expect(tryCalculator('Math.max(1,2)')).toBeNull();
    expect(tryCalculator('1/0')).toBeNull();
  });
});

describe('filterSystemCommands', () => {
  it('returns a curated subset with no query', () => {
    const results = filterSystemCommands('');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.metadata?.section === 'System Commands')).toBe(true);
  });

  it('matches lock by keyword', () => {
    const results = filterSystemCommands('lock');
    expect(results.some((r) => r.id === 'sys-lock')).toBe(true);
  });

  it('exposes no empty-shell commands', () => {
    for (const r of filterSystemCommands('clipboard')) {
      expect(r.id).not.toBe('sys-clipboard');
    }
  });
});
