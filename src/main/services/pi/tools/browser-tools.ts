/**
 * Pi-native browser toolbox: the `browser` family (every `browser_*` tool).
 *
 * The shared `mcpService` connection already hands back Pi tools (`mcp/client.ts`
 * wraps each server's JSON Schema with `Type.Unsafe`), so this family is a **filter,
 * not a conversion** — a second wrapper layer would re-implement `mcp/client.ts`'s
 * work and add a second place for the never-throw contract to be re-stated.
 *
 * Contract, matching the desktop/web/ui families:
 * - tools never throw: an MCP failure (including arg validation, performed at call
 *   time) returns `fail(...)` for the model to read and recover from;
 * - every result carries `details.status`;
 * - an unavailable browser is an empty array, never a throw — an empty family is valid
 *   (`ask-prompt.ts` drops it from the prompt so the model is never told about a capability
 *   that has no tools). The single-connection rule is why: `mcpService` owns the Playwright
 *   stdio child, and a second connection here would be a second child process.
 */
import { mcpService } from "../../mcp/client";
import { createLogger } from "../../../utils/logger";
import type { PiTool } from "../toolbox";

const log = createLogger("Pi");

/** Server-native prefix. Never a count: the live server may expose more or fewer tools. */
const BROWSER_TOOL_PREFIX = "browser_";

/** The `browser` family: every `browser_*` tool on the shared connection, or `[]`. */
export async function getBrowserToolbox(): Promise<PiTool[]> {
  try {
    if (!mcpService.isInitialized()) return [];
    const tools = mcpService.getTools().filter((tool) => tool.name.startsWith(BROWSER_TOOL_PREFIX));
    if (tools.length === 0) return [];
    log.info(`Loaded ${tools.length} browser tools`);
    return tools;
  } catch (error) {
    log.warn("Browser toolbox unavailable, binding an empty family:", error);
    return [];
  }
}
