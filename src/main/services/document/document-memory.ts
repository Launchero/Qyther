/**
 * Episodic Memory Service for the document agent.
 *
 * Provides retrieval and storage of past document generation trajectories,
 * keyed by document type and action type for future pattern reuse.
 */

import { getDatabaseManager } from '../database/database-manager';
import { createLogger } from '../../utils/logger';
import type { DocumentTrajectoryRecord } from './types';

const log = createLogger('DocumentMemory');

export class DocumentMemory {
  /**
   * Retrieve similar past document trajectories for a given task description.
   */
  async retrieve(taskDescription: string, limit = 3): Promise<DocumentTrajectoryRecord[]> {
    const keywords = this.extractKeywords(taskDescription);

    try {
      const db = getDatabaseManager();
      const results = await db.searchSimilarTrajectories(taskDescription, limit);

      // Filter to document-type trajectories
      const allTrajectories = results as unknown as Array<Record<string, unknown>>;
      const docResults = allTrajectories.filter(r => this.isDocumentTrajectory(r)) as unknown as DocumentTrajectoryRecord[];

      if (docResults.length > 0) {
        log.info(`[DocumentMemory] Retrieved ${docResults.length} trajectories for "${taskDescription}" (keywords: ${keywords.join(', ')})`);
      } else {
        log.info(`[DocumentMemory] No similar document trajectories found. Memory context empty.`);
      }

      return docResults;
    } catch (err) {
      log.warn(`[DocumentMemory] Retrieval failed: ${err}. Returning empty context.`);
      return [];
    }
  }

  /**
   * Store a completed document trajectory for future retrieval.
   */
  async store(trajectory: DocumentTrajectoryRecord): Promise<void> {
    try {
      const db = getDatabaseManager();
      await db.saveTrajectory({
        id: trajectory.id,
        taskDescription: trajectory.taskDescription,
        steps: trajectory.steps.map(s => ({
          stepIndex: s.stepIndex,
          tool: s.action,
          args: s.args,
          result: s.result,
          durationMs: s.durationMs,
          success: s.success,
        })),
        outcome: trajectory.outcome,
        success: trajectory.success,
        createdAt: trajectory.createdAt,
      });

      log.info(
        `[DocumentMemory] Stored trajectory "${trajectory.taskDescription.slice(0, 50)}" (${trajectory.documentType}, ${trajectory.actionType}, ${trajectory.steps.length} steps)`
      );
    } catch (err) {
      log.warn(`[DocumentMemory] Failed to store trajectory: ${err}`);
    }
  }

  /**
   * Format retrieved trajectories into system prompt injection text.
   */
  formatContext(trajectories: DocumentTrajectoryRecord[]): string {
    if (trajectories.length === 0) {
      return '';
    }

    const parts = trajectories.map(t => {
      const totalDuration = t.steps.reduce((sum, s) => sum + s.durationMs, 0);
      const durationSec = (totalDuration / 1000).toFixed(1);
      return `PAST DOCUMENT TASK: "${t.taskDescription}" (${t.documentType}, ${t.actionType}) succeeded in ${t.steps.length} steps (${durationSec}s). Outcome: ${t.outcome.slice(0, 200)}`;
    });

    return parts.join('\n');
  }

  /**
   * Check if a trajectory record looks like a document trajectory.
   */
  private isDocumentTrajectory(record: Record<string, unknown>): boolean {
    const desc = String(record.taskDescription ?? '').toLowerCase();
    return desc.includes('document') || desc.includes('presentation') || desc.includes('spreadsheet') ||
      desc.includes('.docx') || desc.includes('.pptx') || desc.includes('.xlsx') ||
      desc.includes('report') || desc.includes('proposal') || desc.includes('create') ||
      desc.includes('write');
  }

  /**
   * Extract keywords from a task description.
   */
  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9.]/g, ''))
      .filter(w => w.length >= 3)
      .slice(0, 5);
  }
}

export const documentMemory = new DocumentMemory();
