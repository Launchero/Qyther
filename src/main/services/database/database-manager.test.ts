// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { TrajectoryRecord } from '../desktop/types';

let userDataDir = '';

// Only Electron's userData lookup is stubbed; sql.js, the wasm, the migrations and the
// write/read path are all the real production code.
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
}));

const { DatabaseManager, initializeDatabaseManager } = await import('./database-manager');
const { MIGRATIONS, getDatabaseStats } = await import('./schema');

function makeTrajectory(id: string): TrajectoryRecord {
  return {
    id,
    taskDescription: `open notepad and type ${id}`,
    outcome: 'done',
    success: true,
    createdAt: Date.now(),
    steps: [
      {
        stepIndex: 0,
        tool: 'launch_app',
        args: { app: 'notepad' },
        result: 'ok',
        durationMs: 12,
        success: true,
      },
    ],
  };
}

let manager: InstanceType<typeof DatabaseManager>;

beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'qyther-db-test-'));
  manager = await initializeDatabaseManager();
});

afterAll(() => {
  manager?.close();
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

describe('sql.js bootstrap through DatabaseManager', () => {
  it('locates sql-wasm.wasm and opens a database', () => {
    expect(manager.isReady()).toBe(true);
    expect(manager.getRawDb()).not.toBeNull();
  });

  it('applies every declared migration exactly once', () => {
    const rows = manager.getRawDb()!.exec('SELECT id, name FROM migrations ORDER BY id');
    const applied = rows[0]?.values ?? [];
    expect(applied).toHaveLength(MIGRATIONS.length);
    expect(applied.map(r => r[1]).sort()).toEqual(MIGRATIONS.map(m => m.name).sort());
  });

  it('creates the four expected tables', () => {
    expect(manager.stats().tableCount).toBe(MIGRATIONS.length);
  });

  it('writes the database file to disk', () => {
    const dbFile = join(userDataDir, 'desktop-agent.db');
    expect(existsSync(dbFile)).toBe(true);
    expect(statSync(dbFile).size).toBeGreaterThan(0);
  });
});

describe('agent memory round-trip', () => {
  it('reads back a saved trajectory', async () => {
    await manager.saveTrajectory(makeTrajectory('traj-roundtrip-1'));
    const found = await manager.searchSimilarTrajectories('open notepad', 3);
    expect(found.map(t => t.id)).toContain('traj-roundtrip-1');
    expect(found.find(t => t.id === 'traj-roundtrip-1')!.steps[0].tool).toBe('launch_app');
  });

  it('counts trajectories and successes in stats', async () => {
    await manager.saveTrajectory(makeTrajectory('traj-roundtrip-2'));
    const stats = manager.stats();
    expect(stats.trajectoryCount).toBeGreaterThanOrEqual(2);
    expect(stats.successfulTrajectoryCount).toBeGreaterThanOrEqual(2);
  });

  it('records and returns a failure for a named tool', async () => {
    await manager.recordFailure('close the dialog', 'close_window', 'timeout', 'window never closed');
    const failures = await manager.getRecentFailures('close_window', 5);
    expect(failures).toHaveLength(1);
    expect(failures[0].error_type).toBe('timeout');
    expect(failures[0].task_description).toBe('close the dialog');
  });

  it('survives export and re-import of the persisted bytes', async () => {
    manager.close();
    const reopened = new DatabaseManager();
    await reopened.initialize();
    expect(reopened.isReady()).toBe(true);
    const stats = getDatabaseStats(reopened.getRawDb()!);
    expect(stats.trajectoryCount).toBeGreaterThanOrEqual(2);
    expect(stats.failureCount).toBeGreaterThanOrEqual(1);
    reopened.close();
  });
});
