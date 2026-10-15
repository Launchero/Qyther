/**
 * Ordered, bounded, idempotent process shutdown.
 *
 * `app.on('will-quit')` cannot await. The teardown it used to start — MCP stdio children, the
 * Playwright/Chromium session, the Pi agent's tesseract worker and UIA facade — was three
 * fire-and-forget promises with `.catch` on each, so the handler returned immediately, Electron
 * finished the quit, and the `Cleanup complete` log line printed while every disposer was still
 * in flight. Nothing was ever *observed* to finish.
 *
 * This module is the part of that which can be reasoned about. It owns four properties and knows
 * nothing about Electron, MCP, the browser or Pi:
 *
 *  1. **Order is the caller's array order.** Steps run sequentially, never concurrently — the
 *     order in `main.ts` is itself a contract (see `src/main/AGENTS.md`).
 *  2. **Every step is bounded.** One disposer that never settles — a wedged COM facade, a server
 *     that will not acknowledge `close()` — must not strand the steps behind it, so each gets its
 *     own deadline and a step that blows it is recorded as `timeout` and the run continues.
 *  3. **`run()` never rejects.** A throwing or timing-out step is recorded and swallowed. Teardown
 *     that rejects is teardown that does not finish, and this function's whole job is to finish.
 *  4. **A run happens once.** `run()` is memoised: a second call returns the identical in-flight
 *     promise, and a call after completion returns the recorded outcomes without re-running any
 *     disposer. That is what makes an unconditional `event.preventDefault()` in `will-quit` safe —
 *     a second quit event joins the first run instead of restarting it and double-disposing
 *     native handles that were already torn down.
 *
 * Electron-free on purpose: the same split `services/pi/abort.ts` documents, for the same reason —
 * a lifecycle bug is the kind you cannot find by driving the UI, so it has to be unit-testable
 * without importing `electron`, `koffi` or `@earendil-works/pi-mcp`.
 */

/** A named unit of teardown. `name` appears in the log so a failed release is attributable. */
export interface ShutdownStep {
  name: string;
  dispose: () => Promise<unknown> | unknown;
}

export type ShutdownStatus = 'ok' | 'timeout' | 'failed';

export interface ShutdownOutcome {
  name: string;
  status: ShutdownStatus;
  ms: number;
  error?: string;
}

/**
 * Per-step ceiling. Generous enough for a real `McpClient.close()` or a COM teardown, short
 * enough that a quit feels like a quit. This is a ceiling on a *stuck* disposer, not a budget for
 * a slow one — the common case finishes in single-digit milliseconds.
 */
export const SHUTDOWN_STEP_DEADLINE_MS = 2000;

export interface Shutdown {
  /** Run the steps, once. Memoised: repeated calls join or replay the first run. */
  run(steps: ShutdownStep[]): Promise<ShutdownOutcome[]>;
  /** True while a run is in flight. */
  isRunning(): boolean;
  /** True once `run` has been called at all — in flight or finished. */
  hasRun(): boolean;
}

/**
 * Race `dispose()` against its own deadline.
 *
 * The timer is cleared in `finally`, so a step that settles early leaves no pending handle — the
 * same reason `services/pi/abort.ts` clears its `withTimeout` timer. A leftover `setTimeout` here
 * would be self-defeating: it would be the one thing keeping the event loop alive after the quit
 * that it was meant to be finishing.
 */
async function runStep(step: ShutdownStep, deadlineMs: number): Promise<ShutdownOutcome> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => step.dispose()),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`did not settle within ${deadlineMs}ms`)),
          deadlineMs,
        );
      }),
    ]);
    return { name: step.name, status: 'ok', ms: Date.now() - startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A deadline and a genuine throw are different diagnoses and the log must not blur them.
    const status: ShutdownStatus = message.includes(`within ${deadlineMs}ms`) ? 'timeout' : 'failed';
    return { name: step.name, status, ms: Date.now() - startedAt, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createShutdown(options: { deadlineMs?: number } = {}): Shutdown {
  const deadlineMs = options.deadlineMs ?? SHUTDOWN_STEP_DEADLINE_MS;
  let started = false;
  let inFlight: Promise<ShutdownOutcome[]> | null = null;
  let finished: ShutdownOutcome[] | null = null;

  return {
    isRunning: () => started && inFlight !== null && finished === null,
    hasRun: () => started,

    run(steps) {
      if (inFlight) return inFlight;
      if (finished) return Promise.resolve(finished);

      started = true;
      inFlight = (async () => {
        const outcomes: ShutdownOutcome[] = [];
        for (const step of steps) {
          // Sequential and unconditional: a step that timed out is recorded, not rethrown, so the
          // loop below still reaches every step behind it.
          outcomes.push(await runStep(step, deadlineMs));
        }
        finished = outcomes;
        return outcomes;
      })();

      return inFlight;
    },
  };
}