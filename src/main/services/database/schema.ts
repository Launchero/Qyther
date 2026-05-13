/**
 * SQLite schema definitions and migration runner for desktop agent persistence.
 *
 * Uses sql.js (pure JS SQLite, no native bindings) for Electron compatibility.
 *
 * Tables:
 *   - desktop_trajectories: Successful task execution records
 *   - desktop_trajectory_steps: Individual tool calls within a trajectory
 *   - desktop_failures: Failed task patterns to avoid
 *   - migrations: Migration tracking
 */

import type { Database } from 'sql.js';
import { createLogger } from '../../utils/logger';

const log = createLogger('DB');

// ── Schema version ──────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 1;

// ── Migration definitions ───────────────────────────────────────────────────

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'create_desktop_trajectories',
    sql: `
      CREATE TABLE IF NOT EXISTS desktop_trajectories (
        id TEXT PRIMARY KEY,
        task_description TEXT NOT NULL,
        subtasks_json TEXT NOT NULL,
        outcome TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        total_duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trajectories_task ON desktop_trajectories(task_description);
      CREATE INDEX IF NOT EXISTS idx_trajectories_success ON desktop_trajectories(success);
      CREATE INDEX IF NOT EXISTS idx_trajectories_created ON desktop_trajectories(created_at);
    `,
  },
  {
    id: 2,
    name: 'create_desktop_trajectory_steps',
    sql: `
      CREATE TABLE IF NOT EXISTS desktop_trajectory_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trajectory_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        args_json TEXT NOT NULL,
        result_summary TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        success INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (trajectory_id) REFERENCES desktop_trajectories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_steps_trajectory ON desktop_trajectory_steps(trajectory_id);
      CREATE INDEX IF NOT EXISTS idx_steps_tool ON desktop_trajectory_steps(tool_name);
    `,
  },
  {
    id: 3,
    name: 'create_desktop_failures',
    sql: `
      CREATE TABLE IF NOT EXISTS desktop_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_description TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        subtask_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_failures_task ON desktop_failures(task_description);
      CREATE INDEX IF NOT EXISTS idx_failures_tool ON desktop_failures(tool_name);
      CREATE INDEX IF NOT EXISTS idx_failures_created ON desktop_failures(created_at);
    `,
  },
  {
    id: 4,
    name: 'create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `,
  },
];

// ── Migration runner ────────────────────────────────────────────────────────

/**
 * Run all pending migrations in order.
 */
export function runMigrations(db: Database): void {
  // Ensure migrations table exists first
  const migration4 = MIGRATIONS.find(m => m.name === 'create_migrations_table')!;
  db.exec(migration4.sql);

  // Get applied migrations
  const appliedRaw = db.exec('SELECT id, name FROM migrations ORDER BY id');
  const applied = appliedRaw.length > 0
    ? appliedRaw[0].values.map((row: unknown[]) => ({ id: row[0] as number, name: row[1] as string }))
    : [];
  const appliedIds = new Set(applied.map((m: { id: number }) => m.id));

  // Run pending migrations
  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) {
      log.debug(`Migration ${migration.id} (${migration.name}) already applied`);
      continue;
    }

    const start = Date.now();
    try {
      db.exec('BEGIN TRANSACTION');
      db.exec(migration.sql);
      db.run(
        'INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)',
        [migration.id, migration.name, Date.now()]
      );
      db.exec('COMMIT');
      log.info(`Applied migration ${migration.id}: ${migration.name} (${Date.now() - start}ms)`);
    } catch (err) {
      db.exec('ROLLBACK');
      log.error(`Migration ${migration.id} (${migration.name}) failed:`, err);
      throw err;
    }
  }

  log.info(`All migrations complete. Schema version: ${SCHEMA_VERSION}`);
}

// ── Type definitions for persisted records ───────────────────────────────────

export interface TrajectoryRow {
  id: string;
  task_description: string;
  subtasks_json: string;
  outcome: string;
  success: number;
  total_duration_ms: number;
  created_at: number;
}

export interface TrajectoryStepRow {
  id: number;
  trajectory_id: string;
  step_index: number;
  tool_name: string;
  args_json: string;
  result_summary: string;
  duration_ms: number;
  success: number;
}

export interface FailureRow {
  id: number;
  task_description: string;
  tool_name: string;
  error_type: string;
  error_message: string;
  subtask_id: string | null;
  created_at: number;
}

export interface MigrationRow {
  id: number;
  name: string;
  applied_at: number;
}

// ── Database statistics ──────────────────────────────────────────────────────

export interface DatabaseStats {
  tableCount: number;
  trajectoryCount: number;
  successfulTrajectoryCount: number;
  failureCount: number;
  dbSizeBytes: number;
  oldestTrajectoryDate: number | null;
}

/**
 * Helper to read a single value from sql.js exec result.
 */
function queryScalar(db: Database, sql: string): number | null {
  const result = db.exec(sql);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as number | null;
}

/**
 * Get statistics about the database state.
 */
export function getDatabaseStats(db: Database): DatabaseStats {
  const trajectoryCount = queryScalar(db, 'SELECT COUNT(*) FROM desktop_trajectories') ?? 0;
  const successfulCount = queryScalar(db, 'SELECT COUNT(*) FROM desktop_trajectories WHERE success = 1') ?? 0;
  const failureCount = queryScalar(db, 'SELECT COUNT(*) FROM desktop_failures') ?? 0;
  const oldest = queryScalar(db, 'SELECT MIN(created_at) FROM desktop_trajectories');
  const tables = queryScalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'") ?? 0;

  return {
    tableCount: tables,
    trajectoryCount,
    successfulTrajectoryCount: successfulCount,
    failureCount,
    dbSizeBytes: 0, // sql.js doesn't expose page_size/pragmas like better-sqlite3
    oldestTrajectoryDate: oldest,
  };
}
