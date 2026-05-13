import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { createLogger } from "../../utils/logger";
import type { UIPayload } from "../langgraph/state";
import { desktopAgent } from "./desktop-agent";
import { desktopMemory } from "./desktop-memory";
import { desktopPlanner } from "./desktop-planner";
import { desktopVerifier } from "./desktop-verifier";
import { desktopRecovery } from "./desktop-recovery";
import { executeBrowserSubgraph } from "../browser/browser-subgraph";
import type { Subtask, SubtaskVerificationResult, ExecutionTraceEntry, StructuredVerificationResult, BrowserExecutionTraceEntry } from "./types";
import { WindowsDesktopAdapter } from "./windows-adapter";
import { AccessibilityTreeAdapter } from "./accessibility-tree";

const log = createLogger("DesktopSubgraph");

const appendArray = <T>() => (a: T[] | undefined, b: T[]) => [...(a ?? []), ...b];

// ── State Definition ──────────────────────────────────────────────────────────

const DesktopSubGraphState = Annotation.Root({
  task: Annotation<string>(),
  sessionId: Annotation<string>(),
  subtasks: Annotation<Subtask[]>({
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
  executionTrace: Annotation<ExecutionTraceEntry[]>({
    default: () => [],
    reducer: (_state, update) => update,
  }),
  verificationResult: Annotation<SubtaskVerificationResult & {
    verificationMode?: 'uia' | 'screenshot';
    patternType?: string | null;
    elementFound?: boolean;
    valueMatched?: boolean;
    fallbackUsed?: boolean;
  } | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  structuredVerificationResult: Annotation<StructuredVerificationResult | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  delegatedToBrowser: Annotation<boolean>({
    default: () => false,
    reducer: (_state, update) => update,
  }),
  delegateResults: Annotation<{
    subtaskIndex: number;
    browserSessionId: string;
    finalResponse: string;
    actions: Array<{ type: string; description: string; success: boolean }>;
    executionTrace: BrowserExecutionTraceEntry[];
    artifacts: string[];
  } | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  crossAgentContext: Annotation<{
    desktopResults: string[];
    browserResults: string[];
    sharedArtifacts: string[];
  }>({
    default: () => ({ desktopResults: [], browserResults: [], sharedArtifacts: [] }),
    reducer: (a, b) => ({
      desktopResults: [...(a?.desktopResults ?? []), ...(b?.desktopResults ?? [])],
      browserResults: [...(a?.browserResults ?? []), ...(b?.browserResults ?? [])],
      sharedArtifacts: [...(a?.sharedArtifacts ?? []), ...(b?.sharedArtifacts ?? [])],
    }),
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
      const entry: ExecutionTraceEntry = {
        node: nodeName,
        enterMs,
        exitMs,
        durationMs,
        inputSummary,
        outputSummary,
      };
      log.info(`[Subgraph] Node "${nodeName}" completed in ${durationMs}ms`);
      // Append trace entry to state
      state.executionTrace = [...(state.executionTrace || []), entry];
      return result;
    } catch (error) {
      const exitMs = Date.now();
      const durationMs = exitMs - enterMs;
      const outputSummary = error instanceof Error ? error.message : String(error);
      const entry: ExecutionTraceEntry = {
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
    const trajectories = await desktopMemory.retrieve(state.task);
    const memoryContext = desktopMemory.formatContext(trajectories);
    log.info(`[Subgraph][memoryRetrieve] Retrieved ${trajectories.length} trajectories, context: ${memoryContext.length} chars`);
    return {
      memoryContext,
    };
  })(state);
}

// ── Node: planner ─────────────────────────────────────────────────────────────

async function plannerNode(state: any): Promise<any> {
  return traceNode("planner", `task: "${state.task.slice(0, 100)}", memoryContext: ${state.memoryContext.length} chars`, async () => {
    const subtasks = await desktopPlanner.plan(state.task, state.memoryContext);
    const valid = desktopPlanner.validatePlan(subtasks);
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
    if (!desktopAgent.isReady()) {
      log.info("[Subgraph][executeSubtask] Initializing desktop agent");
      await desktopAgent.initialize();
    }

    const adapter = new WindowsDesktopAdapter();
    const sessionStart = Date.now();
    let fullResponse = "";

    try {
      const taskString = `Execute subtask: ${subtask.description}. Postcondition: ${subtask.postcondition}`;
      const progressCallback = (progress: any) => {
        log.debug(`[Subgraph][executeSubtask] Progress: ${progress.message}`);
      };

      for await (const chunk of desktopAgent.executeTaskStream(taskString, state.sessionId, progressCallback)) {
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
        delegatedToBrowser: false,
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
        delegatedToBrowser: false,
        planStatus: "failed" as const,
        actions: [
          ...state.actions,
          { type: "execute", description: subtask.description, success: false },
        ],
      };
    } finally {
      try {
        await adapter.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
  })(state);
}

// ── Node: delegateToBrowser ───────────────────────────────────────────────────

async function delegateToBrowserNode(state: any): Promise<any> {
  const subtask = state.subtasks[state.currentSubtaskIndex];
  if (!subtask) {
    log.warn("[Subgraph][delegateToBrowser] No subtask at current index");
    return {
      subtaskError: "No subtask available for browser delegation",
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
      planStatus: "failed" as const,
    };
  }

  return traceNode("delegateToBrowser", `subtask #${state.currentSubtaskIndex}: "${subtask.description}" -> browser`, async () => {
    const nodeStart = Date.now();
    const browserSessionId = `browser-delegate-${Date.now()}`;
    log.info(`[Subgraph][delegateToBrowser] Delegating subtask #${state.currentSubtaskIndex} to browser agent (session: ${browserSessionId})`);

    // Build browser task with desktop context accumulated so far
    const desktopResults = state.crossAgentContext?.desktopResults ?? [];
    const contextPrefix = desktopResults.length > 0
      ? `DESKTOP CONTEXT (completed actions before this browser task):\n${desktopResults.join("\n")}\n\n`
      : "";

    const browserTask = `${contextPrefix}BROWSER TASK: ${subtask.description}. Postcondition: ${subtask.postcondition}`;

    let browserFinalResponse = "";
    let browserActions: Array<{ type: string; description: string; success: boolean }> = [];
    let browserExecutionTrace: BrowserExecutionTraceEntry[] = [];

    try {
      const browserResult = await executeBrowserSubgraph(browserTask, browserSessionId);
      browserFinalResponse = browserResult.finalResponse;
      browserActions = browserResult.actions;
      browserExecutionTrace = browserResult.executionTrace;

      const elapsed = Date.now() - nodeStart;
      log.info(`[Subgraph][delegateToBrowser] Browser delegation completed in ${elapsed}ms`);

      // Extract artifacts from browser actions (e.g., downloaded file paths)
      const artifacts = browserActions
        .filter(a => a.success)
        .map(a => a.description)
        .slice(0, 5);

      // Build cross-agent context update
      const newDesktopResults = [...(state.crossAgentContext?.desktopResults ?? [])];
      const newBrowserResults = [...(state.crossAgentContext?.browserResults ?? []), browserFinalResponse.slice(0, 500)];

      // Accumulate response
      const separator = state.finalResponse ? "\n\n" : "";
      const newResponse = `${separator}[Subtask ${state.currentSubtaskIndex + 1}/${state.subtasks.length}] ${subtask.description} [BROWSER]: ${browserFinalResponse}`;

      return {
        subtaskResult: browserFinalResponse,
        subtaskError: null,
        finalResponse: state.finalResponse + newResponse,
        currentSubtaskIndex: state.currentSubtaskIndex + 1,
        delegatedToBrowser: true,
        delegateResults: {
          subtaskIndex: state.currentSubtaskIndex,
          browserSessionId,
          finalResponse: browserFinalResponse,
          actions: browserActions,
          executionTrace: browserExecutionTrace,
          artifacts,
        },
        crossAgentContext: {
          desktopResults: newDesktopResults,
          browserResults: newBrowserResults,
          sharedArtifacts: [...(state.crossAgentContext?.sharedArtifacts ?? []), ...artifacts],
        },
        actions: [
          ...state.actions,
          { type: "delegate_browser", description: subtask.description, success: true },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`[Subgraph][delegateToBrowser] Browser delegation failed: ${errorMsg}`);

      return {
        subtaskResult: "",
        subtaskError: `Browser delegation failed: ${errorMsg}`,
        currentSubtaskIndex: state.currentSubtaskIndex + 1,
        delegatedToBrowser: true,
        delegateResults: {
          subtaskIndex: state.currentSubtaskIndex,
          browserSessionId,
          finalResponse: "",
          actions: browserActions,
          executionTrace: browserExecutionTrace,
          artifacts: [],
        },
        planStatus: "failed" as const,
        actions: [
          ...state.actions,
          { type: "delegate_browser", description: subtask.description, success: false },
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
        verificationMode: 'uia',
        patternType: null,
        elementFound: false,
        valueMatched: false,
        fallbackUsed: false,
      },
      structuredVerificationResult: null,
    };
  }

  return traceNode("verifier", `subtask #${state.currentSubtaskIndex - 1}: "${subtask.description}", postcondition: "${subtask.postcondition}"`, async () => {
    const adapter = new WindowsDesktopAdapter();
    const accessibilityAdapter = new AccessibilityTreeAdapter();
    try {
      await accessibilityAdapter.initialize();

      const result = await desktopVerifier.verifyPostcondition(subtask, adapter, accessibilityAdapter);
      log.info(`[Subgraph][verifier] Verification: score=${result.score.toFixed(2)}, passed=${result.passed}, mode=${result.verificationMode || 'unknown'}`);

      const structuredResult: StructuredVerificationResult = {
        mode: result.verificationMode === 'screenshot' ? 'fallback' : 'uia',
        patternType: result.patternType || null,
        elementFound: result.elementFound || false,
        valueMatched: result.valueMatched || false,
        fallbackUsed: result.fallbackUsed || false,
      };

      return {
        verificationResult: {
          passed: result.passed,
          score: result.score,
          signals: result.signals,
          message: result.message,
          verificationMode: result.verificationMode,
          patternType: result.patternType,
          elementFound: result.elementFound,
          valueMatched: result.valueMatched,
          fallbackUsed: result.fallbackUsed,
        },
        structuredVerificationResult: structuredResult,
        planStatus: result.passed ? "executing" as const : "failed" as const,
      };
    } finally {
      try {
        await adapter.cleanup();
      } catch {
        // Ignore cleanup errors
      }
      accessibilityAdapter.cleanup();
    }
  })(state);
}

// ── Node: recovery ────────────────────────────────────────────────────────────

async function recoveryNode(state: any): Promise<any> {
  const failedSubtask = state.subtasks[state.currentSubtaskIndex - 1];
  const error = state.subtaskError || "Unknown error";

  return traceNode("recovery", `subtask: "${failedSubtask?.description}", error: "${error.slice(0, 100)}", recoveryCount: ${state.recoveryCount}`, async () => {
    const recoveryAction = await desktopRecovery.recover(
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
    // Include delegated browser actions in the trajectory for cross-agent learning
    const allSteps = state.actions.map((a: any, i: number) => {
      const step: any = {
        stepIndex: i,
        tool: a.type,
        args: { description: a.description },
        result: "",
        durationMs: 0,
        success: a.success,
      };
      // Mark browser-delegated actions with agent type
      if (a.type === "delegate_browser" && state.delegateResults) {
        step.agentType = "browser";
        step.browserSessionId = state.delegateResults.browserSessionId;
        step.browserActions = state.delegateResults.actions.length;
        step.browserArtifacts = state.delegateResults.artifacts;
      }
      return step;
    });

    const trajectory = {
      id: `traj-${state.sessionId}-${Date.now()}`,
      taskDescription: state.task,
      steps: allSteps,
      outcome: state.finalResponse.slice(0, 500),
      success: state.planStatus === "complete",
      createdAt: Date.now(),
      // Cross-agent metadata for future retrieval
      hasBrowserDelegation: !!state.delegateResults,
      crossAgentContext: state.crossAgentContext || null,
    };

    try {
      await desktopMemory.store(trajectory);
      log.info(`[Subgraph][memoryStore] Trajectory stored successfully (${allSteps.length} steps, browserDelegation=${!!state.delegateResults})`);
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
  // Check if the NEXT subtask (not current, which was just incremented) requires browser
  const nextSubtaskIndex = state.currentSubtaskIndex;
  const nextSubtask = state.subtasks?.[nextSubtaskIndex];
  if (nextSubtask?.requiresBrowser) {
    log.debug(`[Subgraph][executeSubtask] Next subtask requires browser, routing -> delegateToBrowser`);
    return "delegateToBrowser";
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
    // After passing verification, check if next subtask needs browser delegation
    if (moreSubtasks) {
      const nextSubtask = state.subtasks?.[state.currentSubtaskIndex];
      if (nextSubtask?.requiresBrowser) {
        log.debug("[Subgraph][verifier] Verified, next subtask requires browser -> delegateToBrowser");
        return "delegateToBrowser";
      }
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
  if (moreSubtasks) {
    const nextSubtask = state.subtasks?.[state.currentSubtaskIndex];
    if (nextSubtask?.requiresBrowser) {
      log.debug("[Subgraph][verifier] Low-mid score, next subtask requires browser -> delegateToBrowser");
      return "delegateToBrowser";
    }
    return "executeSubtask";
  }
  return "memoryStore";
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

const workflow = new StateGraph(DesktopSubGraphState)
  .addNode("memoryRetrieve", memoryRetrieveNode)
  .addNode("planner", plannerNode)
  .addNode("executeSubtask", executeSubtaskNode)
  .addNode("delegateToBrowser", delegateToBrowserNode)
  .addNode("verifier", verifierNode)
  .addNode("recovery", recoveryNode)
  .addNode("memoryStore", memoryStoreNode);

// Linear edges
workflow.addEdge("__start__", "memoryRetrieve");
workflow.addEdge("memoryRetrieve", "planner");

// Conditional edges
workflow.addConditionalEdges("planner", plannerRouter, {
  executeSubtask: "executeSubtask",
  memoryStore: "memoryStore",
});

workflow.addConditionalEdges("executeSubtask", executeSubtaskRouter, {
  verifier: "verifier",
  recovery: "recovery",
  delegateToBrowser: "delegateToBrowser",
});

workflow.addConditionalEdges("verifier", verifierRouter, {
  executeSubtask: "executeSubtask",
  memoryStore: "memoryStore",
  recovery: "recovery",
  delegateToBrowser: "delegateToBrowser",
});

workflow.addConditionalEdges("recovery", recoveryRouter, {
  executeSubtask: "executeSubtask",
  planner: "planner",
  memoryStore: "memoryStore",
});

workflow.addConditionalEdges("delegateToBrowser", (_state: any) => {
  if (_state.subtaskError) {
    log.debug("[Subgraph][delegateToBrowser] Browser delegation failed -> recovery");
    return "recovery";
  }
  const moreSubtasks = _state.currentSubtaskIndex < _state.subtasks.length;
  const nextSubtask = _state.subtasks?.[_state.currentSubtaskIndex];
  if (nextSubtask?.requiresBrowser) {
    log.debug("[Subgraph][delegateToBrowser] Next subtask also requires browser -> delegateToBrowser");
    return "delegateToBrowser";
  }
  if (moreSubtasks) {
    log.debug("[Subgraph][delegateToBrowser] More desktop subtasks remain -> executeSubtask");
    return "executeSubtask";
  }
  log.debug("[Subgraph][delegateToBrowser] No more subtasks -> memoryStore");
  return "memoryStore";
}, {
  executeSubtask: "executeSubtask",
  memoryStore: "memoryStore",
  delegateToBrowser: "delegateToBrowser",
  recovery: "recovery",
});

workflow.addEdge("memoryStore", END);

export const desktopSubgraph = workflow.compile();

// Log compilation
log.info("[Subgraph] Compiled with 7 nodes: memoryRetrieve, planner, executeSubtask, delegateToBrowser, verifier, recovery, memoryStore");

// ── Wrapper Function ─────────────────────────────────────────────────────────

export async function executeDesktopSubgraph(
  task: string,
  sessionId: string,
): Promise<{
  finalResponse: string;
  actions: Array<{ type: string; description: string; success: boolean }>;
  executionTrace: ExecutionTraceEntry[];
  uiPayloads: UIPayload[];
}> {
  const graphStart = Date.now();
  log.info(`[Subgraph] Executing desktop subgraph for task: "${task.slice(0, 100)}" (session: ${sessionId})`);

  const initialState = {
    task,
    sessionId,
  };

  const result = await desktopSubgraph.invoke(initialState);

  // Build trace timeline string
  const traceTimeline = result.executionTrace
    .map((e: ExecutionTraceEntry) => `${e.node}(${e.durationMs}ms)`)
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
