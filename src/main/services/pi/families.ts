/**
 * Which agent a tool belongs to, and therefore which label the renderer shows.
 *
 * This replaces `langgraph/node-registry.ts`. That table existed because LangGraph
 * routed by node name and the pump had to know which nodes emit tokens; here there
 * is one agent and no nodes, and the only routing signal left is *which tool the
 * model reached for*. The label is derived from that, so `chat:agent-change` keeps
 * working and `AgentIndicator.tsx:22-23` never hits its `return null`.
 *
 * Deliberately Electron-free and Pi-free: it takes `{ name: string }` rather than
 * `PiTool`, because `toolbox.ts` imports `electron`'s `clipboard` at module scope and
 * `families.test.ts` needs to run without a mocked `electron`. Same reason
 * `abort.ts` and `command-guard.ts` exist.
 */
import { AGENT_LABELS, type AgentLabel } from "../../../shared/ipc/agent-label";

/** One toolbox, identified by the capability it serves. */
export type ToolFamily = "desktop" | "browser" | "document" | "web" | "ui" | "mcp";

/**
 * Canonical order. Drives `buildFamilyIndex`'s iteration, the collision message and
 * `emptyFamilies`, so it is declared once here rather than inferred from whatever object
 * literal a caller happened to build — `Object.entries` order would otherwise make a
 * duplicate-name message depend on key insertion order.
 */
export const TOOL_FAMILIES: readonly ToolFamily[] = [
  "desktop",
  "browser",
  "document",
  "web",
  "ui",
  "mcp",
];

/**
 * `ui` maps to `Research` on purpose: the generative-UI tools (`create_table`,
 * `create_comparison`, …) are how the answer is *rendered*, not a separate agent,
 * and the renderer's closed label set has no sixth label for them.
 */
export const AGENT_LABEL_BY_FAMILY: Record<ToolFamily, AgentLabel> = {
  desktop: "Desktop",
  browser: "Browser",
  document: "Document",
  web: "Research",
  ui: "Research",
  mcp: "Research",
};

/**
 * Shown while the agent has called no tool yet — which is the whole first turn, since
 * there is no classifier to announce a "Research" phase before the model acts. `General`
 * is the one label `AgentIndicator` already had a row for and nothing ever sent.
 */
export const IDLE_AGENT_LABEL: AgentLabel = "General";

/**
 * Structural minimum: a tool is its name for family routing, and its `label` for display.
 *
 * `label` is already declared by every toolbox (`toolbox.test.ts` asserts it is truthy for
 * all 32 desktop tools), so carrying it here costs no new bookkeeping. It exists on this
 * type because the renderer must not keep its own name→copy map: `ThinkingSteps.tsx` did
 * exactly that against the deleted graph's node names, and 39 of the 44 first-party tools
 * have been rendering their internal `snake_case` identifier ever since.
 */
export interface NamedTool {
  readonly name: string;
  readonly label?: string;
}

/**
 * A family with no entry, or an empty one, is legitimate — not every turn can bind every
 * capability. `ask-prompt.ts` drops empty families from the system prompt so the model is
 * never advertised a capability that has no tools, and `buildFamilyIndex` reports them in
 * `emptyFamilies` rather than treating their absence as a bug.
 */
export type Toolboxes = Readonly<Partial<Record<ToolFamily, readonly NamedTool[]>>>;

export interface FamilyIndex {
  /** The label to attribute a turn to. Unknown tool names fall back to `General`. */
  labelFor(toolName: string): AgentLabel;
  /**
   * The human-readable name declared on the tool, or `undefined` when no toolbox
   * contributed it. This is the only source of step copy the renderer may use.
   */
  displayLabelFor(toolName: string): string | undefined;
  /** `undefined` for a name no toolbox contributed. */
  familyOf(toolName: string): ToolFamily | undefined;
  /** Distinct tool names across every family. */
  readonly size: number;
  /** Families that contributed no tools, in declaration order. Empty is the healthy state. */
  readonly emptyFamilies: readonly ToolFamily[];
}

/**
 * Flatten the toolboxes into one name→family lookup.
 *
 * Throws on a duplicate name across families. That is not defensive paranoia: Pi
 * resolves a tool call by `name`, so two families offering `search_web` means one of
 * them is unreachable and the model gets whichever the loop registered last. The old
 * graph could hide the same class of bug behind node names, and it cost two hand-kept
 * whitelists to find out.
 */
export function buildFamilyIndex(toolboxes: Toolboxes): FamilyIndex {
  const byName = new Map<string, ToolFamily>();
  const displayByName = new Map<string, string>();
  const emptyFamilies: ToolFamily[] = [];
  const collisions: string[] = [];

  for (const family of TOOL_FAMILIES) {
    const tools = toolboxes[family] ?? [];
    if (tools.length === 0) {
      emptyFamilies.push(family);
      continue;
    }
    for (const tool of tools) {
      const existing = byName.get(tool.name);
      if (existing !== undefined && existing !== family) {
        collisions.push(`${tool.name} (${existing} + ${family})`);
        continue;
      }
      byName.set(tool.name, family);
      if (tool.label && tool.label.trim().length > 0) {
        displayByName.set(tool.name, tool.label.trim());
      }
    }
  }

  if (collisions.length > 0) {
    throw new Error(`Duplicate tool names across families: ${collisions.join(", ")}`);
  }

  const labelFor = (toolName: string): AgentLabel => {
    const family = byName.get(toolName);
    return family === undefined ? IDLE_AGENT_LABEL : AGENT_LABEL_BY_FAMILY[family];
  };

  return {
    labelFor,
    displayLabelFor: (toolName: string) => displayByName.get(toolName),
    familyOf: (toolName: string) => byName.get(toolName),
    size: byName.size,
    emptyFamilies,
  };
}

/**
 * The invariant `families.test.ts` pins: every label this module can emit is one the
 * renderer actually renders. Exported so the test reads the map rather than a copy.
 */
export function emittedAgentLabels(): AgentLabel[] {
  return [...new Set([...Object.values(AGENT_LABEL_BY_FAMILY), IDLE_AGENT_LABEL])];
}

export { AGENT_LABELS };
export type { AgentLabel };