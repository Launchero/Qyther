// @vitest-environment node
/**
 * `browser-tools.ts` is a filter over the shared MCP connection, so this file asserts
 * exactly that and nothing more. The contracts that used to be asserted here — a tool
 * never throws, every result carries `details.status`, an abort reads as text — now live
 * one layer down in `mcp/client.ts`'s `toPiTool` (the browser family returns those Pi
 * tools unchanged), and `../../mcp/client-contract.test.ts` imports production code to
 * hold them. Re-asserting them here would be a gate on a copy.
 *
 * `electron` is mocked because `toolbox.ts` imports `clipboard` at module scope; no
 * `Agent` is constructed, and the live Playwright session stays uncovered here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  clipboard: { readText: vi.fn(), writeText: vi.fn(), clear: vi.fn() },
}));

vi.mock("../../mcp/client", () => ({
  mcpService: { isInitialized: vi.fn(), getTools: vi.fn() },
}));

import { mcpService } from "../../mcp/client";
import { getBrowserToolbox } from "./browser-tools";
import type { PiTool } from "../toolbox";
import { statefulBrowserAgent } from "../../browser/stateful-browser-agent";

const isInitialized = vi.mocked(mcpService.isInitialized);
const getTools = vi.mocked(mcpService.getTools);

/** The shape `mcpService.getTools()` really returns: already-Pi tools. */
function fakePiTool(name: string): PiTool {
  return {
    name,
    label: name,
    description: `${name} description`,
    parameters: { type: "object", properties: {} } as PiTool["parameters"],
    async execute() {
      return { content: [{ type: "text", text: `ran ${name}` }], details: { status: "complete" as const } };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("browser toolbox surface", () => {
  it("exports getBrowserToolbox", () => {
    expect(typeof getBrowserToolbox).toBe("function");
  });

  it("keeps the stateful agent's public surface intact", () => {
    for (const method of [
      "initialize",
      "isReady",
      "createSession",
      "executeTask",
      "getMcpTools",
      "closeSession",
      "cleanup",
      "extractAllLinks",
      "requiresBrowserAutomation",
      "executeTaskStream",
    ] as const) {
      expect(typeof statefulBrowserAgent[method], method).toBe("function");
    }
  });
});

describe("getBrowserToolbox", () => {
  it("returns an empty array, without throwing, when the browser is unavailable", async () => {
    isInitialized.mockReturnValue(false);
    await expect(getBrowserToolbox()).resolves.toEqual([]);

    isInitialized.mockReturnValue(true);
    getTools.mockReturnValue([]);
    await expect(getBrowserToolbox()).resolves.toEqual([]);

    getTools.mockImplementation(() => {
      throw new Error("connection lost");
    });
    await expect(getBrowserToolbox()).resolves.toEqual([]);
  });

  it("keeps only browser_ tools and drops every other family", async () => {
    isInitialized.mockReturnValue(true);
    getTools.mockReturnValue([
      fakePiTool("browser_navigate"),
      fakePiTool("browser_snapshot"),
      fakePiTool("filesystem_read"),
      fakePiTool("mcp_search"),
    ]);

    const tools = await getBrowserToolbox();
    expect(tools.map((t) => t.name).sort()).toEqual(["browser_navigate", "browser_snapshot"]);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it("hands back the very objects the connection produced — no re-wrap", async () => {
    isInitialized.mockReturnValue(true);
    const navigate = fakePiTool("browser_navigate");
    const snapshot = fakePiTool("browser_snapshot");
    getTools.mockReturnValue([navigate, snapshot, fakePiTool("filesystem_read")]);

    const tools = await getBrowserToolbox();
    // Identity is the point: a wrapper would hand back a different object with the same
    // name, and the never-throw contract would then be re-stated in two places.
    expect(tools).toContain(navigate);
    expect(tools).toContain(snapshot);
    expect(tools).toHaveLength(2);
  });

  it("does not prefix or rename server-native tool names", async () => {
    isInitialized.mockReturnValue(true);
    getTools.mockReturnValue([fakePiTool("browser_navigate")]);

    const [tool] = await getBrowserToolbox();
    expect(tool.name).toBe("browser_navigate");
  });
});
