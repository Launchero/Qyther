// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

// `client.ts` pulls `electron` at module scope through `preferences` (which
// reads `app.getPath`) and `pi/toolbox` (which reads `clipboard`), so both
// are mocked — the same reason `pi/tools/browser-tools.test.ts` mocks it.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "mock-user-data") },
  clipboard: { readText: vi.fn(), writeText: vi.fn(), clear: vi.fn() },
}));

vi.mock("../../preferences", () => ({ loadPreferences: vi.fn() }));

import { loadPreferences } from "../../preferences";
import { MCPService } from "./client";

// Drives the real pi-mcp client against this repo's own stdio MCP server
// (scripts/harness), so the client contract is proven without npx or network.
// The harness server refuses to launch or close the app, and listing tools
// touches no input, so this is safe to run headless.
const SERVER = join(process.cwd(), 'scripts', 'harness', 'mcp-server.mjs');
const VERBS = ['preflight', 'state', 'reveal', 'hide', 'click_at', 'click_role', 'type_text', 'set_mode', 'save_frame'];

const mockedPrefs = vi.mocked(loadPreferences);

function prefsWithHarness() {
  mockedPrefs.mockReturnValue({
    mcp: {
      enabled: true,
      servers: [{ name: "harness", type: "stdio", command: process.execPath, args: [SERVER], enabled: true }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pi-mcp client contract', () => {
  it('lists the server native tool names as Pi tools', async () => {
    prefsWithHarness();
    const service = new MCPService();
    try {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
      const tools = service.getTools();
      const names = tools.map(t => t.name);
      expect(names).toHaveLength(18);
      for (const verb of VERBS) expect(names).toContain(verb);
      // pi-mcp has no server-key prefixing, so names always arrive exactly as
      // the server emits them — the adapter-era `prefixToolNameWithServerName`
      // footgun this replaced has no equivalent to misconfigure.
      expect(names.filter(n => n.startsWith('harness_'))).toHaveLength(0);
      for (const tool of tools) {
        expect(typeof tool.description).toBe("string");
        expect(typeof tool.execute).toBe("function");
        expect((tool.parameters as { type?: string }).type).toBe("object");
      }
      expect(service.getServerNames()).toEqual(["harness"]);
      expect(service.getServerToolCounts().get("harness")).toBe(18);
    } finally {
      await service.cleanup();
    }
  }, 60_000);

  it('a failing server connection rejects and orphans no handle', async () => {
    mockedPrefs.mockReturnValue({
      mcp: {
        enabled: true,
        servers: [{ name: "bogus", type: "stdio", command: "definitely-not-a-real-binary-qyther-test", args: [], enabled: true }],
      },
    });
    const service = new MCPService();
    await expect(service.initialize()).rejects.toThrow();
    // Nothing parked: a retry (or the next boot) starts from a clean slate,
    // and cleanup after a failure is a safe no-op — the stdio child of the
    // failed attempt was closed while unwinding, not left for the next
    // `initialize()` to overwrite.
    expect(service.isInitialized()).toBe(false);
    expect(service.getTools()).toEqual([]);
    expect(service.getServerNames()).toEqual([]);
    expect(service.getServerToolCounts().size).toBe(0);
    await expect(service.cleanup()).resolves.toBeUndefined();
    expect(service.isInitialized()).toBe(false);
  }, 60_000);

  it('tools never throw — a tool call resolves even with garbage args', async () => {
    prefsWithHarness();
    const service = new MCPService();
    try {
      await service.initialize();
      const tool = service.getTools().find(t => t.name === "who");
      expect(tool).toBeDefined();
      const result = await tool!.execute("t1", { bogusArg: 123 });
      expect(result.details.status).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    } finally {
      await service.cleanup();
    }
  }, 60_000);
});
