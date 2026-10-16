import type { TrajectoryRecord, TrajectoryStep } from "../desktop/types";

/**
 * The one row `chat-handlers.ts` accumulates per translator step. Declared here as the
 * narrow shape this module reads so the builder stays Electron-free and testable, and so
 * the pump's own (wider) row type remains assignable to it.
 */
export interface TurnStepInput {
  readonly step: string;
  readonly status: string;
  readonly detail: string;
  readonly data?: unknown;
}

export interface TurnRecordInput {
  readonly turnId: string;
  readonly taskDescription: string;
  /** Every row the pump pushed, in order — starts and completions alike. */
  readonly steps: readonly TurnStepInput[];
  readonly startedAt: number;
  readonly endedAt: number;
  readonly answer: string;
  readonly success: boolean;
  /** Step name to the timestamp its start row was pushed. */
  readonly stepStartedAt: ReadonlyMap<string, number>;
  /** Step name to the timestamp its completion row was pushed. */
  readonly stepEndedAt: ReadonlyMap<string, number>;
}

/** The outcome column is a summary, not a transcript. */
const OUTCOME_MAX = 500;
/** Same for a step's result: enough to tell a good call from a bad one. */
const RESULT_MAX = 200;

const asArgs = (data: unknown): Record<string, unknown> => {
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return data === undefined ? {} : { value: data };
};

/**
 * Build the episodic record for one completed Ask turn.
 *
 * The store exists (`desktop_trajectories` + `desktop_trajectory_steps`, migrated and
 * indexed) and has had no writer since the Pi cutover deleted `desktop/desktop-memory.ts`.
 * This is that writer's pure half, so the mapping is testable without Electron or a database.
 *
 * Deliberate choice: **completed rows are kept per occurrence, not deduped by tool name.**
 * `ThinkingSteps.tsx` collapses repeated calls to one line for reading; the record is the
 * evidence base for evaluating the agent, and "it searched three times" is the signal.
 */
export function buildTurnRecord(input: TurnRecordInput): TrajectoryRecord {
  const steps: TrajectoryStep[] = [];

  for (const row of input.steps) {
    if (row.status !== "completed") continue;
    const start = input.stepStartedAt.get(row.step);
    const end = input.stepEndedAt.get(row.step);
    steps.push({
      stepIndex: steps.length,
      tool: row.step,
      args: asArgs(row.data),
      result: row.detail.slice(0, RESULT_MAX),
      durationMs: start !== undefined && end !== undefined && end >= start ? end - start : 0,
      success: true,
    });
  }

  return {
    id: input.turnId,
    taskDescription: input.taskDescription,
    steps,
    outcome: input.answer.slice(0, OUTCOME_MAX),
    success: input.success,
    createdAt: input.endedAt,
    // The turn's wall clock, not the sum of the steps: a no-tool answer has zero steps and
    // still took real time, and time-to-solve is a metric the record exists to supply.
    durationMs: input.endedAt >= input.startedAt ? input.endedAt - input.startedAt : 0,
  };
}
