import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { createLogger } from "../../utils/logger";
import type { UIPayload } from "../langgraph/state";
import { statefulBrowserAgent } from "./stateful-browser-agent";
import { browserMemory } from "./browser-memory";
import { browserPlanner } from "./browser-planner";
import { browserVerifier } from "./browser-verifier";
import { browserRecovery } from "./browser-recovery";
import { browserSkillLoader } from "./browser-skill-loader";
import type { BrowserSubtask, BrowserExecutionTraceEntry } from "./types";

const log = createLogger("BrowserSubgraph");

const appendArray = <T>() => (a: T[] | undefined, b: T[]) => [...(a ?? []), ...b];

// ── State Definition ─────────────────────────────────────────────────────────

export const BrowserSubGraphState = Annotation.Root({
  task: Annotation<string>(),
  sessionId: Annotation<string>(),
  subtasks: Annotation<BrowserSubtask[]>({
    default: () => [],
    reducer: (_state, update) => update,
  }),
  currentSubtaskIndex: Annotation<number>({
    default: () => 0,
    reducer: (_state, update) => update,
  }),
  subtaskResult: Annotation<string>({
    default: () => "",
    reducer: (_state, update) => update,
  }),
  subtaskError: Annotation<string | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  planStatus: Annotation<
    "planning" | "executing" | "verifying" | "complete" | "failed" | "recovering"
  >({
    default: () => "planning",
    reducer: (_state, update) => update,
  }),
  memoryContext: Annotation<string>({
    default: () => "",
    reducer: (_state, update) => update,
  }),
  recoveryCount: Annotation<number>({
    default: () => 0,
    reducer: (_state, update) => update,
  }),
  finalResponse: Annotation<string>({
    default: () => "",
    reducer: (_state, update) => update,
  }),
  actions: Annotation<Array<{ type: string; description: string; success: boolean }>>({
    default: () => [],
    reducer: (_state, update) => update,
  }),
  executionTrace: Annotation<BrowserExecutionTraceEntry[]>({
    default: () => [],
    reducer: (_state, update) => update,
  }),
  verificationResult: Annotation<{
    passed: boolean;
    score: number;
    signals: string[];
    message: string;
  } | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  skillContext: Annotation<string>({
    default: () => "",
    reducer: (_state, update) => update,
  }),
  uiPayloads: Annotation<UIPayload[]>({
    reducer: appendArray<UIPayload>(),
    default: () => [],
  }),
});

// ── Execution Trace Helper ────────────────────────────────────────────────────

function traceNode<R>(
  nodeName: string,
  inputSummary: string,
  fn: () => Promise<R>,
): (state: any) => Promise<R> {
  return async (state: any) => {
    const enterMs = Date.now();
    log.debug(`[Subgraph] Entering node: ${nodeName}`);
    try {
      const result = await fn();
      const exitMs = Date.now();
      const durationMs = exitMs - enterMs;
      const outputSummary = typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
      const entry: BrowserExecutionTraceEntry = {
        node: nodeName,
        enterMs,
        exitMs,
        durationMs,
        inputSummary,
        outputSummary,
      };
      log.info(`[Subgraph] Node "${nodeName}" completed in ${durationMs}ms`);
      state.executionTrace = [...(state.executionTrace || []), entry];
      return result;
    } catch (error) {
      const exitMs = Date.now();
      const durationMs = exitMs - enterMs;
      const outputSummary = error instanceof Error ? error.message : String(error);
      const entry: BrowserExecutionTraceEntry = {
        node: nodeName,
        enterMs,
        exitMs,
        durationMs,
        inputSummary,
        outputSummary,
      };
      log.error(`[Subgraph] Node "${nodeName}" failed after ${durationMs}ms: ${outputSummary}`);
      state.executionTrace = [...(state.executionTrace || []), entry];
      throw error;
    }
  };
}

// ── Node: memoryRetrieve ─────────────────────────────────────────────────────

