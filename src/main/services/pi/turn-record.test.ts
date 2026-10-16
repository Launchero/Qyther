import { describe, it, expect } from "vitest";
import { buildTurnRecord, type TurnStepInput } from "./turn-record";

const step = (over: Partial<TurnStepInput> & { step: string }): TurnStepInput => ({
  status: "completed",
  detail: "",
  ...over,
});

const base = {
  turnId: "s1:turn-1000",
  taskDescription: "close the notepad window",
  startedAt: 1000,
  endedAt: 4000,
  answer: "Done.",
  success: true,
};

describe("buildTurnRecord", () => {
  it("keeps repeated calls to one tool as separate steps", () => {
    // The transcript UI dedupes by tool name; the record must not, because "it searched
    // three times" is exactly the signal an evaluation needs.
    const record = buildTurnRecord({
      ...base,
      steps: [
        step({ step: "search_web", detail: "Completed: search_web" }),
        step({ step: "search_web", detail: "Completed: search_web" }),
        step({ step: "fetch_page", detail: "Completed: fetch_page" }),
      ],
      stepStartedAt: new Map(),
      stepEndedAt: new Map(),
    });

    expect(record.steps.map(s => s.tool)).toEqual(["search_web", "search_web", "fetch_page"]);
    expect(record.steps.map(s => s.stepIndex)).toEqual([0, 1, 2]);
  });

  it("drops rows that never completed", () => {
    const record = buildTurnRecord({
      ...base,
      steps: [
        step({ step: "click", status: "in_progress" }),
        step({ step: "click", detail: "Completed: click" }),
        step({ step: "wait", status: "in_progress" }),
      ],
      stepStartedAt: new Map(),
      stepEndedAt: new Map(),
    });

    expect(record.steps.map(s => s.tool)).toEqual(["click"]);
  });

  it("derives per-step duration from the pump's own timestamps", () => {
    const record = buildTurnRecord({
      ...base,
      steps: [step({ step: "launch_app", detail: "Completed: launch_app" })],
      stepStartedAt: new Map([["launch_app", 1500]]),
      stepEndedAt: new Map([["launch_app", 2350]]),
    });

    expect(record.steps[0].durationMs).toBe(850);
  });

  it("reports zero rather than a guess when a step has no start timestamp", () => {
    const record = buildTurnRecord({
      ...base,
      steps: [step({ step: "launch_app" })],
      stepStartedAt: new Map(),
      stepEndedAt: new Map([["launch_app", 2000]]),
    });

    expect(record.steps[0].durationMs).toBe(0);
  });

  it("carries the start row's data as the step args", () => {
    // The pump folds the start row into the completion row, so args arrive on `data`.
    const record = buildTurnRecord({
      ...base,
      steps: [step({ step: "create_docx", data: { fileName: "plan.docx" } })],
      stepStartedAt: new Map(),
      stepEndedAt: new Map(),
    });

    expect(record.steps[0].args).toEqual({ fileName: "plan.docx" });
  });

  it("wraps non-object data and omits absent data", () => {
    const record = buildTurnRecord({
      ...base,
      steps: [step({ step: "a", data: "text" }), step({ step: "b" })],
      stepStartedAt: new Map(),
      stepEndedAt: new Map(),
    });

    expect(record.steps[0].args).toEqual({ value: "text" });
    expect(record.steps[1].args).toEqual({});
  });

  it("bounds the outcome and result summaries", () => {
    const record = buildTurnRecord({
      ...base,
      answer: "x".repeat(900),
      steps: [step({ step: "screenshot", detail: "y".repeat(500) })],
      stepStartedAt: new Map(),
      stepEndedAt: new Map(),
    });

    expect(record.outcome).toHaveLength(500);
    expect(record.steps[0].result).toHaveLength(200);
  });

  it("maps identity and the failure case", () => {
    const failed = buildTurnRecord({
      ...base,
      steps: [],
      answer: "",
      success: false,
      stepStartedAt: new Map(),
      stepEndedAt: new Map(),
    });

    expect(failed.id).toBe("s1:turn-1000");
    expect(failed.taskDescription).toBe("close the notepad window");
    expect(failed.success).toBe(false);
    expect(failed.createdAt).toBe(4000);
    expect(failed.steps).toEqual([]);
    // Time-to-solve survives a turn with no steps, which a step sum cannot express.
    expect(failed.durationMs).toBe(3000);
  });

  it("never reports a negative duration when the clocks disagree", () => {
    const record = buildTurnRecord({
      ...base,
      startedAt: 5000,
      endedAt: 4000,
      steps: [],
      stepStartedAt: new Map(),
      stepEndedAt: new Map(),
    });

    expect(record.durationMs).toBe(0);
  });
});
