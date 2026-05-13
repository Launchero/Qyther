import type { Subtask, SubtaskVerificationResult, RecoveryAction } from './types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DesktopRecovery');

const NON_TRANSIENT_PATTERNS = [
  'element not found',
  'window not found',
  'file not found',
];

const TRANSIENT_PATTERNS = [
  'timeout',
  'failed to capture',
  'access denied',
];

const MAX_RETRIES = 2;

interface DecisionLogEntry {
  strategy: string;
  applicable: boolean;
  reason: string;
  outcome: string;
}

export class DesktopRecovery {
  private decisionLog: DecisionLogEntry[] = [];

  /**
   * Determine if an error is retryable.
   * Non-transient errors (not found patterns) are never retryable.
   * Transient errors (timeouts, capture failures, access denied) may be retryable.
   * Max retries enforced via recoveryCount < MAX_RETRIES.
   */
  shouldRetry(error: string, recoveryCount: number): boolean {
    if (recoveryCount >= MAX_RETRIES) {
      return false;
    }

    const lowerError = error.toLowerCase();

    // Not retryable if matches non-transient patterns
    for (const pattern of NON_TRANSIENT_PATTERNS) {
      if (lowerError.includes(pattern)) {
        return false;
      }
    }

    // Retryable if matches transient patterns
    for (const pattern of TRANSIENT_PATTERNS) {
      if (lowerError.includes(pattern)) {
        return true;
      }
    }

    // Default: not retryable if no transient pattern matched
    return false;
  }

  /**
   * Execute 5-tier recovery strategy for a failed subtask.
   * Returns a RecoveryAction guiding the next step.
   */
  async recover(
    failedSubtask: Subtask,
    error: string,
    verifierResult: SubtaskVerificationResult | null,
    recoveryCount: number,
  ): Promise<RecoveryAction> {
    this.decisionLog = [];

    logger.info(
      `Subtask "${failedSubtask.description}" failed: ${error}`,
    );

    const retryable = this.shouldRetry(error, recoveryCount);

    // Strategy 1: Retry with delay
    if (retryable && recoveryCount < MAX_RETRIES) {
      this.decisionLog.push({
        strategy: 'retry',
        applicable: true,
        reason: `Error may be transient, retry ${recoveryCount + 1}/${MAX_RETRIES}`,
        outcome: 'RETRY',
      });
      logger.info(
        `Strategy 1 (retry): APPLICABLE - retry ${recoveryCount + 1}/${MAX_RETRIES}`,
      );
      const action: RecoveryAction = {
        strategy: 'retry',
        retryDelayMs: 2000,
        reason: `Retrying subtask "${failedSubtask.description}" after transient error`,
      };
      logger.info(`Outcome: RETRY (subtask re-queued at index N)`);
      return action;
    } else if (!retryable && recoveryCount < MAX_RETRIES) {
      this.decisionLog.push({
        strategy: 'retry',
        applicable: false,
        reason: `${error} is not transient`,
        outcome: 'NOT_APPLICABLE',
      });
      logger.info(
        `Strategy 1 (retry): NOT applicable - ${error} is not transient`,
      );
    }

    // Strategy 2: Alternative approach
    const alternative = this.findAlternative(failedSubtask, error);
    if (alternative) {
      this.decisionLog.push({
        strategy: 'alternative',
        applicable: true,
        reason: `Using ${alternative.replacementTool} as fallback`,
        outcome: 'ALTERNATIVE',
      });
      logger.info(
        `Strategy 2 (alternative): Using ${alternative.replacementTool} as fallback`,
      );
      logger.info(`Recovery action: ${JSON.stringify(alternative)}`);
      return alternative;
    } else {
      this.decisionLog.push({
        strategy: 'alternative',
        applicable: false,
        reason: 'No alternative approach available',
        outcome: 'NOT_APPLICABLE',
      });
      logger.info(
        'Strategy 2 (alternative): NOT applicable - no alternative found',
      );
    }

    // Strategy 3: Re-plan subtask
    if (recoveryCount < MAX_RETRIES) {
      this.decisionLog.push({
        strategy: 'replan',
        applicable: true,
        reason: 'Marking for LLM re-planning',
        outcome: 'REPLAN',
      });
      logger.info('Strategy 3 (replan): APPLICABLE - marking for LLM re-planning');
      const action: RecoveryAction = {
        strategy: 'replan',
        reason: `Subtask "${failedSubtask.description}" requires re-planning`,
      };
      return action;
    }

    // Strategy 4: Skip & continue
    this.decisionLog.push({
      strategy: 'skip',
      applicable: true,
      reason: 'Marking subtask as skipped',
      outcome: 'SKIP',
    });
    logger.info(
      `Strategy 4 (skip): APPLICABLE - skipping subtask "${failedSubtask.description}"`,
    );
    const action: RecoveryAction = {
      strategy: 'skip',
      reason: `Skipping subtask "${failedSubtask.description}" after recovery failure`,
    };
    return action;
  }

  /**
   * Return the decision log for debugging.
   */
  getDecisionLog(): DecisionLogEntry[] {
    return [...this.decisionLog];
  }

  /**
   * Generate a human-readable explanation of the recovery decision.
   */
  explainDecision(subtask: Subtask, error: string): string {
    const retryable = this.shouldRetry(error, 0);
    const parts: string[] = [];

    parts.push(`Subtask "${subtask.description}" failed: ${error}`);
    parts.push(
      retryable
        ? 'The error appears transient and may succeed on retry.'
        : 'The error is not transient and retry is unlikely to help.',
    );

    const log = this.decisionLog;
    if (log.length > 0) {
      parts.push('Recovery decisions:');
      for (const entry of log) {
        parts.push(
          `- ${entry.strategy}: ${entry.applicable ? 'APPLICABLE' : 'NOT APPLICABLE'} — ${entry.reason}`,
        );
      }
    }

    return parts.join('\n');
  }

  private findAlternative(
    subtask: Subtask,
    error: string,
  ): RecoveryAction | null {
    const lowerError = error.toLowerCase();

    // click_element failed -> suggest click by coordinates
    if (lowerError.includes('element not found')) {
      return {
        strategy: 'alternative',
        replacementTool: 'click',
        replacementArgs: { useLastScreenshot: true },
        reason: 'Element not found, falling back to click by coordinates from last screenshot',
      };
    }

    // window focus failed -> suggest alternative window method
    if (lowerError.includes('window not found')) {
      return {
        strategy: 'alternative',
        replacementTool: 'get_window_list',
        reason: 'Window not found, falling back to window list enumeration',
      };
    }

    // screenshot capture failed -> suggest retry with different monitor
    if (lowerError.includes('failed to capture')) {
      return {
        strategy: 'alternative',
        replacementTool: 'screenshot',
        replacementArgs: { monitorIndex: 0 },
        reason: 'Screenshot capture failed, falling back to primary monitor',
      };
    }

    return null;
  }
}

export const desktopRecovery = new DesktopRecovery();