async function memoryRetrieveNode(state: any): Promise<any> {
  return traceNode("memoryRetrieve", `task: "${state.task.slice(0, 100)}"`, async () => {
    const trajectories = await browserMemory.retrieve(state.task);
    const memoryContext = browserMemory.formatContext(trajectories);
    log.info(`[Subgraph][memoryRetrieve] Retrieved ${trajectories.length} trajectories, context: ${memoryContext.length} chars`);
    return {
      memoryContext,
    };
  })(state);
}

// ── Node: skillRouter ────────────────────────────────────────────────────────

async function skillRouterNode(state: any): Promise<any> {
  return traceNode("skillRouter", `task: "${state.task.slice(0, 100)}"`, async () => {
    const catalog = browserSkillLoader.getCatalog();
    log.info(`[Subgraph][skillRouter] Skill catalog loaded: ${catalog.length} skills available`);

    // Match skills to task based on description similarity
    const matchedSkills = browserSkillLoader.matchSkills(state.task, catalog);
    log.info(`[Subgraph][skillRouter] Matched ${matchedSkills.length} skills: ${matchedSkills.map((s: any) => s.name).join(", ")}`);

    return {
      matchedSkills: matchedSkills.map((s: any) => s.name),
    };
  })(state);
}

// ── Node: loadSkills ─────────────────────────────────────────────────────────

async function loadSkillsNode(state: any): Promise<any> {
  return traceNode("loadSkills", `matched: ${(state.matchedSkills || []).join(", ")}`, async () => {
    if (!state.matchedSkills || state.matchedSkills.length === 0) {
      log.info("[Subgraph][loadSkills] No skills matched, using default browser context");
      return { skillContext: "" };
    }

    const skillInstructions = await Promise.all(
      state.matchedSkills.map((name: string) => browserSkillLoader.loadSkill(name))
    );

    const skillContext = skillInstructions
      .filter(Boolean)
      .join("\n\n---\n\n");

    log.info(`[Subgraph][loadSkills] Loaded ${skillInstructions.filter(Boolean).length} skill contexts, ${skillContext.length} chars total`);

    return { skillContext };
  })(state);
}

// ── Node: planner ─────────────────────────────────────────────────────────────

async function plannerNode(state: any): Promise<any> {
  return traceNode("planner", `task: "${state.task.slice(0, 100)}", skills: ${state.skillContext ? "loaded" : "none"}`, async () => {
    const subtasks = await browserPlanner.plan(state.task, state.memoryContext, state.skillContext);
    const valid = browserPlanner.validatePlan(subtasks);
    if (!valid) {
      log.error("[Subgraph][planner] Plan validation failed");
      return {
        subtasks: [],
        planStatus: "failed" as const,
      };
    }
    log.info(`[Subgraph][planner] Plan validated: ${subtasks.length} subtasks`);
    return {
      subtasks,
      currentSubtaskIndex: 0,
      planStatus: "executing" as const,
    };
  })(state);
}

// ── Node: executeSubtask ─────────────────────────────────────────────────────

