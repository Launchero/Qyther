/**
 * Document Agent Recovery — handles subtask failures with 5 strategies.
 *
 * Strategies: retry, replan, delegate_elsewhere, skip, abort.
 * Max 3 retries before forcing escalation.
 */

import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { createLogger } from '../../utils/logger';
import type { DocumentSubtask, DocumentRecoveryAction } from './types';

const log = createLogger('DocumentRecovery');

const MAX_RETRIES = 3;

const recoverySchema = z.object({
  strategy: z.enum(['retry', 'replan', 'delegate_elsewhere', 'skip', 'abort']),
  reason: z.string(),
  delegateTarget: z.enum(['browser', 'desktop']).optional(),
});

export class DocumentRecovery {
  private model: ChatOpenAI;

  constructor(model?: ChatOpenAI) {
    this.model =
      model ??
      new ChatOpenAI({
        model: process.env.MODEL || 'qwen3.6-plus',
        apiKey: process.env.API_KEY,
        configuration: { baseURL: process.env.BASE_URL },
        temperature: 0.1,
      });
  }

  /**
   * Determine recovery strategy based on failure analysis.
   * Uses LLM for complex cases, heuristic fallback for speed.
   */
  async analyze(
    subtask: DocumentSubtask,
    error: string,
    recoveryCount: number
  ): Promise<DocumentRecoveryAction> {
    // If we've hit max retries, force abort
    if (recoveryCount >= MAX_RETRIES) {
      log.warn(`[DocumentRecovery] Max retries (${MAX_RETRIES}) reached for subtask: "${subtask.description.slice(0, 60)}" — forcing abort`);
      return {
        strategy: 'abort',
        reason: `Max retries (${MAX_RETRIES}) exceeded: ${error.slice(0, 200)}`,
      };
    }

    // Heuristic: if error mentions browser/web/network, delegate to browser
    if (/\b(browser|website|url|web|network|fetch|scrape)\b/i.test(error.toLowerCase())) {
      log.info('[DocumentRecovery] Heuristic: error suggests browser delegation needed');
      return {
        strategy: 'delegate_elsewhere',
        delegateTarget: 'browser',
        reason: `Error suggests web interaction needed: ${error.slice(0, 200)}`,
      };
    }

    // Heuristic: if error mentions app/launch/open/file, delegate to desktop
    if (/\b(app|application|launch|open.*file|click|desktop|window)\b/i.test(error.toLowerCase())) {
      log.info('[DocumentRecovery] Heuristic: error suggests desktop interaction needed');
      return {
        strategy: 'delegate_elsewhere',
        delegateTarget: 'desktop',
        reason: `Error suggests desktop interaction needed: ${error.slice(0, 200)}`,
      };
    }

    // First retry: try again (transient error)
    if (recoveryCount === 0) {
      log.info('[DocumentRecovery] First failure — retrying same approach');
      return {
        strategy: 'retry',
        retryDelayMs: 500,
        reason: `Transient error on first attempt: ${error.slice(0, 200)}`,
      };
    }

    // Second retry: replan the subtask
    if (recoveryCount === 1) {
      log.info('[DocumentRecovery] Second failure — requesting replan');
      return {
        strategy: 'replan',
        reason: `Retry failed, need new approach: ${error.slice(0, 200)}`,
      };
    }

    // LLM analysis for uncertain cases
    return this.llmAnalyze(subtask, error, recoveryCount);
  }

  /**
   * Use LLM to analyze the failure and recommend a recovery strategy.
   */
  private async llmAnalyze(
    subtask: DocumentSubtask,
    error: string,
    recoveryCount: number
  ): Promise<DocumentRecoveryAction> {
    const systemPrompt = `Analyze this document generation failure and recommend a recovery strategy.

Strategies:
- retry: The same approach should work if tried again (transient errors)
- replan: The current plan is wrong, generate a new plan
- delegate_elsewhere: The subtask requires another agent (browser for web data, desktop for app interaction)
- skip: Skip this subtask and continue with others (non-critical subtasks)
- abort: Cannot complete, halt the entire document workflow

Recommend the best strategy with reasoning.`;

    const userPrompt = `Subtask: ${subtask.description}
Postcondition: ${subtask.postcondition}
Format: ${subtask.format}
Requires browser: ${subtask.requiresBrowser}
Requires desktop: ${subtask.requiresDesktop}

Error: ${error}
Recovery attempts so far: ${recoveryCount}`;

    try {
      const structuredLlm = this.model.withStructuredOutput(recoverySchema, {
        name: 'recovery_analysis',
      });

      const raw = await structuredLlm.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      return {
        strategy: raw.strategy,
        reason: raw.reason,
        delegateTarget: raw.delegateTarget,
      };
    } catch (err) {
      log.error(`[DocumentRecovery] LLM analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      // Fallback: retry if first attempt, otherwise abort
      return recoveryCount === 0
        ? { strategy: 'retry', retryDelayMs: 1000, reason: 'LLM recovery analysis failed, retrying as fallback' }
        : { strategy: 'abort', reason: `LLM analysis failed, aborting after ${recoveryCount} retries: ${error.slice(0, 200)}` };
    }
  }
}

export const documentRecovery = new DocumentRecovery();
