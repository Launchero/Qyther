// @vitest-environment node
/**
 * `ask-events.ts` imports `PiToolDetails` and `FamilyIndex` with `import type` only, so
 * nothing here loads `electron` — this file runs in a plain node environment and still
 * drives the real translator. That is deliberate: the translator is the whole replacement
 * for the `streamEvents` demux in `ipc/chat-handlers.ts`, so it has to be testable without
 * standing up an Electron main process.
 */
import { describe, it, expect } from "vitest";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";

import { AskEventTranslator, type AskStreamEvent } from "./ask-events";
import { buildFamilyIndex, IDLE_AGENT_LABEL, type Toolboxes } from "./families";
import type { UiPayload } from "../../../shared/ipc/ui-payload";

const TOOLBOXES: Toolboxes = {
  desktop: [{ name: "screenshot", label: "Capture the screen" }, { name: "click", label: "Click" }],
  browser: [{ name: "browser_click" }],
  document: [{ name: "create_docx", label: "Create Word document" }],
  web: [{ name: "search_web", label: "Search the web" }, { name: "fetch_page", label: "Read a page" }],
  ui: [{ name: "create_table", label: "Create table" }, { name: "create_chart", label: "Create chart" }, { name: "create_list" }],
  mcp: [{ name: "mcp_echo" }],
};

const translator = () => new AskEventTranslator(buildFamilyIndex(TOOLBOXES));

/** Same honest partial-message fixture `events.test.ts` uses, for the same reason. */
const partial: AssistantMessage = {
  role: "assistant",
  content: [],
  api: "openai-completions",
  provider: "qyther",
  model: "qwen3.6-plus",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop",
  timestamp: 0,
};

const token = (delta: string): AgentEvent =>
  ({
    type: "message_update",
    message: partial,
    assistantMessageEvent: { type: "text_delta", delta, contentIndex: 0, partial },
  }) as unknown as AgentEvent;

const toolStart = (toolName: string, callId = "c1"): AgentEvent =>
  ({ type: "tool_execution_start", toolCallId: callId, toolName, args: {} }) as AgentEvent;

const toolEnd = (toolName: string, details: unknown, callId = "c1"): AgentEvent =>
  ({ type: "tool_execution_end", toolCallId: callId, toolName, result: { details }, isError: false }) as AgentEvent;

const payload: UiPayload = { type: "chart", title: "Revenue", data: { series: [] }, node: "ui" };

/** A tool start yields an optional `agent` event and then exactly one `step-start`. */
const stepStartOf = (events: AskStreamEvent[]) => {
  const found = events.find((e) => e.kind === "step-start");
  if (found?.kind !== "step-start") throw new Error("expected a step-start");
  return found;
};

const isAgentEvent = (e: AskStreamEvent): e is Extract<AskStreamEvent, { kind: "agent" }> =>
  e.kind === "agent";

