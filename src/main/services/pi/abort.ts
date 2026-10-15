/**
 * Run-level cancellation primitives, split out of `agent.ts` so they are importable on
 * their own.
 *
 * Two reasons this is its own module rather than private helpers at the bottom of `agent.ts`:
 *
 *  - **Testability.** `agent.ts` imports `electron`, the two native desktop adapters and
 *    `@earendil-works/pi-agent-core` at module scope, so a `// @vitest-environment node`
 *    test cannot reach these without pulling koffi and the UIA COM facade in. `cancel.test.ts`
 *    used to *copy* them instead, which meant it kept passing after the real ones were
 *    deleted — a regression gate for the hang that motivated it, testing a copy of itself.
 *  - **Provenance.** These two functions are the fix for a specific observed defect, and the
 *    contract "a stopped turn must settle even if the work never does" belongs somewhere that
 *    can be asserted directly rather than inferred from the agent.
 *
 * No Electron, no Agent, no network.
 */

/** Rejection produced when a run is stopped before `work` settles. */
export class AbortError extends Error {
  constructor() {
    super("Agent run aborted");
    this.name = "AbortError";
  }
}

/**
 * Reject as soon as `signal` aborts, without waiting for `work`.
 *
 * This is the piece that ends the hang: `agent.prompt()` alone did not settle when the
 * stream timed out, so the graph node's promise stayed pending forever and main sat at 0%
 * CPU. Racing means the node returns (as an abort, not a failure) the moment the pump gives
 * up. `work` is deliberately not cancelled here — Pi's own abort, driven by the same signal
 * via `agent.abort()`, is what actually stops the in-flight request.
 */
export function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Reject after `ms`, used for the whole-run ceiling. The timer is always cleared, so a run
 * that finishes early does not leave a pending handle to keep the process alive.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Agent run exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}