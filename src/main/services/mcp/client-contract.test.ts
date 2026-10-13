// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { MCPAdapter } from '@langchain/mcp-adapters';

// Drives the real adapter against this repo's own stdio MCP server (scripts/harness), so the
// client contract is proven without npx or network. The harness server refuses to launch or
// close the app, and listing tools touches no input, so this is safe to run headless.
const SERVER = join(process.cwd(), 'scripts', 'harness', 'mcp-server.mjs');
const VERBS = ['preflight', 'state', 'reveal', 'hide', 'click_at', 'type_text', 'set_mode', 'save_frame'];

function adapter(config: Record<string, unknown>) {
  return new MCPAdapter({
    servers: { harness: { transport: 'stdio', command: process.execPath, args: [SERVER] } },
    ...config,
  } as never);
}

describe('mcp-adapters 2.x client contract', () => {
  it('lists the servers own tool names when prefixing is disabled', async () => {
    const client = adapter({ prefixToolNameWithServerName: false });
    try {
      const names = (await client.listTools()).map(t => t.name);
      expect(names).toHaveLength(17);
      for (const verb of VERBS) expect(names).toContain(verb);
      expect(names.filter(n => n.startsWith('harness_'))).toHaveLength(0);
    } finally {
      await client.close?.();
    }
  }, 60_000);

  it('would rename tools by server key if prefixing were left on', async () => {
    // This is why both call sites pass prefixToolNameWithServerName: false. The browser
    // subtree selects tools with tool.name.startsWith('browser_') while its server key is
    // 'playwright', so default prefixing silently yields zero browser tools.
    const client = adapter({});
    try {
      const names = (await client.listTools()).map(t => t.name);
      expect(names.every(n => n.startsWith('harness_'))).toBe(true);
      expect(names).toContain('harness_preflight');
    } finally {
      await client.close?.();
    }
  }, 60_000);
});