async function executeSubtaskNode(state: any): Promise<any> {
  const subtask = state.subtasks[state.currentSubtaskIndex];
  if (!subtask) {
    log.warn("[Subgraph][executeSubtask] No subtask at current index");
    return { subtaskError: "No subtask available" };
  }

  return traceNode("executeSubtask", `subtask #${state.currentSubtaskIndex}: "${subtask.description}"`, async () => {
    if (!statefulBrowserAgent.isReady()) {
      log.info("[Subgraph][executeSubtask] Initializing browser agent");
      await statefulBrowserAgent.initialize();
    }

    const sessionStart = Date.now();
    let fullResponse = "";

    // Log which skills are active for this subtask
    if (state.skillContext && state.matchedSkills?.length > 0) {
      log.info(`[Subgraph][executeSubtask] Activating skills: ${state.matchedSkills.join(", ")}`);
    } else {
      log.info("[Subgraph][executeSubtask] No skills matched, using default browser behavior");
    }

    log.debug(`[Subgraph][executeSubtask] Starting execution with skill context: ${state.skillContext?.length || 0} chars`);

    try {
      const taskString = `Execute subtask: ${subtask.description}. Postcondition: ${subtask.postcondition}`;
      const progressCallback = (progress: any) => {
        log.debug(`[Subgraph][executeSubtask] Progress: ${progress.message}`);
      };

      for await (const chunk of statefulBrowserAgent.executeTaskStream(taskString, state.sessionId, state.skillContext, progressCallback)) {
        fullResponse += chunk;
      }

      const elapsed = Date.now() - sessionStart;
      log.info(`[Subgraph][executeSubtask] Subtask #${state.currentSubtaskIndex} completed in ${elapsed}ms`);

      // Accumulate final response
      const separator = state.finalResponse ? "\n\n" : "";
      const newResponse = `${separator}[Subtask ${state.currentSubtaskIndex + 1}/${state.subtasks.length}] ${subtask.description}: ${fullResponse}`;

      return {
        subtaskResult: fullResponse,
        subtaskError: null,
        finalResponse: state.finalResponse + newResponse,
        currentSubtaskIndex: state.currentSubtaskIndex + 1,
        actions: [
          ...state.actions,
          { type: "execute", description: subtask.description, success: true },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`[Subgraph][executeSubtask] Subtask #${state.currentSubtaskIndex} failed: ${errorMsg}`);

      return {
        subtaskResult: "",
        subtaskError: errorMsg,
        currentSubtaskIndex: state.currentSubtaskIndex + 1,
        planStatus: "failed" as const,
        actions: [
          ...state.actions,
          { type: "execute", description: subtask.description, success: false },
        ],
      };
    }
  })(state);
}

// ── Node: verifier ────────────────────────────────────────────────────────────

async function verifierNode(state: any): Promise<any> {
  const subtask = state.subtasks[state.currentSubtaskIndex - 1]; // Last executed subtask
  if (!subtask) {
    log.warn("[Subgraph][verifier] No subtask to verify");
    return {
      verificationResult: {
        passed: true,
        score: 1,
        signals: [],
        message: "No subtask to verify",
      },
    };
  }

  return traceNode("verifier", `subtask #${state.currentSubtaskIndex - 1}: "${subtask.description}", postcondition: "${subtask.postcondition}"`, async () => {
    const result = await browserVerifier.verifyPostcondition(subtask, state.sessionId);
    log.info(`[Subgraph][verifier] Verification: score=${result.score.toFixed(2)}, passed=${result.passed}`);

    return {
      verificationResult: {
        passed: result.passed,
        score: result.score,
        signals: result.signals,
        message: result.message,
      },
      planStatus: result.passed ? "executing" as const : "failed" as const,
    };
  })(state);
}

// ── Node: recovery ────────────────────────────────────────────────────────────

async function recoveryNode(state: any): Promise<any> {
  const failedSubtask = state.subtasks[state.currentSubtaskIndex - 1];
  const error = state.subtaskError || "Unknown error";

  return traceNode("recovery", `subtask: "${failedSubtask?.description}", error: "${error.slice(0, 100)}", recoveryCount: ${state.recoveryCount}`, async () => {
    const recoveryAction = await browserRecovery.recover(
      failedSubtask,
      error,
      state.verificationResult,
      state.recoveryCount,
    );

    log.info(`[Subgraph][recovery] Strategy: ${recoveryAction.strategy} - ${recoveryAction.reason}`);

    const updates: any = {
      recoveryCount: state.recoveryCount + 1,
      actions: [
        ...state.actions,
        { type: `recovery:${recoveryAction.strategy}`, description: recoveryAction.reason, success: recoveryAction.strategy !== "abort" },
      ],
    };

    switch (recoveryAction.strategy) {
      case "retry":
        // Decrement index to re-execute same subtask
        updates.currentSubtaskIndex = state.currentSubtaskIndex - 1;
        updates.planStatus = "recovering";
        updates.subtaskError = null;
        break;

      case "alternative":
        // Re-execute same subtask with alternative approach
        updates.currentSubtaskIndex = state.currentSubtaskIndex - 1;
        updates.planStatus = "recovering";
        updates.subtaskError = null;
        break;

      case "replan":
        // Re-plan from scratch
        updates.planStatus = "planning";
        updates.subtasks = [];
        updates.subtaskError = null;
        break;

      case "skip":
        // Move past the failed subtask
        updates.subtaskError = null;
        updates.planStatus = "executing";
        break;

      case "abort":
        updates.planStatus = "failed";
        updates.finalResponse = state.finalResponse + `\n\nABORTED: ${recoveryAction.reason}`;
        break;
    }

    return updates;
  })(state);
}

// ── Node: memoryStore ─────────────────────────────────────────────────────────

async function memoryStoreNode(state: any): Promise<any> {
  return traceNode("memoryStore", `task: "${state.task.slice(0, 100)}", actions: ${state.actions.length}, planStatus: ${state.planStatus}`, async () => {
    // Build trajectory from execution trace and actions
    const trajectory = {
      id: `traj-${state.sessionId}-${Date.now()}`,
      taskDescription: state.task,
      steps: state.actions.map((a: any, i: number) => ({
        stepIndex: i,
        tool: a.type,
        args: { description: a.description },
        result: "",
        durationMs: 0,
        success: a.success,
      })),
      outcome: state.finalResponse.slice(0, 500),
      success: state.planStatus === "complete",
      createdAt: Date.now(),
    };

    try {
      await browserMemory.store(trajectory);
      log.info(`[Subgraph][memoryStore] Trajectory stored successfully`);
    } catch (error) {
      log.warn(`[Subgraph][memoryStore] Failed to store trajectory: ${error}`);
    }

    return {
      planStatus: state.planStatus === "failed" ? "failed" as const : "complete" as const,
    };
  })(state);
}

// ── Conditional Edges ─────────────────────────────────────────────────────────

function plannerRouter(state: any): string {
  const hasSubtasks = state.subtasks && state.subtasks.length > 0;
  const route = hasSubtasks ? "executeSubtask" : "memoryStore";
  log.debug(`[Subgraph][planner] Routing -> ${route} (subtasks=${state.subtasks?.length ?? 0})`);
  return route;
}

function executeSubtaskRouter(state: any): string {
  if (state.subtaskError) {
    log.debug(`[Subgraph][executeSubtask] Routing -> recovery (error: ${state.subtaskError?.slice(0, 100)})`);
    return "recovery";
  }
  log.debug(`[Subgraph][executeSubtask] Routing -> verifier (success)`);
  return "verifier";
}

function verifierRouter(state: any): string {
  const vr = state.verificationResult;
  if (!vr) {
    log.warn("[Subgraph][verifier] No verification result, routing to memoryStore");
    return "memoryStore";
  }

  const moreSubtasks = state.currentSubtaskIndex < state.subtasks.length;

  if (vr.passed) {
    if (moreSubtasks) {
      log.debug(`[Subgraph][verifier] Routing -> executeSubtask (verified, ${state.subtasks.length - state.currentSubtaskIndex} subtasks remain)`);
      return "executeSubtask";
    }
    log.debug("[Subgraph][verifier] Routing -> memoryStore (verified, no more subtasks)");
    return "memoryStore";
  }

  // Verification failed
  if (vr.score < 0.3) {
    log.debug(`[Subgraph][verifier] Routing -> recovery (score=${vr.score.toFixed(2)} < 0.3)`);
    return "recovery";
  }

  // Score >= 0.3 but not passed - treat as passing but warn
  log.debug(`[Subgraph][verifier] Routing -> ${moreSubtasks ? "executeSubtask" : "memoryStore"} (score=${vr.score.toFixed(2)} >= 0.3)`);
  return moreSubtasks ? "executeSubtask" : "memoryStore";
}

function recoveryRouter(state: any): string {
  // Look at the last recovery action in actions to determine strategy
  const lastAction = state.actions[state.actions.length - 1];
  if (!lastAction) {
    log.warn("[Subgraph][recovery] No recovery action found, routing to memoryStore");
    return "memoryStore";
  }

  const strategy = lastAction.type.replace("recovery:", "");
  log.debug(`[Subgraph][recovery] Strategy: ${strategy}`);

  switch (strategy) {
    case "retry":
    case "alternative":
      return "executeSubtask";
    case "replan":
      return "planner";
    case "skip":
    case "abort":
      return "memoryStore";
    default:
      log.warn(`[Subgraph][recovery] Unknown strategy "${strategy}", routing to memoryStore`);
      return "memoryStore";
  }
}

// ── Graph Compilation ─────────────────────────────────────────────────────────

const workflow = new StateGraph(BrowserSubGraphState)
  .addNode("memoryRetrieve", memoryRetrieveNode)
  .addNode("skillRouter", skillRouterNode)
  .addNode("loadSkills", loadSkillsNode)
  .addNode("planner", plannerNode)
  .addNode("executeSubtask", executeSubtaskNode)
  .addNode("verifier", verifierNode)
  .addNode("recovery", recoveryNode)
  .addNode("memoryStore", memoryStoreNode);

// Linear edges
workflow.addEdge("__start__", "memoryRetrieve");
workflow.addEdge("memoryRetrieve", "skillRouter");
workflow.addEdge("skillRouter", "loadSkills");
workflow.addEdge("loadSkills", "planner");

// Conditional edges
workflow.addConditionalEdges("planner", plannerRouter, {
  executeSubtask: "executeSubtask",
  memoryStore: "memoryStore",
});

workflow.addConditionalEdges("executeSubtask", executeSubtaskRouter, {
  verifier: "verifier",
  recovery: "recovery",
});

workflow.addConditionalEdges("verifier", verifierRouter, {
  executeSubtask: "executeSubtask",
  memoryStore: "memoryStore",
  recovery: "recovery",
});

workflow.addConditionalEdges("recovery", recoveryRouter, {
  executeSubtask: "executeSubtask",
  planner: "planner",
  memoryStore: "memoryStore",
});

workflow.addEdge("memoryStore", END);

export const browserSubgraph = workflow.compile();

// Log compilation
log.info("[Subgraph] Compiled with 8 nodes: memoryRetrieve, skillRouter, loadSkills, planner, executeSubtask, verifier, recovery, memoryStore");

// ── Wrapper Function ─────────────────────────────────────────────────────────

export async function executeBrowserSubgraph(
  task: string,
  sessionId: string,
): Promise<{
  finalResponse: string;
  actions: Array<{ type: string; description: string; success: boolean }>;
  executionTrace: BrowserExecutionTraceEntry[];
  uiPayloads: UIPayload[];
}> {
  const graphStart = Date.now();
  log.info(`[Subgraph] Executing browser subgraph for task: "${task.slice(0, 100)}" (session: ${sessionId})`);

  const initialState = {
    task,
    sessionId,
  };

  const result = await browserSubgraph.invoke(initialState);

  // Build trace timeline string
  const traceTimeline = result.executionTrace
    .map((e: BrowserExecutionTraceEntry) => `${e.node}(${e.durationMs}ms)`)
    .join(" -> ");
  const totalTime = Date.now() - graphStart;

  log.info(`[Subgraph] Execution complete in ${totalTime}ms`);
  log.info(`[Subgraph] Trace: ${traceTimeline} -> END`);
  log.info(`[Subgraph] Summary: status=${result.planStatus}, actions=${result.actions.length}, subtasks=${result.subtasks.length}`);

  return {
    finalResponse: result.finalResponse,
    actions: result.actions,
    executionTrace: result.executionTrace,
    uiPayloads: result.uiPayloads ?? [],
  };
}
