/**
 * Document Agent Delegation Nodes.
 *
 * Follows the same pattern as desktop's delegateToBrowserNode:
 * 1. Build task with accumulated document context
 * 2. Call executeBrowserSubgraph() or executeDesktopSubgraph()
 * 3. Accumulate results into crossAgentContext
 * 4. Increment currentSubtaskIndex, continue plan
 */

import { createLogger } from '../../utils/logger';
import { executeBrowserSubgraph } from '../browser/browser-subgraph';
import { executeDesktopSubgraph } from '../desktop/desktop-subgraph';
import type { DocumentSubtask, DocumentExecutionTraceEntry } from './types';

const log = createLogger('DocumentDelegation');

interface DelegationState {
  subtasks: DocumentSubtask[];
  currentSubtaskIndex: number;
  subtaskResult: string;
  subtaskError: string | null;
  finalResponse: string;
  crossAgentContext: {
    desktopResults: string[];
    browserResults: string[];
    documentResults: string[];
    sharedArtifacts: string[];
  };
  documentExecutionTrace: DocumentExecutionTraceEntry[];
  actions: Array<{ type: string; description: string; success: boolean }>;
  documentSessionId: string;
}

/**
 * Delegate the current subtask to the browser subgraph for web research/data extraction.
 */
export async function delegateToBrowserNode(state: DelegationState): Promise<Partial<DelegationState>> {
  const subtask = state.subtasks[state.currentSubtaskIndex];
  if (!subtask) {
    log.warn('[DocumentDelegation] No subtask at current index for browser delegation');
    return {
      subtaskError: 'No subtask available for browser delegation',
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
    };
  }

  const nodeStart = Date.now();
  const browserSessionId = `doc-browser-delegate-${Date.now()}`;
  log.info(`[DocumentDelegation] Delegating subtask #${state.currentSubtaskIndex} to browser: "${subtask.description.slice(0, 80)}"`);

  // Build browser task with document context accumulated so far
  const documentResults = state.crossAgentContext?.documentResults ?? [];
  const contextPrefix = documentResults.length > 0
    ? `DOCUMENT CONTEXT (from document agent before this browser task):\n${documentResults.join('\n')}\n\n`
    : '';

  const browserTask = `${contextPrefix}BROWSER TASK: ${subtask.description}. Postcondition: ${subtask.postcondition}`;

  try {
    const browserResult = await executeBrowserSubgraph(browserTask, browserSessionId);
    const browserFinalResponse = browserResult.finalResponse;
    const browserActions = browserResult.actions || [];

    const elapsed = Date.now() - nodeStart;
    log.info(`[DocumentDelegation] Browser delegation completed in ${elapsed}ms`);

    // Extract artifacts from browser actions
    const artifacts = browserActions
      .filter(a => a.success)
      .map(a => a.description)
      .slice(0, 5);

    // Build cross-agent context update
    const newBrowserResults = [...(state.crossAgentContext?.browserResults ?? []), browserFinalResponse.slice(0, 500)];

    const separator = state.finalResponse ? '\n\n' : '';
    const newResponse = `${separator}[Subtask ${state.currentSubtaskIndex + 1}/${state.subtasks.length}] ${subtask.description} [BROWSER]: ${browserFinalResponse}`;

    // Trace entry
    const traceEntry: DocumentExecutionTraceEntry = {
      node: 'delegateToBrowser',
      enterMs: nodeStart,
      exitMs: Date.now(),
      durationMs: elapsed,
      inputSummary: subtask.description.slice(0, 200),
      outputSummary: browserFinalResponse.slice(0, 200),
    };

    return {
      subtaskResult: browserFinalResponse,
      subtaskError: null,
      finalResponse: state.finalResponse + newResponse,
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
      crossAgentContext: {
        desktopResults: state.crossAgentContext?.desktopResults ?? [],
        browserResults: newBrowserResults,
        documentResults: state.crossAgentContext?.documentResults ?? [],
        sharedArtifacts: [...(state.crossAgentContext?.sharedArtifacts ?? []), ...artifacts],
      },
      documentExecutionTrace: [...state.documentExecutionTrace, traceEntry],
      actions: [
        ...state.actions,
        { type: 'delegate_browser', description: subtask.description, success: true },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[DocumentDelegation] Browser delegation failed: ${errorMsg}`);

    const traceEntry: DocumentExecutionTraceEntry = {
      node: 'delegateToBrowser',
      enterMs: nodeStart,
      exitMs: Date.now(),
      durationMs: Date.now() - nodeStart,
      inputSummary: subtask.description.slice(0, 200),
      outputSummary: `FAILED: ${errorMsg}`,
    };

    return {
      subtaskResult: '',
      subtaskError: `Browser delegation failed: ${errorMsg}`,
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
      documentExecutionTrace: [...state.documentExecutionTrace, traceEntry],
      actions: [
        ...state.actions,
        { type: 'delegate_browser', description: subtask.description, success: false },
      ],
    };
  }
}

/**
 * Delegate the current subtask to the desktop subgraph for app interaction.
 */
export async function delegateToDesktopNode(state: DelegationState): Promise<Partial<DelegationState>> {
  const subtask = state.subtasks[state.currentSubtaskIndex];
  if (!subtask) {
    log.warn('[DocumentDelegation] No subtask at current index for desktop delegation');
    return {
      subtaskError: 'No subtask available for desktop delegation',
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
    };
  }

  const nodeStart = Date.now();
  const desktopSessionId = `doc-desktop-delegate-${Date.now()}`;
  log.info(`[DocumentDelegation] Delegating subtask #${state.currentSubtaskIndex} to desktop: "${subtask.description.slice(0, 80)}"`);

  // Build desktop task with document context
  const documentResults = state.crossAgentContext?.documentResults ?? [];
  const contextPrefix = documentResults.length > 0
    ? `DOCUMENT CONTEXT (completed actions before this desktop task):\n${documentResults.join('\n')}\n\n`
    : '';

  const desktopTask = `${contextPrefix}DESKTOP TASK: ${subtask.description}. Postcondition: ${subtask.postcondition}`;

  try {
    const desktopResult = await executeDesktopSubgraph(desktopTask, desktopSessionId);
    const desktopFinalResponse = desktopResult.finalResponse;
    const desktopActions = desktopResult.actions || [];

    const elapsed = Date.now() - nodeStart;
    log.info(`[DocumentDelegation] Desktop delegation completed in ${elapsed}ms`);

    const artifacts = desktopActions
      .filter(a => a.success)
      .map(a => a.description)
      .slice(0, 5);

    const newDesktopResults = [...(state.crossAgentContext?.desktopResults ?? []), desktopFinalResponse.slice(0, 500)];

    const separator = state.finalResponse ? '\n\n' : '';
    const newResponse = `${separator}[Subtask ${state.currentSubtaskIndex + 1}/${state.subtasks.length}] ${subtask.description} [DESKTOP]: ${desktopFinalResponse}`;

    const traceEntry: DocumentExecutionTraceEntry = {
      node: 'delegateToDesktop',
      enterMs: nodeStart,
      exitMs: Date.now(),
      durationMs: elapsed,
      inputSummary: subtask.description.slice(0, 200),
      outputSummary: desktopFinalResponse.slice(0, 200),
    };

    return {
      subtaskResult: desktopFinalResponse,
      subtaskError: null,
      finalResponse: state.finalResponse + newResponse,
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
      crossAgentContext: {
        desktopResults: newDesktopResults,
        browserResults: state.crossAgentContext?.browserResults ?? [],
        documentResults: state.crossAgentContext?.documentResults ?? [],
        sharedArtifacts: [...(state.crossAgentContext?.sharedArtifacts ?? []), ...artifacts],
      },
      documentExecutionTrace: [...state.documentExecutionTrace, traceEntry],
      actions: [
        ...state.actions,
        { type: 'delegate_desktop', description: subtask.description, success: true },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[DocumentDelegation] Desktop delegation failed: ${errorMsg}`);

    const traceEntry: DocumentExecutionTraceEntry = {
      node: 'delegateToDesktop',
      enterMs: nodeStart,
      exitMs: Date.now(),
      durationMs: Date.now() - nodeStart,
      inputSummary: subtask.description.slice(0, 200),
      outputSummary: `FAILED: ${errorMsg}`,
    };

    return {
      subtaskResult: '',
      subtaskError: `Desktop delegation failed: ${errorMsg}`,
      currentSubtaskIndex: state.currentSubtaskIndex + 1,
      documentExecutionTrace: [...state.documentExecutionTrace, traceEntry],
      actions: [
        ...state.actions,
        { type: 'delegate_desktop', description: subtask.description, success: false },
      ],
    };
  }
}
