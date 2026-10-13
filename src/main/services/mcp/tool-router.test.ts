// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getMCPToolsForIntent, detectRelevantTools } from './tool-router';

type Fake = { name: string };
const tools = (names: string[]): Fake[] => names.map(name => ({ name })) as unknown as Fake[];

// Tool names are shaped `{server}_{tool}` — the convention both mcp-adapters 1.x and the
// 2.x default produce. If a version changes that, these assertions must go red rather than
// let every routed agent silently receive zero tools.
const ALL = [
  'filesystem_read_file',
  'filesystem_write_file',
  'filesystem_list_directory',
  'sequential-thinking-think_thought',
  'sequential-thinking-list_thoughts',
  'browser_navigate',
  'browser_click',
  'unrelated_server_tool',
];

describe('getMCPToolsForIntent', () => {
  it('returns every filesystem tool for the research intent', () => {
    const matched = getMCPToolsForIntent('research', tools(ALL) as never);
    expect(matched.map(t => (t as unknown as Fake).name)).toEqual([
      'filesystem_read_file',
      'filesystem_write_file',
      'filesystem_list_directory',
    ]);
  });

  it('matches both the underscore and hyphen server-name spellings', () => {
    const matched = getMCPToolsForIntent('general', tools(ALL) as never);
    expect(matched).toHaveLength(2);
  });

  it('returns nothing for an intent that has no prefix entry', () => {
    expect(getMCPToolsForIntent('unknown-intent', tools(ALL) as never)).toEqual([]);
  });

  it('never silently drops all tools for a declared intent', () => {
    for (const intent of ['research', 'general', 'browser', 'desktop', 'document']) {
      expect(getMCPToolsForIntent(intent, tools(ALL) as never).length, intent).toBeGreaterThan(0);
    }
  });
});

describe('detectRelevantTools', () => {
  it('maps a file verb to the filesystem prefix', () => {
    expect(detectRelevantTools('please read the report.pdf')).toContain('filesystem');
  });

  it('maps a reasoning verb to the sequential thinking prefix', () => {
    expect(detectRelevantTools('analyze this step by step')).toContain('sequential_thinking');
  });

  it('maps a browsing verb to the browser prefix', () => {
    expect(detectRelevantTools('navigate to example.com')).toContain('browser_');
  });

  it('returns nothing for an unrelated query', () => {
    expect(detectRelevantTools('what is the capital of france')).toEqual([]);
  });
});
