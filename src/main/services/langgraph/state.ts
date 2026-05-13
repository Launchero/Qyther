import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { Subtask, ExecutionTraceEntry, SubtaskVerificationResult } from "../desktop/types";
import type { BrowserExecutionTraceEntry } from "../browser/types";
import type { DocumentSubtask, DocumentActionType, DocumentVerificationResult, DocumentDelegationResult, DocumentExecutionTraceEntry, DocumentFormat } from "../document/types";

export interface Source {
  url: string;
  title: string;
  excerpt: string;
}

export interface ReasoningStep {
  step: string;
  status: "pending" | "in_progress" | "completed" | "error";
  detail: string;
}

export interface Attachment {
  name: string;
  content: string;
  type: string;
}

export interface UIPayload {
  type: 'table' | 'comparison' | 'form' | 'list' | 'chart';
  title: string;
  data: Record<string, unknown>;
  node: string;
}

export interface DesktopAction {
  type: string;
  description: string;
  success: boolean;
  result?: string;
}

/** Status of the desktop subgraph execution */
export type DesktopPlanStatus = 'planning' | 'executing' | 'verifying' | 'complete' | 'failed' | 'recovering';

// Replace reducer: each node output fully replaces the previous value.
// Prevents stale accumulation across graph runs when a thread is reused.
const replaceArray = <T>() => (_a: T[] | undefined, b: T[]) => b;

/** Results from a cross-agent delegation to the browser subgraph */
export interface BrowserDelegationResult {
  subtaskIndex: number;
  browserSessionId: string;
  finalResponse: string;
  actions: Array<{ type: string; description: string; success: boolean }>;
  executionTrace: BrowserExecutionTraceEntry[];
  artifacts: string[];
}

/** Shared context passed between desktop, browser, and document agents during cross-agent workflows */
export interface CrossAgentContext {
  desktopResults: string[];
  browserResults: string[];
  documentResults: string[];
  sharedArtifacts: string[];
}

