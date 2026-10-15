/**
 * Pi-native MCP toolbox: the `mcp` family (every non-browser MCP tool).
 *
 * Thin Pi view over the already-connected shared `mcpService` connection from
 * `services/mcp/client.ts`. The tools arrive as `PiTool`s, so there is no
 * conversion here — only the family split: `browser_*` tools belong to the
 * `browser` family (`getBrowserToolbox`), and this family takes everything
 * else. The split is load-bearing, not cosmetic: `buildFamilyIndex` throws on
 * a name claimed by two families, so including `browser_*` here would break
 * every Ask turn the moment a Playwright server is configured.
 *
 * Contract, matching the desktop/web/ui/browser families:
 * - tools never throw: conversion and execution failures stay inside
 *   `mcpService`'s Pi tools as readable results;
 * - an unconfigured or unavailable MCP layer is an empty array, never a throw
 *   — an empty family is valid (`ask-prompt.ts` drops it from the prompt so
 *   the model is never told about a capability that has no tools). The
 *   single-connection rule is why: `mcpService` owns every MCP stdio child,
 *   and a second connection here would be a second child process.
 */
import { mcpService } from "../../mcp/client";
import { createLogger } from "../../../utils/logger";
import type { PiTool } from "../toolbox";

const log = createLogger("Pi");

/** Server-native prefix claimed by the `browser` family. Never a count. */
const BROWSER_TOOL_PREFIX = "browser_";

/** The `mcp` family: every shared-connection tool outside `browser_*`, or `[]`. */
export async function getMcpToolbox(): Promise<PiTool[]> {
  try {
    if (!mcpService.isInitialized()) return [];
    const tools = mcpService.getTools().filter((tool) => !tool.name.startsWith(BROWSER_TOOL_PREFIX));
    if (tools.length > 0) log.info(`Loaded ${tools.length} MCP tools`);
    return tools;
  } catch (error) {
    log.warn("MCP toolbox unavailable, binding an empty family:", error);
    return [];
  }
}
