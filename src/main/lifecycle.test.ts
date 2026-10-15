// @vitest-environment node
/**
 * Proves the four properties `src/main/lifecycle.ts` exists to guarantee. Each is a way the
 * previous fire-and-forget `will-quit` handler failed, so each test names the failure it closes.
 *
 * Imports the production module — the `cancel.test.ts` rule: a test must never re-declare its
 * subject, or it keeps passing after the subject is deleted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createShutdown, SHUTDOWN_STEP_DEADLINE_MS } from './lifecycle';

describe('createShutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs steps in the order given, sequentially', async () => {
    const order: string[] = [];
    const shutdown = createShutdown();

    await shutdown.run([
      {
        name: 'first',
        dispose: async () => {
          await Promise.resolve();
          order.push('first');
        },
      },
      { name: 'second', dispose: () => void order.push('second') },
    ]);

    expect(order).toEqual(['first', 'second']);
  });

  it('records a throwing step and still runs the ones behind it', async () => {
    const ran: string[] = [];
    const shutdown = createShutdown();

    const outcomes = await shutdown.run([
      {
        name: 'mcp',
        dispose: () => {
          throw new Error('spawn ENOENT');
        },
      },
      { name: 'pi', dispose: () => void ran.push('pi') },
    ]);

    expect(ran).toEqual(['pi']);
    expect(outcomes[0]).toMatchObject({ name: 'mcp', status: 'failed' });
    expect(outcomes[0].error).toContain('spawn ENOENT');
    expect(outcomes[1]).toMatchObject({ name: 'pi', status: 'ok' });
  });

  it('records a rejected async step rather than rejecting the run', async () => {
    const shutdown = createShutdown();

    const outcomes = await shutdown.run([
      { name: 'browser', dispose: () => Promise.reject(new Error('close() hung up')) },
    ]);

    expect(outcomes[0]).toMatchObject({ name: 'browser', status: 'failed' });
    expect(outcomes[0].error).toContain('close() hung up');
  });

  it('times out a step that never settles and continues past it', async () => {
    const ran: string[] = [];
    const shutdown = createShutdown({ deadlineMs: 50 });

    const pending = shutdown.run([
      { name: 'wedged', dispose: () => new Promise<void>(() => {}) },
      { name: 'tray', dispose: () => void ran.push('tray') },
    ]);
    await vi.advanceTimersByTimeAsync(60);

    const outcomes = await pending;
    expect(ran).toEqual(['tray']);
    expect(outcomes[0]).toMatchObject({ name: 'wedged', status: 'timeout' });
    expect(outcomes[0].error).toContain('50ms');
    expect(outcomes[1]).toMatchObject({ name: 'tray', status: 'ok' });
  });

  it('leaves no pending timer behind, so quit is not held open by its own deadline', async () => {
    const shutdown = createShutdown({ deadlineMs: 5000 });

    await shutdown.run([{ name: 'fast', dispose: () => undefined }]);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('joins a second call to the run in flight instead of disposing twice', async () => {
    const dispose = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    const shutdown = createShutdown();

    const first = shutdown.run([{ name: 'mcp', dispose }]);
    const second = shutdown.run([{ name: 'mcp', dispose }]);
    expect(second).toBe(first);

    await vi.advanceTimersByTimeAsync(20);
    await first;
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('replays the recorded outcomes after a completed run without re-running it', async () => {
    const dispose = vi.fn(() => undefined);
    const shutdown = createShutdown();

    await shutdown.run([{ name: 'pi', dispose }]);
    const replay = await shutdown.run([{ name: 'pi', dispose }]);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(replay).toHaveLength(1);
    expect(replay[0]).toMatchObject({ name: 'pi', status: 'ok' });
  });

  it('reports run state, which is what lets will-quit veto unconditionally', async () => {
    const shutdown = createShutdown();
    expect(shutdown.hasRun()).toBe(false);
    expect(shutdown.isRunning()).toBe(false);

    const pending = shutdown.run([{ name: 'slow', dispose: () => new Promise<void>(() => {}) }]);
    expect(shutdown.hasRun()).toBe(true);
    expect(shutdown.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(SHUTDOWN_STEP_DEADLINE_MS + 10);
    await pending;
    expect(shutdown.isRunning()).toBe(false);
    expect(shutdown.hasRun()).toBe(true);
  });
});