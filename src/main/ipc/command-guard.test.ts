import { describe, expect, it } from 'vitest';
import { DANGEROUS_COMMAND_PATTERNS, isCommandSafe } from './command-guard';

/**
 * The first test in this repo that imports production code. `handlers.test.ts`
 * re-declares its own validators and therefore proves nothing about the shipped
 * surface — see `src/main/ipc/AGENTS.md`.
 */
describe('command-guard: isCommandSafe', () => {
  it('carries exactly the four patterns the preload layer has always carried', () => {
    expect(DANGEROUS_COMMAND_PATTERNS).toEqual(['rm -rf', 'del /s', 'format', 'shutdown']);
  });

  it.each(DANGEROUS_COMMAND_PATTERNS)('blocks each listed pattern: %s', (pattern) => {
    expect(isCommandSafe(`some-tool ${pattern} anything`)).toBe(false);
  });

  it('blocks regardless of case', () => {
    expect(isCommandSafe('RM -RF ./x')).toBe(false);
    expect(isCommandSafe('SHUTDOWN /s /t 0')).toBe(false);
  });

  it('blocks a pattern embedded anywhere in the string', () => {
    expect(isCommandSafe('powershell -Command "Write-Host hi; del /s C:\\tmp"')).toBe(false);
  });

  it.each([
    'npm run typecheck',
    'ipconfig',
    'node --version',
    'Get-Process | Select-Object Name',
  ])('allows an ordinary command: %s', (command) => {
    expect(isCommandSafe(command)).toBe(true);
  });

  it.each([[undefined], [null], [''], [42], [{ delete: true }]])('rejects a non-string %s', (value) => {
    expect(isCommandSafe(value)).toBe(false);
  });
});
