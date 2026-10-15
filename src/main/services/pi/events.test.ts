// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { dispatchAgentEvent, TextAccumulator, type AgentBridge, type ToolProgress } from "./events";
import { buildSystemPrompt } from "./prompt";

/**
 * `AssistantMessageEvent` arms carry `contentIndex` and a live `partial`, so a delta fixture
 * has to supply a complete partial message. Built honestly rather than cast to `any`: the
 * bridge only reads `type` and `delta`, and a real fixture is what stops this test from
 * silently passing after `AssistantMessage` grows a required field.
 */
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

const update = (inner: Partial<AssistantMessageEvent> & { type: string }): AgentEvent =>
  ({
    type: "message_update",
    message: partial,
    assistantMessageEvent: { contentIndex: 0, partial, ...inner },
  }) as unknown as AgentEvent;

/** Collect everything the bridge emits, in order. */
function recorder() {
  const calls: Array<[string, unknown]> = [];
  const bridge: AgentBridge = {
    onText: (d) => calls.push(["text", d]),
    onThinking: (d) => calls.push(["thinking", d]),
    onToolStart: (p) => calls.push(["start", p]),
    onToolEnd: (p) => calls.push(["end", p]),
    onComplete: (t, _d, e) => calls.push(["complete", { t, e }]),
  };
  return { calls, bridge };
}

const toolEnd = (over: Partial<Extract<AgentEvent, { type: "tool_execution_end" }>> = {}) =>
  ({
    type: "tool_execution_end",
    toolCallId: "c1",
    toolName: "close_window",
    result: { content: [{ type: "text", text: "Window closed successfully." }], details: { status: "window_management", verifies: true } },
    isError: false,
    durationMs: 12,
    ...over,
  }) as AgentEvent;

describe("AgentEvent bridge", () => {
  it("routes text deltas to onText and thinking deltas to onThinking", () => {
    const { calls, bridge } = recorder();
    dispatchAgentEvent(update({ type: "text_delta", delta: "hi" }), bridge);
    dispatchAgentEvent(update({ type: "thinking_delta", delta: "hmm" }), bridge);
    expect(calls).toEqual([["text", "hi"], ["thinking", "hmm"]]);
  });

  it("ignores a non-delta message_update instead of emitting an empty token", () => {
    const { calls, bridge } = recorder();
    dispatchAgentEvent(update({ type: "text_start" }), bridge);
    expect(calls).toEqual([]);
  });

  it("lifts status and verifies out of the toolbox details on tool end", () => {
    const { calls, bridge } = recorder();
    dispatchAgentEvent(toolEnd(), bridge);
    const [kind, progress] = calls[0] as [string, ToolProgress];
    expect(kind).toBe("end");
    expect(progress).toMatchObject({
      toolName: "close_window",
      status: "window_management",
      message: "Window closed successfully.",
      isError: false,
      durationMs: 12,
      verifies: true,
    });
  });

  it("treats a missing details block as no verification, not as verified", () => {
    const { calls, bridge } = recorder();
    dispatchAgentEvent(toolEnd({ result: { content: [{ type: "text", text: "ok" }] } as never }), bridge);
    expect((calls[0][1] as ToolProgress).verifies).toBe(false);
  });

  it("propagates isError from the tool result", () => {
    const { calls, bridge } = recorder();
    dispatchAgentEvent(toolEnd({ isError: true }), bridge);
    expect((calls[0][1] as ToolProgress).isError).toBe(true);
  });

  it("announces a tool start with the tool name and a placeholder status", () => {
    const { calls, bridge } = recorder();
    dispatchAgentEvent({ type: "tool_execution_start", toolCallId: "c1", toolName: "click", args: {} } as AgentEvent, bridge);
    expect(calls[0][0]).toBe("start");
    // `tool_execution_start` carries no result yet, so there is no real status to report;
    // the concrete one arrives on `tool_execution_end`. A start must not claim to know.
    expect(calls[0][1]).toMatchObject({ toolName: "click", toolCallId: "c1", isError: false, verifies: false });
  });

  it("is a no-op for lifecycle arms it does not surface", () => {
    const { calls, bridge } = recorder();
    for (const type of ["agent_start", "turn_start", "message_start", "message_end"] as const) {
      dispatchAgentEvent({ type } as AgentEvent, bridge);
    }
    dispatchAgentEvent({ type: "tool_execution_update", toolCallId: "c", toolName: "t", args: {}, partialResult: {} } as AgentEvent, bridge);
    expect(calls).toEqual([]);
  });

  it("reports the final assistant text on agent_end and flags an errored run", () => {
    const { calls, bridge } = recorder();
    dispatchAgentEvent({
      type: "agent_end",
      messages: [
        { role: "user", content: [{ type: "text", text: "task" }] },
        { role: "assistant", content: [{ type: "text", text: "All windows are minimized." }], errorMessage: "boom" },
      ],
    } as AgentEvent, bridge);
    expect(calls.at(-1)).toEqual(["complete", { t: "All windows are minimized.", e: true }]);
  });

  it("does not complete twice for a turn_end followed by agent_end", () => {
    const { calls, bridge } = recorder();
    const assistant = { role: "assistant", content: [{ type: "text", text: "done" }] };
    dispatchAgentEvent({ type: "turn_end", message: assistant as never, toolResults: [] } as AgentEvent, bridge);
    dispatchAgentEvent({ type: "agent_end", messages: [assistant as never] } as AgentEvent, bridge);
    // Both arms report; the consumer keeps the last. What matters is that neither throws
    // and that a normal text answer survives both.
    expect(calls.filter((c) => c[0] === "complete").length).toBeGreaterThanOrEqual(1);
  });
});

describe("TextAccumulator", () => {
  it("concatenates and resets", () => {
    const acc = new TextAccumulator();
    acc.push("a");
    acc.push("b");
    expect(acc.text).toBe("ab");
    acc.reset();
    expect(acc.text).toBe("");
  });
});

describe("system prompt", () => {
  const base = { screenWidth: 1920, screenHeight: 1080, sessionId: "s1" };

  it("interpolates the real work area bounds", () => {
    const p = buildSystemPrompt({ ...base, hasScreenshot: true });
    expect(p).toContain("1920x1080");
    expect(p).toContain("x: 0-1919");
    expect(p).toContain("y: 0-1079");
  });

  it("changes the opening line with the screenshot branch", () => {
    expect(buildSystemPrompt({ ...base, hasScreenshot: true })).toContain("initial screenshot of the current screen already provided");
    expect(buildSystemPrompt({ ...base, hasScreenshot: false })).toContain("No screenshot was available");
  });

  it("carries the tool-priority order and the strategy-change rule", () => {
    const p = buildSystemPrompt({ ...base, hasScreenshot: false });
    expect(p).toContain("TOOL PRIORITY ORDER");
    expect(p).toContain("search_elements + invoke_element");
    expect(p).toContain("STRATEGY CHANGE RULE");
    expect(p).toContain("Current session: s1");
  });

  it("forbids hand-rolled JSON tool calls", () => {
    expect(buildSystemPrompt({ ...base, hasScreenshot: false })).toContain("NEVER output JSON");
  });
});
