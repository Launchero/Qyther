// @vitest-environment node
/**
 * Imports production code throughout: every factory and the `createPiUiToolbox`
 * assembly. `electron` is mocked because `toolbox.ts` imports `clipboard` at
 * module scope — the same reason `toolbox.test.ts` and `cancel.test.ts` mock it.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  clipboard: { readText: vi.fn(), writeText: vi.fn(), clear: vi.fn() },
}));

import type { TextContent } from "@earendil-works/pi-ai";
import { GENERATIVE_UI_TYPES } from "../../../../shared/ipc/ui-payload";
import {
  createChartTool,
  createComparisonTool,
  createFormTool,
  createListTool,
  createPiUiToolbox,
  createTableTool,
} from "./ui-tools";

const TOOL_NAMES = ["create_table", "create_form", "create_comparison", "create_chart", "create_list"];

function validParams(name: string): Record<string, unknown> {
  switch (name) {
    case "create_table":
      return { title: "T", columns: [{ key: "a", label: "A" }], rows: [{ a: "x" }] };
    case "create_form":
      return { title: "F", fields: [{ name: "n", label: "N", type: "text", value: "v" }] };
    case "create_comparison":
      return {
        title: "C",
        criteria: [{ key: "speed", label: "Speed" }],
        items: [{ name: "A", attributes: [{ key: "speed", value: "fast" }] }],
      };
    case "create_chart":
      return { title: "R", chartType: "bar", data: [{ name: "Q1", value: 3 }] };
    default:
      return { title: "L", items: ["one", "two"] };
  }
}

function bodyOf(result: { content: Array<{ type: string }> }): string {
  return (result.content[0] as TextContent).text;
}

describe("Pi UI toolbox", () => {
  it("exposes exactly the five generative-UI tools, with no duplicates", () => {
    const tools = createPiUiToolbox();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it("carries one distinct generative-UI type per tool", async () => {
    const tools = createPiUiToolbox();
    const types = [];
    for (const tool of tools) {
      const result = await tool.execute("1", validParams(tool.name));
      const payload = result.details.uiPayload;
      expect(payload?.node).toBe("ui");
      expect(typeof payload?.title).toBe("string");
      types.push(payload?.type);
    }
    expect([...types].sort()).toEqual([...GENERATIVE_UI_TYPES].sort());
  });

  it("never throws — a missing required argument is an isError result", async () => {
    for (const tool of createPiUiToolbox()) {
      const result = await tool.execute("1", {});
      expect(result.isError, tool.name).toBe(true);
      expect(bodyOf(result).length, tool.name).toBeGreaterThan(0);
    }
  });

  it("strips non-finite numbers out of the chart series", async () => {
    const tool = createChartTool();
    const result = await tool.execute("1", {
      title: "R",
      chartType: "bar",
      data: [
        { name: "ok", value: 3 },
        { name: "nan", value: NaN },
        { name: "inf", value: Infinity },
        { name: "neginf", value: -Infinity },
        { name: "str", value: "7" },
      ],
    });
    const series = (result.details.uiPayload?.data as Record<string, unknown>)["data"] as Array<{ value: number }>;
    expect(series).toEqual([{ name: "ok", value: 3 }]);
  });

  it("fails a chart with no plottable values instead of shipping an empty payload", async () => {
    const result = await createChartTool().execute("1", {
      chartType: "pie",
      data: [{ name: "nan", value: NaN }],
    });
    expect(result.isError).toBe(true);
  });

  it("produces a list payload — the branch that never had a producer", async () => {
    const result = await createListTool().execute("1", { title: "Steps", items: ["one", "two"] });
    expect(result.details.uiPayload?.type).toBe("list");
    expect(result.details.uiPayload?.data).toEqual(["one", "two"]);
  });

  it("carries details.status on every success and every failure", async () => {
    const singles = [createTableTool(), createFormTool(), createComparisonTool(), createChartTool(), createListTool()];
    for (const tool of singles) {
      const ok = await tool.execute("1", validParams(tool.name));
      expect(ok.details.status, `${tool.name} ok`).toBe("complete");
      const bad = await tool.execute("1", {});
      expect(typeof bad.details.status, `${tool.name} fail`).toBe("string");
    }
  });
});
