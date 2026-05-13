/**
 * Type definitions for the document agent subgraph.
 * Mirrors the desktop/browser subgraph type patterns for consistency.
 */

// ── Document Subtask Types ───────────────────────────────────────────────────

/**
 * Supported document formats for creation and modification.
 */
export type DocumentFormat = 'docx' | 'pptx' | 'xlsx';

/**
 * The action type for a document task.
 */
export type DocumentActionType = 'read' | 'create' | 'modify';

/**
 * A subtask within a hierarchical document plan.
 * Extends the base Subtask pattern with document-specific fields.
 */
export interface DocumentSubtask {
  id: string;
  description: string;
  precondition: string;
  postcondition: string;
  maxSteps: number;
  status: 'pending' | 'executing' | 'verified' | 'failed' | 'skipped';
  /** Document format this subtask produces or modifies */
  format: DocumentFormat;
  /** When true, this subtask requires browser automation for data/research */
  requiresBrowser: boolean;
  /** When true, this subtask requires desktop interaction (open app, click, etc.) */
  requiresDesktop: boolean;
  /** Content specification for the executor (sections, slides, rows, etc.) */
  contentSpec?: Record<string, unknown>;
}

// ── Verification Types ──────────────────────────────────────────────────────

/**
 * A signal from document verification (file-level checks).
 */
export interface DocumentVerificationSignal {
  type: 'file_exists' | 'format_valid' | 'content_present' | 'structure_match' | 'parse_error';
  value?: string | number;
  passed: boolean;
}

/**
 * Result from verifying a generated/modified document.
 */
export interface DocumentVerificationResult {
  passed: boolean;
  score: number; // 0-1
  signals: DocumentVerificationSignal[];
  message: string;
  /** Expected vs actual structural counts (slides, sheets, sections, etc.) */
  expectedStructure?: Record<string, number>;
  actualStructure?: Record<string, number>;
}

// ── Recovery Types ──────────────────────────────────────────────────────────

/**
 * Recovery action from the document recovery node.
 */
export interface DocumentRecoveryAction {
  strategy: 'retry' | 'replan' | 'delegate_elsewhere' | 'skip' | 'abort';
  retryDelayMs?: number;
  reason: string;
  /** If delegate_elsewhere, which agent to delegate to */
  delegateTarget?: 'browser' | 'desktop';
}

// ── Delegation Types ────────────────────────────────────────────────────────

/**
 * Result from delegating a subtask to another agent (browser or desktop).
 */
export interface DocumentDelegationResult {
  subtaskIndex: number;
  targetAgent: 'browser' | 'desktop';
  sessionId: string;
  finalResponse: string;
  actions: Array<{ type: string; description: string; success: boolean }>;
  executionTrace: DocumentExecutionTraceEntry[];
  artifacts: string[];
}

// ── Execution Trace Types ───────────────────────────────────────────────────

/**
 * Entry in the document execution trace for debugging.
 */
export interface DocumentExecutionTraceEntry {
  node: string;
  enterMs: number;
  exitMs: number;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
}

// ── Memory Types ────────────────────────────────────────────────────────────

/**
 * A single step within a document trajectory record.
 */
export interface DocumentTrajectoryStep {
  stepIndex: number;
  action: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
  success: boolean;
}

/**
 * A complete document task execution record for episodic memory.
 */
export interface DocumentTrajectoryRecord {
  id: string;
  taskDescription: string;
  documentType: DocumentFormat;
  actionType: DocumentActionType;
  steps: DocumentTrajectoryStep[];
  outcome: string;
  success: boolean;
  createdAt: number;
}

// ── Executor Result Types ───────────────────────────────────────────────────

/**
 * Result from the document executor node.
 */
export interface DocumentExecutorResult {
  success: boolean;
  filePath: string;
  format: DocumentFormat;
  message: string;
  /** Structural summary for verification (e.g., { sections: 3, paragraphs: 12 }) */
  structure: Record<string, number>;
}
