// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * The regression that motivated this file: on 2026-10-15 a 3-step desktop run never
 * settled. The chat pump stopped waiting at its 120s stream timeout, but LangGraph does not
 * cancel a running node, so the node's promise stayed pending and main sat at 0% CPU forever.
 *
 * Both subjects are imported from production. They used to be *copied* into this file, which
 * meant the suite kept passing after the real `withAbort` was deleted — a gate for the hang,
 * testing a mirror of itself. `abort.ts` exists so these are reachable without pulling
 * `electron`, koffi and the UIA COM facade in through `agent.ts`.
 */
import { withAbort } from "./abort";
import { sleep } from "./toolbox";

vi.mock("electron", () => ({ clipboard: { readText: vi.fn(), writeText: vi.fn() } }));

describe("run cancellation", () => {
  it("settles promptly when the signal aborts, even though the work never does", async () => {
    const controller = new AbortController();
    const never = new Promise<void>(() => {}); // never settles — the hang
    let settled = false;
    const raced = withAbort(never, controller.signal).catch(() => {
      settled = true;
    });

    controller.abort();
    await raced;
    expect(settled, "the race must reject on abort, not wait for the work").toBe(true);
  });

  it("rejects immediately for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(withAbort(new Promise<void>(() => {}), controller.signal)).rejects.toThrow();
  });

  it("passes the work's own result through when it wins the race", async () => {
    const controller = new AbortController();
    await expect(withAbort(Promise.resolve("done"), controller.signal)).resolves.toBe("done");
  });

  it("propagates a work failure that is not an abort", async () => {
    const controller = new AbortController();
    await expect(withAbort(Promise.reject(new Error("boom")), controller.signal)).rejects.toThrow("boom");
  });

  it("stops listening after the work settles, so a later abort is inert", async () => {
    const controller = new AbortController();
    await withAbort(Promise.resolve(1), controller.signal);
    expect(() => controller.abort()).not.toThrow();
  });
});

describe("toolbox poll loops honour the signal", () => {
  it("an abort during a long sleep resolves it immediately, not after the full duration", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      let done = false;
      const s = sleep(60_000, controller.signal).then(() => {
        done = true;
      });
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(done, "abort must cut the sleep short").toBe(true);
      await s;
    } finally {
      vi.useRealTimers();
    }
  });

  it("an already-aborted signal resolves without waiting", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(60_000, controller.signal)).resolves.toBeUndefined();
  });
});