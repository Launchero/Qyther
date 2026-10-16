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
import { createPiWebToolbox } from "./tools/web-tools";
import { createPiUiToolbox } from "./tools/ui-tools";

const RENDERER_INDICATOR = "src/renderer/components/ask-mode/AgentIndicator.tsx";

const tool = (name: string, label?: string): NamedTool => ({ name, label });

describe("tool display labels", () => {
  it("returns the label declared on the tool, and undefined when there is none", () => {
    const index = buildFamilyIndex({
      desktop: [tool("launch_app", "Launch app"), tool("no_label_tool")],
    });

    expect(index.displayLabelFor("launch_app")).toBe("Launch app");
    expect(index.displayLabelFor("no_label_tool")).toBeUndefined();
    expect(index.displayLabelFor("not_a_tool")).toBeUndefined();
  });

  it("every real first-party tool declares a label the transcript can show", () => {
    // This is the gate that would have caught the shipped defect: `ThinkingSteps.tsx`
    // keyed its copy on deleted graph-node names and the bridge translated only five
    // tool names, so 39 of 44 tools rendered their internal identifier. Nothing failed.
    // The desktop family's 32 are already frozen by `toolbox.test.ts` asserting a truthy
    // `label` per tool, so this sweeps the families that were not covered.
    const families = [
      ["web", createPiWebToolbox()],
      ["ui", createPiUiToolbox()],
    ] as const;

    for (const [name, tools] of families) {
      expect(tools.length, `${name} toolbox is empty`).toBeGreaterThan(0);
      for (const t of tools) {
        expect(t.label, `${name}.${t.name} label`).toBeTruthy();
        expect(t.label!.trim().length, `${name}.${t.name} label is whitespace`).toBeGreaterThan(0);
        // A label equal to the name is not a label — it renders the identifier anyway.
        expect(t.label!.trim(), `${name}.${t.name} label duplicates its name`).not.toBe(t.name);
      }
    }
  });
});

describe("step copy is derived, never mirrored", () => {
  const THINKING_STEPS = "src/renderer/components/ask-mode/ThinkingSteps.tsx";
  const ASK_EVENTS = "src/main/services/pi/ask-events.ts";

  it("the transcript holds no tool-name→copy map and no graph-node vocabulary", () => {
    const source = readFileSync(join(process.cwd(), THINKING_STEPS), "utf8");

    for (const banned of ["PHASE_LABELS", "LOADING_MESSAGES", "PHASE_ORDER", "STEP_NAME_BY_TOOL"]) {
      expect(source, `${THINKING_STEPS} still declares ${banned}`).not.toContain(`const ${banned}`);
    }
    // Every surviving identifier-shaped string is a name list waiting to drift.
    expect(source).not.toMatch(/step\.step === '[a-z_]+Node'/);
  });

  it("the bridge translates no tool names onto legacy step strings", () => {
    const source = readFileSync(join(process.cwd(), ASK_EVENTS), "utf8");

    expect(source, `${ASK_EVENTS} reintroduced a name→step map`).not.toContain("STEP_NAME_BY_TOOL");
    expect(source).not.toMatch(/"(externalSearch|webFetch|comparisonNode|formNode|chartNode)"/);
  });
});

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