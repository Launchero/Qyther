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
