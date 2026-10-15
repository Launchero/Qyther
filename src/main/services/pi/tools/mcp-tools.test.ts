// @vitest-environment node
/**
 * `mcp-tools.ts` imports production code only: `getMcpToolbox` runs against a
 * mocked `mcpService`, and the real `text` result builder via the fake tools.
 * `electron` is mocked because `toolbox.ts` imports `clipboard` at module scope.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  clipboard: { readText: vi.fn(), writeText: vi.fn(), clear: vi.fn() },
}));

vi.mock("../../mcp/client", () => ({
  mcpService: { isInitialized: vi.fn(), getTools: vi.fn() },
}));

import { Type } from "@earendil-works/pi-ai";
import { mcpService } from "../../mcp/client";
import { getMcpToolbox } from "./mcp-tools";
import { text, type PiTool } from "../toolbox";

const isInitialized = vi.mocked(mcpService.isInitialized);
const getTools = vi.mocked(mcpService.getTools);

function fakeMcpTool(name: string): PiTool {
  return {
    name,
    label: name,
    description: `${name} description`,
    parameters: Type.Object({}),
    async execute() {
      return text(`ran ${name}`, "complete");
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMcpToolbox", () => {
  it("returns an empty array, without throwing, when MCP is unconfigured", async () => {
    isInitialized.mockReturnValue(false);
    await expect(getMcpToolbox()).resolves.toEqual([]);
  });

  it("returns an empty array, without throwing, when the connection is unavailable", async () => {
    isInitialized.mockReturnValue(true);
    getTools.mockReturnValue([]);
    await expect(getMcpToolbox()).resolves.toEqual([]);

    getTools.mockImplementation(() => {
      throw new Error("connection lost");
    });
    await expect(getMcpToolbox()).resolves.toEqual([]);
  });

  it("keeps every non-browser tool and excludes the browser family prefix", async () => {
    isInitialized.mockReturnValue(true);
    getTools.mockReturnValue([
      fakeMcpTool("filesystem_read"),
      fakeMcpTool("browser_navigate"),
      fakeMcpTool("sequential_thinking"),
      fakeMcpTool("browser_snapshot"),
    ]);
    const tools = await getMcpToolbox();
    expect(tools.map((t) => t.name).sort()).toEqual(["filesystem_read", "sequential_thinking"]);
  });

  it("binds an empty family, not an error, when only browser tools are connected", async () => {
    isInitialized.mockReturnValue(true);
    getTools.mockReturnValue([fakeMcpTool("browser_navigate")]);
    await expect(getMcpToolbox()).resolves.toEqual([]);
  });

  it("every tool has a name and a parameters schema", async () => {
    isInitialized.mockReturnValue(true);
    getTools.mockReturnValue([fakeMcpTool("filesystem_read"), fakeMcpTool("time_now")]);
    const tools = await getMcpToolbox();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect((tool.parameters as { type?: string }).type).toBe("object");
    }
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });
});
