/**
 * Episodic Memory Service for the desktop agent.
 *
 * Provides retrieval, storage, and formatting of past trajectories
 * to inform future task execution via system prompt injection.
 */

import { getDatabaseManager } from '../database/database-manager';
import { createLogger } from '../../utils/logger';
import type { TrajectoryRecord } from './types';
import type { FailureRow } from '../database/schema';

const log = createLogger('DesktopMemory');

let statsLogged = false;

export class DesktopMemory {
  /**
   * Retrieve similar past trajectories for a given task description.
   * Uses keyword-based LIKE matching via DatabaseManager.
   */
  async retrieve(taskDescription: string, limit = 3): Promise<TrajectoryRecord[]> {
    const keywords = this.extractKeywords(taskDescription);

    try {
      const db = getDatabaseManager();
      const results = await db.searchSimilarTrajectories(taskDescription, limit);

      if (results.length > 0) {
        log.info(`[Memory] Retrieved ${results.length} trajectories for "${taskDescription}" (keywords: ${keywords.join(', ')})`);
      } else {
        log.info(`[Memory] No similar trajectories found (keywords: ${keywords.length > 0 ? keywords.join(', ') : 'none'}). Memory context empty.`);
      }

      return results;
    } catch (err) {
      log.warn(`[Memory] Retrieval failed: ${err}. Returning empty context.`);
      return [];
    }
  }

  /**
   * Store a completed trajectory record for future retrieval.
   */
  async store(trajectory: TrajectoryRecord): Promise<void> {
    try {
      const db = getDatabaseManager();
      await db.saveTrajectory(trajectory);

      log.info(
        `[Memory] Stored trajectory "${trajectory.taskDescription.slice(0, 50)}" (id=${trajectory.id}, success=${trajectory.success}, ${trajectory.steps.length} steps, ${trajectory.steps.reduce((s, st) => s + st.durationMs, 0)}ms)`
      );
    } catch (err) {
      log.warn(`[Memory] Failed to store trajectory: ${err}`);
    }
  }

  /**
   * Record a failure for pattern avoidance.
   */
  async recordFailure(taskDescription: string, toolName: string, error: string): Promise<void> {
    try {
      const db = getDatabaseManager();
      await db.recordFailure(taskDescription, toolName, 'runtime_error', error);

      // Get count of similar failures for this tool
      const failures = await db.getRecentFailures(toolName, 100);
      const similarCount = failures.filter(
        f => f.error_message.toLowerCase().includes(error.toLowerCase().slice(0, 30))
      ).length;

      log.info(
        `[Memory] Recorded failure: "${taskDescription.slice(0, 30)}" -> ${toolName} failed with "${error}" (count: ${similarCount} similar failures)`
      );
    } catch (err) {
      log.warn(`[Memory] Failed to record failure: ${err}`);
    }
  }

  /**
   * Format retrieved trajectories into system prompt injection text.
   */
  formatContext(trajectories: TrajectoryRecord[]): string {
    if (trajectories.length === 0) {
      return '';
    }

    const parts = trajectories.map(t => {
      const toolChain = t.steps.map(s => s.tool).join(' -> ');
      const totalSteps = t.steps.length;
      const totalDuration = t.steps.reduce((sum, s) => sum + s.durationMs, 0);
      const durationSec = (totalDuration / 1000).toFixed(1);

      return `PAST EXPERIENCE: Similar task '${t.taskDescription}' succeeded via: ${toolChain}. Steps: ${totalSteps} tools, ${durationSec}s total.`;
    });

    return parts.join('\n');
  }

  /**
   * Get recent failures for a specific tool.
   */
  async getRecentFailures(toolName: string, limit = 10): Promise<FailureRow[]> {
    try {
      const db = getDatabaseManager();
      return await db.getRecentFailures(toolName, limit);
    } catch (err) {
      log.warn(`[Memory] getRecentFailures failed: ${err}. Returning empty.`);
      return [];
    }
  }

  /**
   * Get memory statistics for logging.
   * Logs once per session on first call.
   */
  async getStats(): Promise<{
    totalTrajectories: number;
    successfulCount: number;
    failureCount: number;
    oldestDate: string | null;
  }> {
    try {
      const db = getDatabaseManager();
      const stats = db.stats();

      if (!statsLogged) {
        log.info(
          `[Memory] Stats: ${stats.trajectoryCount} trajectories (${stats.successfulTrajectoryCount} successful), ${stats.failureCount} failures`
        );
        statsLogged = true;
      }

      return {
        totalTrajectories: stats.trajectoryCount,
        successfulCount: stats.successfulTrajectoryCount,
        failureCount: stats.failureCount,
        oldestDate: stats.oldestTrajectoryDate ? new Date(stats.oldestTrajectoryDate).toISOString() : null,
      };
    } catch (err) {
      log.warn(`[Memory] getStats failed: ${err}. Database unavailable.`);
      return {
        totalTrajectories: 0,
        successfulCount: 0,
        failureCount: 0,
        oldestDate: null,
      };
    }
  }

  /**
   * Extract keywords from a task description.
   * Returns words with length >= 3, max 5 words.
   */
  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length >= 3)
      .slice(0, 5);
  }
}

export const desktopMemory = new DesktopMemory();