export const AskState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: replaceArray<BaseMessage>(),
    default: () => [],
  }),
  userQuery: Annotation<string>,
  attachments: Annotation<Attachment[]>({
    reducer: replaceArray<Attachment>(),
    default: () => [],
  }),
  intent: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "general",
  }),
  researchResults: Annotation<string[]>({
    reducer: replaceArray<string>(),
    default: () => [],
  }),
  sources: Annotation<Source[]>({
    reducer: replaceArray<Source>(),
    default: () => [],
  }),
  finalResponse: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
  reasoningSteps: Annotation<ReasoningStep[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  validationScore: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  retryCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  validationVerdict: Annotation<"approved" | "rewrite" | "replan">({
    reducer: (_a, b) => b,
    default: () => "approved",
  }),
  validationCritique: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
  confidence: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  qualityScore: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  complexityScore: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "simple",
  }),
  searchQueries: Annotation<string[]>({
    reducer: replaceArray<string>(),
    default: () => [],
  }),
  verified: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  uiPayloads: Annotation<UIPayload[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),
  previousIntent: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "general",
  }),

  /** Currently active agent type for UI indicator (e.g. 'research', 'browser', 'desktop', 'document', 'general') */
  activeAgent: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  // ── Desktop Subgraph State (Hierarchical Planning) ───────────────────────────

  /** Ordered list of subtasks from the planner */
  desktopSubtasks: Annotation<Subtask[]>({
    reducer: replaceArray<Subtask>(),
    default: () => [],
  }),

  /** Current subtask index being executed (0-based) */
  currentSubtaskIndex: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  /** Result of the current subtask execution */
  desktopSubtaskResult: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Overall status of the desktop subgraph */
  desktopPlanStatus: Annotation<DesktopPlanStatus>({
    reducer: (_a, b) => b,
    default: () => "planning",
  }),

  /** Retrieved memory context from episodic memory, injected into planner prompt */
  desktopMemoryContext: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Number of recovery attempts for the current subtask */
  desktopRecoveryCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  /** Execution trace for debugging - timeline of all node executions */
  desktopExecutionTrace: Annotation<ExecutionTraceEntry[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),

  /** Last verification result for the current subtask */
  desktopLastVerification: Annotation<SubtaskVerificationResult | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  // ── Legacy Desktop Fields (preserved for backward compatibility) ─────────────

  /** Accumulated actions during the ReAct loop for HITL review */
  desktopActions: Annotation<DesktopAction[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),

  /** HITL confirmation context/data */
  desktopConfirmationState: Annotation<Record<string, unknown>>({
    reducer: (_a, b) => b,
    default: () => ({}),
  }),

  /** Unique session identifier (format: desktop-${timestamp}) */
  desktopSessionId: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Verification score for desktop task outcomes */
  desktopVerificationScore: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  // ── Cross-Agent Delegation State ─────────────────────────────────────────────

  /** Unique browser session ID when browser is delegated from desktop subgraph */
  browserSessionId: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Results from delegated browser subgraph execution */
  delegateResults: Annotation<BrowserDelegationResult | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  /** Shared context between desktop, browser, and document agents during cross-agent workflows */
  crossAgentContext: Annotation<CrossAgentContext>({
    reducer: (a, b) => ({
      desktopResults: [...(a?.desktopResults ?? []), ...(b?.desktopResults ?? [])],
      browserResults: [...(a?.browserResults ?? []), ...(b?.browserResults ?? [])],
      documentResults: [...(a?.documentResults ?? []), ...(b?.documentResults ?? [])],
      sharedArtifacts: [...(a?.sharedArtifacts ?? []), ...(b?.sharedArtifacts ?? [])],
    }),
    default: () => ({
      desktopResults: [],
      browserResults: [],
      documentResults: [],
      sharedArtifacts: [],
    }),
  }),

  // ── Document Subgraph State (Hierarchical Planning + Cross-Agent Delegation) ─

  /** Document subtask classification: read, create, or modify */
  documentActionType: Annotation<DocumentActionType>({
    reducer: (_a, b) => b,
    default: () => "read",
  }),

  /** Target document format */
  documentFormat: Annotation<DocumentFormat | "">({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Ordered list of subtasks from the document planner */
  documentSubtasks: Annotation<DocumentSubtask[]>({
    reducer: replaceArray<DocumentSubtask>(),
    default: () => [],
  }),

  /** Current document subtask index being executed (0-based) */
  documentSubtaskIndex: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  /** Overall status of the document subgraph */
  documentPlanStatus: Annotation<"planning" | "executing" | "verifying" | "complete" | "failed" | "recovering">({
    reducer: (_a, b) => b,
    default: () => "planning",
  }),

  /** Path to the generated/modified document file */
  documentFilePath: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Artifacts produced by document generation (file paths, export URLs, etc.) */
  documentArtifacts: Annotation<string[]>({
    reducer: replaceArray<string>(),
    default: () => [],
  }),

  /** Retrieved memory context from document episodic memory */
  documentMemoryContext: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Number of recovery attempts for the current document subtask */
  documentRecoveryCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  /** Last verification result for the current document subtask */
  documentLastVerification: Annotation<DocumentVerificationResult | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  /** Execution trace for document subgraph debugging */
  documentExecutionTrace: Annotation<DocumentExecutionTraceEntry[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),

  /** Unique document session identifier */
  documentSessionId: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),

  /** Result from delegating to browser/desktop during document workflow */
  documentDelegateResult: Annotation<DocumentDelegationResult | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
});

export type AskStateType = typeof AskState.State;

/**
 * Create a JSON-safe debug snapshot of state for logging.
 * Excludes large payloads (images, screenshots, large arrays).
 */
export function debugSnapshot(state: AskStateType): Record<string, unknown> {
  return {
    intent: state.intent,
    complexityScore: state.complexityScore,
    confidence: state.confidence,
    qualityScore: state.qualityScore,
    verified: state.verified,
    desktopPlanStatus: state.desktopPlanStatus,
    currentSubtaskIndex: state.currentSubtaskIndex,
    desktopSubtasksCount: state.desktopSubtasks.length,
    desktopSubtasksPreview: state.desktopSubtasks.slice(0, 2).map(s => ({
      id: s.id,
      description: s.description.slice(0, 40),
      status: s.status,
    })),
    desktopRecoveryCount: state.desktopRecoveryCount,
    desktopMemoryContextLength: state.desktopMemoryContext.length,
    desktopActionsCount: state.desktopActions.length,
    desktopSessionId: state.desktopSessionId,
    messagesCount: state.messages.length,
    executionTraceCount: state.desktopExecutionTrace.length,
    documentPlanStatus: state.documentPlanStatus,
    documentActionType: state.documentActionType,
    documentSubtasksCount: state.documentSubtasks.length,
    documentSubtaskIndex: state.documentSubtaskIndex,
    documentFilePath: state.documentFilePath,
    documentRecoveryCount: state.documentRecoveryCount,
    documentExecutionTraceCount: state.documentExecutionTrace.length,
    documentSessionId: state.documentSessionId,
    crossAgentDocumentResults: state.crossAgentContext?.documentResults?.length ?? 0,
  };
}
