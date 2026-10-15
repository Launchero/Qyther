/**
 * The family→label table is only correct if the renderer still renders every label
 * it can produce. `AgentIndicator.tsx:22-23` does `if (!config) return null`, so a
 * label added here without a row there is a silent nothing — no error, no warning,
 * no failed test anywhere else.
 *
 * So this reads the renderer's own source, the same way `file-guard.test.ts` asserts
 * main's pattern list still equals preload's and
 * `langgraph/research-agent-registry.test.ts` bound a node table to the builder that
 * consumed it. A table nothing links to the renderer is how the old
 * `RESPONSE_NODE_SET` whitelists silently starved a node.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AGENT_LABELS } from "../../../shared/ipc/agent-label";
import {
  AGENT_LABEL_BY_FAMILY,
  IDLE_AGENT_LABEL,
  buildFamilyIndex,
  emittedAgentLabels,
  type NamedTool,
  type Toolboxes,
} from "./families";

const RENDERER_INDICATOR = "src/renderer/components/ask-mode/AgentIndicator.tsx";

const tool = (name: string): NamedTool => ({ name });

describe("family→agent-label table", () => {
  it("only emits labels the renderer actually has a row for", () => {
    for (const label of emittedAgentLabels()) {
      expect(AGENT_LABELS).toContain(label);
    }
  });

  it("every renderer label is reachable from some family or the idle fallback", () => {
    const emitted = new Set(emittedAgentLabels());
    for (const label of AGENT_LABELS) {
      expect(emitted).toContain(label);
    }
  });

  it("AgentIndicator still renders every label this module can emit", () => {
    const source = readFileSync(join(process.cwd(), RENDERER_INDICATOR), "utf8");
    // The map keys are the object-literal properties of AGENT_CONFIG.
    const configBlock = /const AGENT_CONFIG[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
    expect(configBlock, `${RENDERER_INDICATOR} must still declare AGENT_CONFIG`).not.toBeNull();

    const keys = [...(configBlock![1].matchAll(/^\s{2}(\w+):\s*\{/gm))].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);

    for (const label of emittedAgentLabels()) {
      expect(keys, `AgentIndicator has no AGENT_CONFIG row for "${label}"`).toContain(label);
    }
  });

  it("maps each family to a distinct capability label where one exists", () => {
    expect(AGENT_LABEL_BY_FAMILY.desktop).toBe("Desktop");
    expect(AGENT_LABEL_BY_FAMILY.browser).toBe("Browser");
    expect(AGENT_LABEL_BY_FAMILY.document).toBe("Document");
    expect(AGENT_LABEL_BY_FAMILY.web).toBe("Research");
    expect(AGENT_LABEL_BY_FAMILY.ui).toBe("Research");
    expect(AGENT_LABEL_BY_FAMILY.mcp).toBe("Research");
  });
});

describe("buildFamilyIndex", () => {
  const toolboxes: Toolboxes = {
    desktop: [tool("screenshot"), tool("click"), tool("launch_app")],
    browser: [tool("browser_snapshot"), tool("browser_click")],
    document: [tool("create_docx")],
    web: [tool("search_web"), tool("fetch_page")],
    ui: [tool("create_table"), tool("create_chart")],
    mcp: [tool("mcp_echo")],
  };

  it("resolves a tool name to its family's label", () => {
    const index = buildFamilyIndex(toolboxes);
    expect(index.labelFor("screenshot")).toBe("Desktop");
    expect(index.labelFor("browser_snapshot")).toBe("Browser");
    expect(index.labelFor("create_docx")).toBe("Document");
    expect(index.labelFor("search_web")).toBe("Research");
    expect(index.labelFor("create_table")).toBe("Research");
  });

  it("falls back to General for a name no toolbox contributed", () => {
    // A read-only prompt turn calls no tool at all, so this is the first-turn path,
    // not an error case. `General` is the label AgentIndicator always had and
    // nothing ever sent.
    expect(buildFamilyIndex(toolboxes).labelFor("nothing_matched_this")).toBe(IDLE_AGENT_LABEL);
    expect(IDLE_AGENT_LABEL).toBe("General");
  });

  it("reports the family behind a name, and undefined for an unknown one", () => {
    const index = buildFamilyIndex(toolboxes);
    expect(index.familyOf("create_docx")).toBe("document");
    expect(index.familyOf("nope")).toBeUndefined();
  });

  it("counts distinct names across every family", () => {
    // 3 desktop + 2 browser + 1 document + 2 web + 2 ui + 1 mcp
    expect(buildFamilyIndex(toolboxes).size).toBe(11);
  });

  it("reports which families contributed nothing", () => {
    const partial: Toolboxes = { ...toolboxes, mcp: [], ui: [] };
    expect(buildFamilyIndex(partial).emptyFamilies).toEqual(["ui", "mcp"]);
    expect(buildFamilyIndex(toolboxes).emptyFamilies).toEqual([]);
  });

  it("rejects the same tool name in two families instead of shadowing one", () => {
    // Mutation-checked: drop the `collisions.push` and this passes with a Map that
    // silently keeps the last writer, which is the bug — one family's tool is then
    // unreachable and the model gets the other without warning.
    expect(() =>
      buildFamilyIndex({
        ...toolboxes,
        document: [tool("search_web")],
      }),
    ).toThrow(/Duplicate tool names across families: search_web \(document \+ web\)/);
  });

  it("tolerates the same name repeated inside one family", () => {
    // Two `click` entries, so the count drops by one: screenshot and launch_app go,
    // click collapses. 11 distinct names become 9.
    const index = buildFamilyIndex({ ...toolboxes, desktop: [tool("click"), tool("click")] });
    expect(index.labelFor("click")).toBe("Desktop");
    expect(index.size).toBe(9);
  });
});