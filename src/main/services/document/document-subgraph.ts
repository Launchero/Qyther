/**
 * Document Agent Subgraph — 9-node StateGraph for document creation/editing.
 *
 * Nodes: memoryRetrieve, classifyAction, planner, executeAction, delegateToBrowser,
 *        delegateToDesktop, verifier, recovery, memoryStore
 *
 * Follows the same hierarchical pattern as desktop/browser subgraphs with
 * cross-agent delegation to browser (for research/data) and desktop (for app interaction).
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { createLogger } from '../../utils/logger';
import type { UIPayload } from '../langgraph/state';
import { documentMemory } from './document-memory';
import { documentPlanner } from './document-planner';
import { executeDocumentSubtask } from './document-executor';
import { verifyDocument } from './document-verifier';
import { documentRecovery } from './document-recovery';
import { delegateToBrowserNode, delegateToDesktopNode } from './document-delegation';
import type {
  DocumentSubtask,
  DocumentActionType,
  DocumentVerificationResult,
  DocumentDelegationResult,
  DocumentExecutionTraceEntry,
  DocumentTrajectoryRecord,
} from './types';

const log = createLogger('DocumentSubgraph');

const appendArray = <T>() => (a: T[] | undefined, b: T[]) => [...(a ?? []), ...b];

// ── State Definition ─────────────────────────────────────────────────────────

const DocumentSubGraphState = Annotation.Root({
  task: Annotation<string>(),
  sessionId: Annotation<string>(),
  actionType: Annotation<DocumentActionType>({
    default: () => 'read',
    reducer: (_state, update) => update,
  }),
  subtasks: Annotation<DocumentSubtask[]>({
    default: () => [],
    reducer: (_state, update) => update,
  }),
  currentSubtaskIndex: Annotation<number>({
    default: () => 0,
    reducer: (_state, update) => update,
  }),
  subtaskResult: Annotation<string>({
    default: () => '',
    reducer: (_state, update) => update,
  }),
  subtaskError: Annotation<string | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  planStatus: Annotation<'planning' | 'executing' | 'verifying' | 'complete' | 'failed' | 'recovering'>({
    default: () => 'planning',
    reducer: (_state, update) => update,
  }),
  memoryContext: Annotation<string>({
    default: () => '',
    reducer: (_state, update) => update,
  }),
  recoveryCount: Annotation<number>({
    default: () => 0,
    reducer: (_state, update) => update,
  }),
  finalResponse: Annotation<string>({
    default: () => '',
    reducer: (_state, update) => update,
  }),
  actions: Annotation<Array<{ type: string; description: string; success: boolean }>>({
    default: () => [],
    reducer: (_state, update) => update,
  }),
  executionTrace: Annotation<DocumentExecutionTraceEntry[]>({
    default: () => [],
    reducer: (_state, update) => update,
  }),
  verificationResult: Annotation<DocumentVerificationResult | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  delegatedToBrowser: Annotation<boolean>({
    default: () => false,
    reducer: (_state, update) => update,
  }),
  delegateResults: Annotation<DocumentDelegationResult | null>({
    default: () => null,
    reducer: (_state, update) => update,
  }),
  documentFilePath: Annotation<string>({
    default: () => '',
    reducer: (_state, update) => update,
  }),
  crossAgentContext: Annotation<{
    desktopResults: string[];
    browserResults: string[];
    documentResults: string[];
    sharedArtifacts: string[];
  }>({
    default: () => ({ desktopResults: [], browserResults: [], documentResults: [], sharedArtifacts: [] }),
    reducer: (a, b) => ({
      desktopResults: [...(a?.desktopResults ?? []), ...(b?.desktopResults ?? [])],
      browserResults: [...(a?.browserResults ?? []), ...(b?.browserResults ?? [])],
      documentResults: [...(a?.documentResults ?? []), ...(b?.documentResults ?? [])],
      sharedArtifacts: [...(a?.sharedArtifacts ?? []), ...(b?.sharedArtifacts ?? [])],
    }),
  }),
  uiPayloads: Annotation<UIPayload[]>({
    reducer: appendArray<UIPayload>(),
    default: () => [],
  }),
});

// ── Execution Trace Helper ───────────────────────────────────────────────────

function traceNode(
  nodeName: string,
  inputSummary: string,
  fn: () => Promise<Partial<typeof DocumentSubGraphState.State>>,
): (state: typeof DocumentSubGraphState.State) => Promise<Partial<typeof DocumentSubGraphState.State>> {
  return async (state: typeof DocumentSubGraphState.State) => {
    const enterMs = Date.now();
    log.debug(`[DocSubgraph] Entering node: ${nodeName}`);
    try {
      const result = await fn();
      const exitMs = Date.now();
      const durationMs = exitMs - enterMs;
      const outputSummary = JSON.stringify(result).slice(0, 200);
      const entry: DocumentExecutionTraceEntry = {
        node: nodeName,
        enterMs,
        exitMs,
        durationMs,
        inputSummary,
        outputSummary,
      };
      log.info(`[DocSubgraph] Node "${nodeName}" completed in ${durationMs}ms`);
      state.executionTrace = [...(state.executionTrace || []), entry];
      return result;
    } catch (error) {
      const exitMs = Date.now();
      const durationMs = exitMs - enterMs;
      const outputSummary = error instanceof Error ? error.message : String(error);
      const entry: DocumentExecutionTraceEntry = {
        node: nodeName,
        enterMs,
        exitMs,
        durationMs,
        inputSummary,
        outputSummary,
      };
      log.error(`[DocSubgraph] Node "${nodeName}" failed after ${durationMs}ms: ${outputSummary}`);
      state.executionTrace = [...(state.executionTrace || []), entry];
      throw error;
    }
  };
}

// ── Node: memoryRetrieve ─────────────────────────────────────────────────────

async function memoryRetrieveNode(state: typeof DocumentSubGraphState.State): Promise<Partial<typeof DocumentSubGraphState.State>> {
  return traceNode('memoryRetrieve', `task: "${state.task.slice(0, 100)}"`, async () => {
    const trajectories = await documentMemory.retrieve(state.task);
    const memoryContext = documentMemory.formatContext(trajectories);
    log.info(`[DocSubgraph][memoryRetrieve] Retrieved ${trajectories.length} trajectories, context: ${memoryContext.length} chars`);
    return { memoryContext };
  })(state);
}

// ── Node: classifyAction ─────────────────────────────────────────────────────

async function classifyActionNode(state: typeof DocumentSubGraphState.State): Promise<Partial<typeof DocumentSubGraphState.State>> {
  return traceNode('classifyAction', `task: "${state.task.slice(0, 100)}"`, async () => {
    const task = state.task.toLowerCase();

    let actionType: DocumentActionType = 'create';
    if (/\b(read|summarize|analyze|extract|review|what.*in|tell.*about)\b/i.test(task)) {
      actionType = 'read';
    } else if (/\b(modify|edit|update|change|add.*to|append.*to|fix.*in)\b/i.test(task)) {
      actionType = 'modify';
    }

    log.info(`[DocSubgraph][classifyAction] Classified as: ${actionType}`);
    return { actionType, planStatus: actionType === 'read' ? 'executing' : 'planning' };
  })(state);
}

// ── Node: planner ────────────────────────────────────────────────────────────

async function plannerNode(state: typeof DocumentSubGraphState.State): Promise<Partial<typeof DocumentSubGraphState.State>> {
  return traceNode('planner', `task: "${state.task.slice(0, 100)}"`, async () => {
    const subtasks = await documentPlanner.plan(state.task, state.memoryContext);

    if (!documentPlanner.validatePlan(subtasks)) {
      log.warn('[DocSubgraph][planner] Plan validation failed');
      return { planStatus: 'failed' as const };
    }

    log.info(`[DocSubgraph][planner] Generated ${subtasks.length} subtasks`);
    return {
      subtasks,
      currentSubtaskIndex: 0,
      planStatus: 'executing' as const,
    };
  })(state);
}

// ── Node: executeAction ──────────────────────────────────────────────────────

async function executeActionNode(state: typeof DocumentSubGraphState.State): Promise<Partial<typeof DocumentSubGraphState.State>> {
  const subtask = state.subtasks[state.currentSubtaskIndex];
  if (!subtask) {
    log.warn('[DocSubgraph][executeAction] No subtask at current index');
    return {
      subtaskError: 'No subtask available',
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
    };
  }

  return traceNode('executeAction', `subtask #${state.currentSubtaskIndex}: "${subtask.description}"`, async () => {
    const nodeStart = Date.now();
    log.info(`[DocSubgraph][executeAction] Executing: "${subtask.description}" (${subtask.format})`);

    try {
      // Build cross-agent context string for injection
      const browserResults = state.crossAgentContext?.browserResults ?? [];
      const contextStr = browserResults.length > 0
        ? browserResults.join('\n\n')
        : '';

      const result = await executeDocumentSubtask(subtask, state.task, contextStr || undefined);

      if (!result.success) {
        return {
          subtaskResult: '',
          subtaskError: result.message,
          planStatus: 'failed' as const,
          actions: [
            ...state.actions,
            { type: 'create_document', description: subtask.description, success: false },
          ],
        };
      }

      const elapsed = Date.now() - nodeStart;
      log.info(`[DocSubgraph][executeAction] Completed in ${elapsed}ms: ${result.message}`);

      const newDocumentResults = [...(state.crossAgentContext?.documentResults ?? []), result.message.slice(0, 500)];

      return {
        subtaskResult: result.message,
        subtaskError: null,
        finalResponse: state.finalResponse
          ? `${state.finalResponse}\n\n${result.message}`
          : result.message,
        documentFilePath: result.filePath,
        currentSubtaskIndex: state.currentSubtaskIndex + 1,
        planStatus: 'verifying' as const,
        crossAgentContext: {
          desktopResults: state.crossAgentContext?.desktopResults ?? [],
          browserResults: state.crossAgentContext?.browserResults ?? [],
          documentResults: newDocumentResults,
          sharedArtifacts: [...(state.crossAgentContext?.sharedArtifacts ?? []), result.filePath],
        },
        actions: [
          ...state.actions,
          { type: 'create_document', description: subtask.description, success: true },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`[DocSubgraph][executeAction] Error: ${errorMsg}`);
      return {
        subtaskResult: '',
        subtaskError: errorMsg,
        planStatus: 'failed' as const,
        actions: [
          ...state.actions,
          { type: 'create_document', description: subtask.description, success: false },
        ],
      };
    }
  })(state);
}

// ── Node: verifier ───────────────────────────────────────────────────────────

async function verifierNode(state: typeof DocumentSubGraphState.State): Promise<Partial<typeof DocumentSubGraphState.State>> {
  const subtask = state.subtasks[state.currentSubtaskIndex - 1]; // Last executed subtask
  if (!subtask || !state.documentFilePath) {
    log.warn('[DocSubgraph][verifier] No subtask or file path to verify');
    return {
      verificationResult: {
        passed: true,
        score: 1,
        signals: [],
        message: 'Nothing to verify',
      },
    };
  }

  return traceNode('verifier', `verifying: "${state.documentFilePath}"`, async () => {
    const executorResult = {
      success: true,
      filePath: state.documentFilePath,
      format: subtask.format,
      message: state.subtaskResult,
      structure: subtask.contentSpec ? {} : {},
    };

    const verification = await verifyDocument(state.documentFilePath, subtask, executorResult);
    log.info(`[DocSubgraph][verifier] Result: passed=${verification.passed}, score=${verification.score.toFixed(2)}`);

    return {
      verificationResult: verification,
      planStatus: verification.passed ? 'executing' : 'recovering' as const,
    };
  })(state);
}

// ── Node: recovery ───────────────────────────────────────────────────────────

async function recoveryNode(state: typeof DocumentSubGraphState.State): Promise<Partial<typeof DocumentSubGraphState.State>> {
  return traceNode('recovery', `recovering from: "${state.subtaskError}"`, async () => {
    const subtask = state.subtasks[state.currentSubtaskIndex - 1];
    if (!subtask) {
      return { planStatus: 'failed' as const };
    }

    const recoveryAction = await documentRecovery.analyze(
      subtask,
      state.subtaskError ?? 'Unknown error',
      state.recoveryCount
    );

    log.info(`[DocSubgraph][recovery] Strategy: ${recoveryAction.strategy} — ${recoveryAction.reason.slice(0, 100)}`);

    // Update the failed subtask status
    const updatedSubtasks = [...state.subtasks];
    if (updatedSubtasks[state.currentSubtaskIndex - 1]) {
      updatedSubtasks[state.currentSubtaskIndex - 1].status = 'failed';
    }

    switch (recoveryAction.strategy) {
      case 'retry':
        // Reset the subtask status and retry execution
        if (updatedSubtasks[state.currentSubtaskIndex - 1]) {
          updatedSubtasks[state.currentSubtaskIndex - 1].status = 'pending';
        }
        return {
          subtasks: updatedSubtasks,
          currentSubtaskIndex: state.currentSubtaskIndex - 1, // Go back to failed subtask
          subtaskError: null,
          recoveryCount: state.recoveryCount + 1,
          planStatus: 'executing' as const,
        };

      case 'replan':
        // Trigger replanning
        return {
          recoveryCount: state.recoveryCount + 1,
          planStatus: 'planning' as const,
        };

      case 'delegate_elsewhere':
        // Route to browser or desktop via conditional edge
        return {
          recoveryCount: state.recoveryCount + 1,
          planStatus: 'executing' as const,
          // Mark for delegation — the executeSubtaskRouter will pick it up
        };

      case 'skip':
        // Move to next subtask
        const hasNext = state.currentSubtaskIndex < state.subtasks.length;
        return {
          subtasks: updatedSubtasks,
          recoveryCount: state.recoveryCount + 1,
          planStatus: hasNext ? 'executing' : 'complete' as const,
          subtaskError: null,
        };

      case 'abort':
        return {
          planStatus: 'failed' as const,
          finalResponse: `${state.finalResponse}\n\nDocument workflow aborted: ${recoveryAction.reason}`,
        };

      default:
        return { planStatus: 'failed' as const };
    }
  })(state);
}

// ── Node: memoryStore ────────────────────────────────────────────────────────

async function memoryStoreNode(state: typeof DocumentSubGraphState.State): Promise<Partial<typeof DocumentSubGraphState.State>> {
  return traceNode('memoryStore', `storing trajectory for "${state.task.slice(0, 50)}"`, async () => {
    const trajectory: DocumentTrajectoryRecord = {
      id: state.sessionId,
      taskDescription: state.task,
      documentType: state.subtasks[0]?.format || 'docx',
      actionType: state.actionType,
      steps: state.actions.map((a, i) => ({
        stepIndex: i,
        action: a.type,
        args: {},
        result: a.description.slice(0, 200),
        durationMs: 0,
        success: a.success,
      })),
      outcome: state.finalResponse.slice(0, 500),
      success: state.planStatus === 'complete',
      createdAt: Date.now(),
    };

    try {
      await documentMemory.store(trajectory);
      log.info(`[DocSubgraph][memoryStore] Trajectory stored (${state.actions.length} actions)`);
    } catch (err) {
      log.warn(`[DocSubgraph][memoryStore] Storage failed: ${err}`);
    }

    return { planStatus: 'complete' as const };
  })(state);
}

// ── Conditional Routers ──────────────────────────────────────────────────────

function classifyActionRouter(state: typeof DocumentSubGraphState.State): string {
  switch (state.actionType) {
    case 'read':
      log.debug('[DocSubgraph][classifyActionRouter] -> executeAction (read)');
      return 'executeAction';
    case 'create':
      log.debug('[DocSubgraph][classifyActionRouter] -> planner');
      return 'planner';
    case 'modify':
      log.debug('[DocSubgraph][classifyActionRouter] -> planner (modify)');
      return 'planner';
    default:
      return 'planner';
  }
}

function plannerRouter(state: typeof DocumentSubGraphState.State): string {
  if (state.subtasks && state.subtasks.length > 0) {
    // Check if first subtask needs delegation
    const firstSubtask = state.subtasks[0];
    if (firstSubtask?.requiresBrowser) {
      log.debug('[DocSubgraph][plannerRouter] First subtask needs browser -> delegateToBrowser');
      return 'delegateToBrowser';
    }
    if (firstSubtask?.requiresDesktop) {
      log.debug('[DocSubgraph][plannerRouter] First subtask needs desktop -> delegateToDesktop');
      return 'delegateToDesktop';
    }
    log.debug('[DocSubgraph][plannerRouter] -> executeAction');
    return 'executeAction';
  }
  log.debug('[DocSubgraph][plannerRouter] No subtasks -> memoryStore');
  return 'memoryStore';
}

function executeSubtaskRouter(state: typeof DocumentSubGraphState.State): string {
  if (state.subtaskError) {
    log.debug('[DocSubgraph][executeSubtaskRouter] Error -> recovery');
    return 'recovery';
  }

  // Check if next subtask needs delegation
  const nextSubtask = state.subtasks?.[state.currentSubtaskIndex];
  if (nextSubtask?.requiresBrowser) {
    log.debug('[DocSubgraph][executeSubtaskRouter] Next needs browser -> delegateToBrowser');
    return 'delegateToBrowser';
  }
  if (nextSubtask?.requiresDesktop) {
    log.debug('[DocSubgraph][executeSubtaskRouter] Next needs desktop -> delegateToDesktop');
    return 'delegateToDesktop';
  }

  // Check if there are more subtasks
  if (state.currentSubtaskIndex < state.subtasks.length) {
    log.debug(`[DocSubgraph][executeSubtaskRouter] More subtasks remain -> executeAction`);
    return 'executeAction';
  }

  log.debug('[DocSubgraph][executeSubtaskRouter] No more subtasks -> verifier');
  return 'verifier';
}

function verifierRouter(state: typeof DocumentSubGraphState.State): string {
  const vr = state.verificationResult;
  if (!vr) {
    return 'executeAction';
  }

  if (vr.passed) {
    const moreSubtasks = state.currentSubtaskIndex < state.subtasks.length;
    if (moreSubtasks) {
      const nextSubtask = state.subtasks?.[state.currentSubtaskIndex];
      if (nextSubtask?.requiresBrowser) {
        log.debug('[DocSubgraph][verifierRouter] Verified, next needs browser -> delegateToBrowser');
        return 'delegateToBrowser';
      }
      if (nextSubtask?.requiresDesktop) {
        log.debug('[DocSubgraph][verifierRouter] Verified, next needs desktop -> delegateToDesktop');
        return 'delegateToDesktop';
      }
      log.debug('[DocSubgraph][verifierRouter] Verified, more subtasks -> executeAction');
      return 'executeAction';
    }
    log.debug('[DocSubgraph][verifierRouter] Verified, done -> memoryStore');
    return 'memoryStore';
  }

  // Verification failed
  if (vr.score >= 0.3) {
    // Partial pass — continue but warn
    log.debug('[DocSubgraph][verifierRouter] Partial pass, continuing');
    return 'memoryStore';
  }

  log.debug('[DocSubgraph][verifierRouter] Failed -> recovery');
  return 'recovery';
}

function recoveryRouter(state: typeof DocumentSubGraphState.State): string {
  const status = state.planStatus;

  switch (status) {
    case 'executing':
      // Check what recovery action was recommended
      const nextSubtask = state.subtasks?.[state.currentSubtaskIndex];
      if (nextSubtask?.requiresBrowser) return 'delegateToBrowser';
      if (nextSubtask?.requiresDesktop) return 'delegateToDesktop';
      return 'executeAction';
    case 'planning':
      return 'planner';
    case 'complete':
      return 'memoryStore';
    case 'failed':
      return 'memoryStore';
    default:
      return 'memoryStore';
  }
}

function delegateRouterBrowser(state: typeof DocumentSubGraphState.State): string {
  if (state.subtaskError) {
    log.debug('[DocSubgraph][delegateRouter:browser] Delegation failed -> recovery');
    return 'recovery';
  }
  const moreSubtasks = state.currentSubtaskIndex < state.subtasks.length;
  const nextSubtask = state.subtasks?.[state.currentSubtaskIndex];
  if (nextSubtask?.requiresBrowser) {
    log.debug('[DocSubgraph][delegateRouter:browser] Next also needs browser -> delegateToBrowser');
    return 'delegateToBrowser';
  }
  if (nextSubtask?.requiresDesktop) {
    log.debug('[DocSubgraph][delegateRouter:browser] Next needs desktop -> delegateToDesktop');
    return 'delegateToDesktop';
  }
  if (moreSubtasks) {
    log.debug('[DocSubgraph][delegateRouter:browser] More subtasks -> executeAction');
    return 'executeAction';
  }
  log.debug('[DocSubgraph][delegateRouter:browser] Done -> verifier');
  return 'verifier';
}

function delegateRouterDesktop(state: typeof DocumentSubGraphState.State): string {
  if (state.subtaskError) {
    log.debug('[DocSubgraph][delegateRouter:desktop] Delegation failed -> recovery');
    return 'recovery';
  }
  const moreSubtasks = state.currentSubtaskIndex < state.subtasks.length;
  const nextSubtask = state.subtasks?.[state.currentSubtaskIndex];
  if (nextSubtask?.requiresBrowser) {
    log.debug('[DocSubgraph][delegateRouter:desktop] Next needs browser -> delegateToBrowser');
    return 'delegateToBrowser';
  }
  if (nextSubtask?.requiresDesktop) {
    log.debug('[DocSubgraph][delegateRouter:desktop] Next also needs desktop -> delegateToDesktop');
    return 'delegateToDesktop';
  }
  if (moreSubtasks) {
    log.debug('[DocSubgraph][delegateRouter:desktop] More subtasks -> executeAction');
    return 'executeAction';
  }
  log.debug('[DocSubgraph][delegateRouter:desktop] Done -> verifier');
  return 'verifier';
}

// ── Graph Construction ───────────────────────────────────────────────────────

const workflow = new StateGraph(DocumentSubGraphState)
  .addNode('memoryRetrieve', memoryRetrieveNode)
  .addNode('classifyAction', classifyActionNode)
  .addNode('planner', plannerNode)
  .addNode('executeAction', executeActionNode)
  .addNode('delegateToBrowser', delegateToBrowserNode)
  .addNode('delegateToDesktop', delegateToDesktopNode)
  .addNode('verifier', verifierNode)
  .addNode('recovery', recoveryNode)
  .addNode('memoryStore', memoryStoreNode);

// Linear edges
workflow.addEdge('__start__', 'memoryRetrieve');
workflow.addEdge('memoryRetrieve', 'classifyAction');

// Conditional edges
workflow.addConditionalEdges('classifyAction', classifyActionRouter, {
  executeAction: 'executeAction',
  planner: 'planner',
});

workflow.addConditionalEdges('planner', plannerRouter, {
  executeAction: 'executeAction',
  delegateToBrowser: 'delegateToBrowser',
  delegateToDesktop: 'delegateToDesktop',
  memoryStore: 'memoryStore',
});

workflow.addConditionalEdges('executeAction', executeSubtaskRouter, {
  executeAction: 'executeAction',
  delegateToBrowser: 'delegateToBrowser',
  delegateToDesktop: 'delegateToDesktop',
  recovery: 'recovery',
  memoryStore: 'memoryStore',
  verifier: 'verifier',
});

workflow.addConditionalEdges('verifier', verifierRouter, {
  executeAction: 'executeAction',
  delegateToBrowser: 'delegateToBrowser',
  delegateToDesktop: 'delegateToDesktop',
  memoryStore: 'memoryStore',
  recovery: 'recovery',
});

workflow.addConditionalEdges('recovery', recoveryRouter, {
  executeAction: 'executeAction',
  planner: 'planner',
  delegateToBrowser: 'delegateToBrowser',
  delegateToDesktop: 'delegateToDesktop',
  memoryStore: 'memoryStore',
});

workflow.addConditionalEdges('delegateToBrowser', delegateRouterBrowser, {
  executeAction: 'executeAction',
  delegateToBrowser: 'delegateToBrowser',
  delegateToDesktop: 'delegateToDesktop',
  recovery: 'recovery',
  memoryStore: 'memoryStore',
  verifier: 'verifier',
});

workflow.addConditionalEdges('delegateToDesktop', delegateRouterDesktop, {
  executeAction: 'executeAction',
  delegateToBrowser: 'delegateToBrowser',
  delegateToDesktop: 'delegateToDesktop',
  recovery: 'recovery',
  memoryStore: 'memoryStore',
  verifier: 'verifier',
});

workflow.addEdge('memoryStore', END);

export const documentSubgraph = workflow.compile();

log.info('[DocSubgraph] Compiled with 9 nodes: memoryRetrieve, classifyAction, planner, executeAction, delegateToBrowser, delegateToDesktop, verifier, recovery, memoryStore');

// ── Wrapper Function ─────────────────────────────────────────────────────────

export interface DocumentSubgraphResult {
  finalResponse: string;
  filePath: string;
  actions: Array<{ type: string; description: string; success: boolean }>;
  executionTrace: DocumentExecutionTraceEntry[];
  planStatus: string;
  uiPayloads: UIPayload[];
}

export async function executeDocumentSubgraph(
  task: string,
  sessionId: string,
): Promise<DocumentSubgraphResult> {
  log.info(`[DocSubgraph] Starting document subgraph: "${task.slice(0, 80)}"`);

  const initialState = {
    task,
    sessionId,
    actionType: 'read' as DocumentActionType,
    subtasks: [] as DocumentSubtask[],
    currentSubtaskIndex: 0,
    subtaskResult: '',
    subtaskError: null as string | null,
    planStatus: 'planning' as const,
    memoryContext: '',
    recoveryCount: 0,
    finalResponse: '',
    actions: [] as Array<{ type: string; description: string; success: boolean }>,
    executionTrace: [] as DocumentExecutionTraceEntry[],
    verificationResult: null as DocumentVerificationResult | null,
    delegatedToBrowser: false,
    delegateResults: null as DocumentDelegationResult | null,
    documentFilePath: '',
    crossAgentContext: {
      desktopResults: [] as string[],
      browserResults: [] as string[],
      documentResults: [] as string[],
      sharedArtifacts: [] as string[],
    },
  };

  try {
    const result = await documentSubgraph.invoke(initialState);

    log.info(`[DocSubgraph] Completed: planStatus=${result.planStatus}, actions=${result.actions.length}`);

    return {
      finalResponse: result.finalResponse,
      filePath: result.documentFilePath,
      actions: result.actions,
      executionTrace: result.executionTrace,
      planStatus: result.planStatus,
      uiPayloads: result.uiPayloads ?? [],
    };
  } catch (error) {
    log.error(`[DocSubgraph] Error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      finalResponse: `Document workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      filePath: '',
      actions: [],
      executionTrace: [],
      planStatus: 'failed',
      uiPayloads: [],
    };
  }
}
