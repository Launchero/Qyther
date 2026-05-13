import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { createLogger } from '../../utils/logger';
import type { BrowserTrajectoryRecord } from './types';

const log = createLogger('BrowserMemory');

// Store in the app data directory alongside desktop memory
const MEMORY_DIR = path.join(app.getPath('userData'), 'browser-memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'trajectories.db');

export class BrowserMemoryStore {
  private db: Database | null = null;

  private async ensureDb(): Promise<Database> {
    if (this.db) return this.db;

    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    const sqlJsPath = path.join(path.dirname(import.meta.url.replace('file://', '').split('?')[0]), '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

    if (!fs.existsSync(sqlJsPath)) {
      log.warn(`sql-wasm.wasm not found at ${sqlJsPath}`);
    }

    const SQL = await initSqlJs({
      locateFile: () => sqlJsPath
    });

    if (fs.existsSync(MEMORY_FILE)) {
      const fileBuffer = fs.readFileSync(MEMORY_FILE);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trajectories (
        id TEXT PRIMARY KEY,
        task_description TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        outcome TEXT NOT NULL,
        success INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trajectories_task ON trajectories(task_description);
      CREATE INDEX IF NOT EXISTS idx_trajectories_success ON trajectories(success);
    `);

    this.persistToDisk();
    return this.db;
  }

  private persistToDisk(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(MEMORY_FILE, buffer);
  }

  async store(trajectory: BrowserTrajectoryRecord): Promise<void> {
    const db = await this.ensureDb();
    try {
      db.exec('BEGIN TRANSACTION');

      db.run(`
        INSERT OR REPLACE INTO trajectories (id, task_description, steps_json, outcome, success, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        trajectory.id,
        trajectory.taskDescription,
        JSON.stringify(trajectory.steps),
        trajectory.outcome,
        trajectory.success ? 1 : 0,
        trajectory.createdAt,
      ]);

      db.exec('COMMIT');
      this.persistToDisk();

      log.info(`[BrowserMemory] Stored trajectory: ${trajectory.id} (${trajectory.taskDescription.slice(0, 60)}...)`);
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_e: unknown) { /* ignore */ }
      log.error('[BrowserMemory] Failed to store trajectory:', err);
    }
  }

  async retrieve(task: string, limit: number = 3): Promise<BrowserTrajectoryRecord[]> {
    const db = await this.ensureDb();

    const words = task.split(/\s+/).filter(w => w.length > 3);

    let rows: Array<{
      id: string;
      task_description: string;
      steps_json: string;
      outcome: string;
      success: number;
      created_at: number;
    }>;

    if (words.length === 0) {
      const safeLimit = Math.max(1, Math.floor(limit));
      const sql = `
        SELECT id, task_description, steps_json, outcome, success, created_at
        FROM trajectories
        WHERE success = 1
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;
      const result = db.exec(sql);
      rows = result.length > 0 && result[0].values.length > 0
        ? result[0].values.map(row => ({
          id: row[0] as string,
          task_description: row[1] as string,
          steps_json: row[2] as string,
          outcome: row[3] as string,
          success: row[4] as number,
          created_at: row[5] as number,
        }))
        : [];
    } else {
      const safeLimit = Math.max(1, Math.floor(limit));
      const conditions = words.map(w => `task_description LIKE '%${w.replace(/'/g, "''")}%'`).join(' OR ');
      const sql = `
        SELECT id, task_description, steps_json, outcome, success, created_at
        FROM trajectories
        WHERE success = 1 AND (${conditions})
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;
      const result = db.exec(sql);
      rows = result.length > 0 && result[0].values.length > 0
        ? result[0].values.map(row => ({
          id: row[0] as string,
          task_description: row[1] as string,
          steps_json: row[2] as string,
          outcome: row[3] as string,
          success: row[4] as number,
          created_at: row[5] as number,
        }))
        : [];
    }

    log.info(`[BrowserMemory] Retrieved ${rows.length} trajectories for task: "${task.slice(0, 60)}..."`);

    return rows.map(row => ({
      id: row.id,
      taskDescription: row.task_description,
      steps: JSON.parse(row.steps_json),
      outcome: row.outcome,
      success: row.success === 1,
      createdAt: row.created_at,
    }));
  }

  formatContext(trajectories: BrowserTrajectoryRecord[]): string {
    if (trajectories.length === 0) return '';

    const parts = trajectories.map((t, i) => {
      const stepsSummary = t.steps
        .map(s => `  Step ${s.stepIndex + 1}: ${s.tool} (${s.success ? 'success' : 'failed'})`)
        .join('\n');

      return `[Past Trajectory ${i + 1}]\nTask: ${t.taskDescription}\nOutcome: ${t.outcome}\nSteps:\n${stepsSummary}`;
    });

    return `PAST SUCCESSFUL TRAJECTORIES (use these as reference for planning):\n\n${parts.join('\n\n')}`;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.persistToDisk();
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
export const browserMemory = new BrowserMemoryStore();
