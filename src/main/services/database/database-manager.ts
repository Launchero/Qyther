/**
 * SQLite Database Manager for desktop agent persistence.
 *
 * Uses sql.js (pure JS SQLite, no native bindings) for Electron compatibility.
 * Persists the database to disk via Node.js fs on each write.
 */

import initSqlJs, { Database } from 'sql.js';
import { app } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as fs from 'fs';
import { createLogger } from '../../utils/logger';
import {
  runMigrations,
  getDatabaseStats,
  TrajectoryRow,
  TrajectoryStepRow,
  FailureRow,
  DatabaseStats,
} from './schema';
import type { TrajectoryRecord } from '../desktop/types';

const log = createLogger('DB');

// ── Singleton manager ───────────────────────────────────────────────────────

let instance: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!instance) {
    throw new Error('DatabaseManager not initialized. Call initialize() first.');
  }
  return instance;
}

export async function initializeDatabaseManager(): Promise<DatabaseManager> {
  if (instance) {
    log.warn('DatabaseManager already initialized, returning existing instance');
    return instance;
  }

  instance = new DatabaseManager();
  await instance.initialize();
  return instance;
}

// ── DatabaseManager class ────────────────────────────────────────────────────

export class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;
  private initialized = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'desktop-agent.db');
    log.debug(`Database path: ${this.dbPath}`);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn('Database already initialized');
      return;
    }

    const start = Date.now();
    try {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Locate sql-wasm.wasm: try output dir first (bundled), then node_modules
      let wasmPath: string | null = null;
      const __filename = fileURLToPath(import.meta.url);
      const sqlJsRoot = path.dirname(fileURLToPath(import.meta.resolve('sql.js')));
      const candidates = [
        path.join(dirname(__filename), 'sql-wasm.wasm'),
        // import.meta.resolve lands inside dist/ for sql.js, so try both depths.
        path.join(sqlJsRoot, 'sql-wasm.wasm'),
        path.join(sqlJsRoot, 'dist', 'sql-wasm.wasm'),
      ];

      wasmPath = candidates.find(candidate => fs.existsSync(candidate)) ?? null;

      if (!wasmPath) {
        throw new Error(
          `sql-wasm.wasm not found. Searched: ${candidates.join(', ')}`
        );
      }

      const SQL = await initSqlJs({ locateFile: () => wasmPath! });

      // Load existing DB file or create new
      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
      } else {
        this.db = new SQL.Database();
      }

      runMigrations(this.db);
      this.persistToDisk();

      this.initialized = true;

      const stats = getDatabaseStats(this.db);
      const dbSizeKB = Math.round(stats.dbSizeBytes / 1024);
      log.info(`Database initialized at ${this.dbPath}, size: ${dbSizeKB}KB, ${stats.trajectoryCount} trajectories, ${stats.failureCount} failures (${Date.now() - start}ms)`);
    } catch (err) {
      log.error(`Database initialization failed after ${Date.now() - start}ms:`, err);
      throw err;
    }
  }

  isReady(): boolean {
    return this.initialized && this.db !== null;
  }

  stats(): DatabaseStats {
    if (!this.db) {
      log.warn('Database not ready, returning empty stats');
      return {
        tableCount: 0,
        trajectoryCount: 0,
        successfulTrajectoryCount: 0,
        failureCount: 0,
        dbSizeBytes: 0,
        oldestTrajectoryDate: null,
      };
    }
    return getDatabaseStats(this.db);
  }

  // ── Persistence helper ────────────────────────────────────────────────────

  private persistToDisk(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // ── Trajectory CRUD ────────────────────────────────────────────────────────

  async saveTrajectory(trajectory: TrajectoryRecord): Promise<void> {
    if (!this.db) {
      log.warn('[DB] Database unavailable, cannot save trajectory');
      return;
    }

    const start = Date.now();
    try {
      this.db.exec('BEGIN TRANSACTION');

      const trajectoryJson = JSON.stringify({
        subtasks: [],
        outcome: trajectory.outcome,
      });
      const totalDuration = trajectory.steps.reduce((sum, s) => sum + s.durationMs, 0);

      this.db!.run(`
        INSERT INTO desktop_trajectories (id, task_description, subtasks_json, outcome, success, total_duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        trajectory.id,
        trajectory.taskDescription,
        trajectoryJson,
        trajectory.outcome,
        trajectory.success ? 1 : 0,
        totalDuration,
        trajectory.createdAt,
      ]);

      const stepStmt = this.db!.prepare(`
        INSERT INTO desktop_trajectory_steps (trajectory_id, step_index, tool_name, args_json, result_summary, duration_ms, success)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const step of trajectory.steps) {
        stepStmt.run([
          trajectory.id,
          step.stepIndex,
          step.tool,
          JSON.stringify(step.args),
          step.result.slice(0, 500),
          step.durationMs,
          step.success ? 1 : 0,
        ]);
      }
      stepStmt.free();

      this.db.exec('COMMIT');
      this.persistToDisk();

      log.info(`[DB] Stored trajectory "${trajectory.taskDescription.slice(0, 50)}" (id=${trajectory.id}, success=${trajectory.success}, ${trajectory.steps.length} steps, ${totalDuration}ms) in ${Date.now() - start}ms`);
    } catch (err) {
      if (this.db) {
        this.db.exec('ROLLBACK');
      }
      log.error(`[DB] saveTrajectory failed after ${Date.now() - start}ms:`, err);
      log.warn(`[DB] Trajectory preview: ${JSON.stringify(trajectory).slice(0, 200)}`);
    }
  }

  async searchSimilarTrajectories(taskDescription: string, limit: number = 3): Promise<TrajectoryRecord[]> {
    if (!this.db) {
      log.warn('[DB] Database unavailable, returning empty trajectories');
      return [];
    }

    const start = Date.now();
    try {
      const keywords = taskDescription.toLowerCase().split(/\s+/).filter(w => w.length >= 3).slice(0, 5);
      if (keywords.length === 0) {
        log.debug(`[DB] No keywords extracted from "${taskDescription.slice(0, 50)}", returning empty`);
        return [];
      }

      const likeConditions = keywords.map(k => `task_description LIKE '%${k.replace(/'/g, "''")}%'`).join(' AND ');
      const query = `
        SELECT id, task_description, outcome, success, total_duration_ms, created_at
        FROM desktop_trajectories
        WHERE success = 1 AND ${likeConditions}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      const rows = this.db.exec(query);
      if (rows.length === 0 || rows[0].values.length === 0) {
        return [];
      }

      const columns = rows[0].columns;
      const colIndex = (name: string) => columns.indexOf(name);

      const results: TrajectoryRecord[] = [];
      for (const row of rows[0].values) {
        const rowObj: TrajectoryRow = {
          id: row[colIndex('id')] as string,
          task_description: row[colIndex('task_description')] as string,
          subtasks_json: '',
          outcome: row[colIndex('outcome')] as string,
          success: row[colIndex('success')] as number,
          total_duration_ms: row[colIndex('total_duration_ms')] as number,
          created_at: row[colIndex('created_at')] as number,
        };

        const stepsResult = this.db!.exec(`
          SELECT tool_name, args_json, result_summary, duration_ms, success, step_index
          FROM desktop_trajectory_steps
          WHERE trajectory_id = ?
          ORDER BY step_index
        `, [rowObj.id]);

        const steps: TrajectoryStepRow[] = [];
        if (stepsResult.length > 0) {
          const stepCols = stepsResult[0].columns;
          for (const s of stepsResult[0].values) {
            steps.push({
              id: 0,
              trajectory_id: rowObj.id,
              step_index: s[stepCols.indexOf('step_index')] as number,
              tool_name: s[stepCols.indexOf('tool_name')] as string,
              args_json: s[stepCols.indexOf('args_json')] as string,
              result_summary: s[stepCols.indexOf('result_summary')] as string,
              duration_ms: s[stepCols.indexOf('duration_ms')] as number,
              success: s[stepCols.indexOf('success')] as number,
            });
          }
        }

        results.push({
          id: rowObj.id,
          taskDescription: rowObj.task_description,
          steps: steps.map(s => ({
            stepIndex: s.step_index,
            tool: s.tool_name,
            args: JSON.parse(s.args_json) as Record<string, unknown>,
            result: s.result_summary,
            durationMs: s.duration_ms,
            success: s.success === 1,
          })),
          outcome: rowObj.outcome,
          success: rowObj.success === 1,
          createdAt: rowObj.created_at,
        });
      }

      const elapsed = Date.now() - start;
      if (elapsed > 100) {
        log.warn(`[DB] Slow query: searchSimilarTrajectories took ${elapsed}ms`);
      }

      log.info(`[DB] Retrieved ${results.length} trajectories for "${taskDescription.slice(0, 50)}" (keywords: ${keywords.join(', ')}) in ${elapsed}ms`);
      return results;
    } catch (err) {
      log.error(`[DB] searchSimilarTrajectories failed after ${Date.now() - start}ms:`, err);
      log.warn('[DB] Returning empty due to search failure');
      return [];
    }
  }

  async recordFailure(
    taskDescription: string,
    toolName: string,
    errorType: string,
    errorMessage: string,
    subtaskId?: string
  ): Promise<void> {
    if (!this.db) {
      log.warn('[DB] Database unavailable, cannot record failure');
      return;
    }

    const start = Date.now();
    try {
      this.db.run(`
        INSERT INTO desktop_failures (task_description, tool_name, error_type, error_message, subtask_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [taskDescription, toolName, errorType, errorMessage, subtaskId || null, Date.now()]);

      const similarCountResult = this.db.exec(`
        SELECT COUNT(*) as count FROM desktop_failures WHERE tool_name = ? AND error_type = ?
      `, [toolName, errorType]);

      const similarCount = similarCountResult.length > 0 && similarCountResult[0].values.length > 0
        ? similarCountResult[0].values[0][0]
        : 0;

      log.info(`[DB] Recorded failure: "${taskDescription.slice(0, 30)}" -> ${toolName} failed with "${errorType}" (${similarCount} similar failures) in ${Date.now() - start}ms`);
    } catch (err) {
      log.error(`[DB] recordFailure failed after ${Date.now() - start}ms:`, err);
    }
  }

  async getRecentFailures(toolName: string, limit: number = 10): Promise<FailureRow[]> {
    if (!this.db) {
      log.warn('[DB] Database unavailable, returning empty failures');
      return [];
    }

    const start = Date.now();
    try {
      const rows = this.db.exec(`
        SELECT id, task_description, tool_name, error_type, error_message, subtask_id, created_at
        FROM desktop_failures
        WHERE tool_name = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [toolName, limit]);

      if (rows.length === 0 || rows[0].values.length === 0) {
        return [];
      }

      const columns = rows[0].columns;
      const colIndex = (name: string) => columns.indexOf(name);

      const result: FailureRow[] = rows[0].values.map(row => ({
        id: row[colIndex('id')] as number,
        task_description: row[colIndex('task_description')] as string,
        tool_name: row[colIndex('tool_name')] as string,
        error_type: row[colIndex('error_type')] as string,
        error_message: row[colIndex('error_message')] as string,
        subtask_id: row[colIndex('subtask_id')] as string | null,
        created_at: row[colIndex('created_at')] as number,
      }));

      log.debug(`[DB] Retrieved ${result.length} recent failures for ${toolName} in ${Date.now() - start}ms`);
      return result;
    } catch (err) {
      log.error(`[DB] getRecentFailures failed:`, err);
      return [];
    }
  }

  debugDumpTables(): void {
    if (process.env.NODE_ENV !== 'development' && process.env.ELECTRON_VITE_DEV_MODE !== 'true') {
      log.warn('[DB] debugDumpTables only available in development mode');
      return;
    }

    if (!this.db) {
      log.warn('[DB] Database not ready for dump');
      return;
    }

    log.info('[DB] === TABLE DUMP START ===');

    const trajectories = this.db.exec('SELECT * FROM desktop_trajectories ORDER BY created_at DESC LIMIT 10');
    if (trajectories.length > 0) {
      log.info(`[DB] Trajectories (${trajectories[0].values.length} of total):`);
      for (const t of trajectories[0].values) {
        log.info(`  ${t[0]}: "${(t[1] as string).slice(0, 40)}" success=${t[4]} ${t[5]}ms`);
      }
    }

    const failures = this.db.exec('SELECT * FROM desktop_failures ORDER BY created_at DESC LIMIT 10');
    if (failures.length > 0) {
      log.info(`[DB] Failures (${failures[0].values.length} of total):`);
      for (const f of failures[0].values) {
        log.info(`  ${f[0]}: "${(f[1] as string).slice(0, 30)}" -> ${f[2]} (${f[3]})`);
      }
    }

    log.info('[DB] === TABLE DUMP END ===');
  }

  close(): void {
    if (this.db) {
      this.persistToDisk();
      this.db.close();
      this.db = null;
      this.initialized = false;
      log.info('[DB] Database connection closed');
    }
  }

  getRawDb(): Database | null {
    return this.db;
  }
}