describe("AskEventTranslator", () => {
  it("emits one token event per text delta", () => {
    expect(translator().translate(token("Hel"))).toEqual([{ kind: "token", text: "Hel" }]);
  });

  it("attributes the agent to the tool family that is running", () => {
    // The replacement for `NODE_AGENT_MAP[streamEvent.metadata.langgraph_node]`.
    expect(translator().translate(toolStart("screenshot"))).toContainEqual({
      kind: "agent",
      label: "Desktop",
    });
    expect(translator().translate(toolStart("browser_click"))).toContainEqual({
      kind: "agent",
      label: "Browser",
    });
    expect(translator().translate(toolStart("create_docx"))).toContainEqual({
      kind: "agent",
      label: "Document",
    });
    expect(translator().translate(toolStart("mcp_echo"))).toContainEqual({
      kind: "agent",
      label: "Research",
    });
  });

  it("uses General for a tool no toolbox contributed", () => {
    // With no classifier there is no phase to announce before the model acts, so this is
    // the first-turn path rather than an error case. `AgentIndicator.tsx` has a row for it.
    expect(translator().translate(toolStart("something_unregistered"))).toContainEqual({
      kind: "agent",
      label: IDLE_AGENT_LABEL,
    });
  });

  it("sends the tool name verbatim and the label from the registry", () => {
    // Replaces "maps the three tools the renderer has bespoke copy onto its step names".
    // That mapping was the defect: five names got legacy graph-node strings so three old
    // badges kept working, and the other 39 tools fell through to their own identifier.
    for (const [name, label] of [
      ["search_web", "Search the web"],
      ["fetch_page", "Read a page"],
      ["create_chart", "Create chart"],
    ] as const) {
      const start = stepStartOf(translator().translate(toolStart(name)));
      expect(start.step).toBe(name);
      expect(start.label).toBe(label);
    }
  });

  it("falls back to the tool name as the label when a toolbox declared none", () => {
    const start = stepStartOf(translator().translate(toolStart("browser_click")));

    expect(start.label).toBe("browser_click");
    expect(start.family).toBe("browser");
  });

  it("uses the tool name as the step for everything else, so a new tool needs no registry edit", () => {
    expect(stepStartOf(translator().translate(toolStart("browser_click"))).step).toBe("browser_click");
  });

  it("marks every tool step with the type the renderer's badge switch keys on", () => {
    // `getStepBadge` fires the `tool` badge on `type === 'tool_start'`.
    const event = stepStartOf(translator().translate(toolStart("create_docx")));
    expect(event.data.type).toBe("tool_execution");
    expect(event.data.toolName).toBe("create_docx");
    expect(event.data.toolCallId).toBe("c1");
  });

  it("completes the step with the same name it started", () => {
    const t = translator();
    const start = stepStartOf(t.translate(toolStart("create_docx")));
    const end = t.translate(toolEnd("create_docx", { status: "complete" }))[0];
    if (end?.kind !== "step-complete") throw new Error("expected a step-complete");
    // The renderer folds an update onto the open step by matching `step`; a mismatch here
    // would leave the timeline spinning forever on a tool that already finished.
    expect(end.step).toBe(start.step);
  });

  it("carries a generative-UI payload off tool_execution_end and accumulates it", () => {
    const t = translator();
    const out = t.translate(toolEnd("create_chart", { status: "complete", uiPayload: payload }));
    expect(out).toContainEqual({ kind: "ui-payload", payload });
    expect(t.summary.uiPayloads).toEqual([payload]);
  });

  it("accumulates every payload across a turn, in order", () => {
    const t = translator();
    const second: UiPayload = { type: "table", title: "Rows", data: {}, node: "ui" };
    t.translate(toolEnd("create_chart", { status: "complete", uiPayload: payload }));
    t.translate(toolEnd("create_table", { status: "complete", uiPayload: second }));
    expect(t.summary.uiPayloads).toEqual([payload, second]);
  });

  it("carries sources off tool_execution_end and accumulates them", () => {
    const t = translator();
    const sources = [{ url: "https://example.com", title: "Example", excerpt: "hi" }];
    const out = t.translate(toolEnd("fetch_page", { status: "complete", sources }));
    expect(out).toContainEqual({ kind: "sources", sources });
    expect(t.summary.sources).toEqual(sources);
  });

  it("emits no source event for an empty source list", () => {
    // The renderer applies `sources` only when `length > 0`, so an empty array is noise.
    expect(translator().translate(toolEnd("fetch_page", { status: "complete", sources: [] }))).toEqual([
      { kind: "step-complete", step: "fetch_page", label: "Read a page", family: "web", detail: "Completed: fetch_page" },
    ]);
  });

  it("records each label once, in order, so a repeated family is not re-announced", () => {
    const t = translator();
    t.translate(toolStart("search_web"));
    t.translate(toolStart("fetch_page")); // same family — must not re-announce
    t.translate(toolStart("create_docx"));
    t.translate(toolStart("create_docx")); // same family again
    expect(t.summary.labels).toEqual(["Research", "Document"]);
  });

  it("emits an agent event only when the label actually changes", () => {
    // The dedup used to live in the pump as `lastEmittedAgent`. Four tool starts across two
    // families must produce two pushes, or the renderer's pill re-renders for nothing.
    const t = translator();
    const emitted = [toolStart("search_web"), toolStart("fetch_page"), toolStart("create_docx"), toolStart("create_docx")]
      .flatMap((e) => t.translate(e))
      .filter(isAgentEvent)
      .map((e) => e.label);
    expect(emitted).toEqual(["Research", "Document"]);
  });

  it("ignores the arms it does not surface", () => {
    const t = translator();
    for (const event of [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: partial },
      { type: "message_end", message: partial },
      { type: "turn_end", message: partial, toolResults: [] },
      { type: "agent_end", messages: [] },
      { type: "tool_execution_update", toolCallId: "c1", toolName: "click", args: {}, partialResult: {} },
    ] as AgentEvent[]) {
      expect(t.translate(event)).toEqual([]);
    }
  });

  it("ignores a non-delta message_update rather than emitting an empty token", () => {
    const event = {
      type: "message_update",
      message: partial,
      assistantMessageEvent: { type: "text_start", contentIndex: 0, partial },
    } as unknown as AgentEvent;
    expect(translator().translate(event)).toEqual([]);
  });

  it("survives a tool result with no details at all", () => {
    const event = {
      type: "tool_execution_end",
      toolCallId: "c1",
      toolName: "click",
      result: undefined,
      isError: true,
    } as AgentEvent;
    const out: AskStreamEvent[] = translator().translate(event);
    expect(out).toEqual([{ kind: "step-complete", step: "click", label: "Click", family: "desktop", detail: "Completed: click" }]);
  });
});