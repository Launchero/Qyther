import type { PiTool } from "../pi/toolbox";
import { createLogger } from "../../utils/logger";

const log = createLogger('MCPRouter');

type MCPTool = PiTool;

/**
 * Maps intent names to MCP tool name prefixes.
 * Each prefix corresponds to an MCP server's tool naming convention.
 */
const INTENT_TOOL_MAP: Record<string, string[]> = {
  research: ["filesystem"],
  general: ["sequential_thinking", "sequential-thinking"],
  browser: ["browser_"],
  desktop: ["filesystem"],
  document: ["filesystem"],
};

/**
 * Keyword-based detection for routing MCP tools based on query content.
 */
const KEYWORD_TOOL_MAP: { keywords: RegExp[]; prefixes: string[] }[] = [
  {
    keywords: [
      /\b(read|write|open|save|list|file|directory|folder|path|document|pdf|excel|spreadsheet)\b/i,
    ],
    prefixes: ["filesystem"],
  },
  {
    keywords: [
      /\b(think|reason|analyze|compare|evaluate|step.?by.?step|complex|multi.?part|consider)\b/i,
    ],
    prefixes: ["sequential_thinking", "sequential-thinking"],
  },
  {
    keywords: [
      /\b(browse|navigate|visit|website|web page|url|search the web|screenshot)\b/i,
    ],
    prefixes: ["browser_"],
  },
];

/**
 * Filter MCP tools by intent name using server name prefixes.
 */
export function getMCPToolsForIntent(
  intent: string,
  allTools: MCPTool[]
): MCPTool[] {
  const prefixes = INTENT_TOOL_MAP[intent];
  if (!prefixes || prefixes.length === 0) return [];

  const matched = allTools.filter(tool => {
    const name = tool.name ?? "";
    return prefixes.some(p =>
      name.startsWith(p) || name.includes(p.replace("_", "-")) || name.includes(p.replace("-", "_"))
    );
  });

  log.debug(`Intent "${intent}" → ${matched.length} tool(s): ${matched.map(t => t.name).join(", ")}`);
  return matched;
}

/**
 * Detect relevant MCP tools from query content using keyword matching.
 */
export function detectRelevantTools(query: string): string[] {
  const matched: string[] = [];

  for (const rule of KEYWORD_TOOL_MAP) {
    const hasKeyword = rule.keywords.some(r => r.test(query));
    if (hasKeyword) {
      matched.push(...rule.prefixes);
    }
  }

  return [...new Set(matched)];
}
