import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Drives the real `windowManager` singleton. Nothing here re-implements the tween: the
 * assertions read the `setBounds` calls the production code makes, so a regression in
 * `animateWindowHeight` fails this file rather than a copy of it.
 *
 * The tween has no clock of its own — it advances on `onAnimationFrame()`, which is what the
 * renderer reports once per `requestAnimationFrame` (`window:animationFrame`). So these tests are
 * the frame source, and the shape of that source is part of the contract being proved.
 */
const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
const animationAllowed = { value: true };

/** The frame period the palette is rendered at, which the tests above act as. */
const FRAME_MS = 16;

vi.mock('electron', () => ({
  screen: {
    getDisplayNearestPoint: () => ({ workArea }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  },
  BrowserWindow: class {},
}));

vi.mock('./preferences', () => ({
  loadPreferences: () => ({}),
  savePreferences: () => {},
}));

vi.mock('./utils/platform', () => ({
  prefersWindowAnimation: () => animationAllowed.value,
}));

const { windowManager } = await import('./windowManager');

/** Ordered log of geometry writes and pushes, so "after the last write" is provable. */
type PushEvent =
  | { kind: 'write'; height: number }
  | { kind: 'send'; channel: string; payload?: { mode?: string; height?: number } };

interface StubWindow {
  bounds: { x: number; y: number; width: number; height: number };
  timeline: Array<{ atMs: number; height: number }>;
  events: PushEvent[];
  setBounds: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  setResizable: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  setMinimumSize: ReturnType<typeof vi.fn>;
  setMaximumSize: ReturnType<typeof vi.fn>;
  getBounds: () => { x: number; y: number; width: number; height: number };
  isDestroyed: () => boolean;
  on: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
}

function stubWindow(startHeight: number): StubWindow {
  const bounds = { x: 560, y: 162, width: 800, height: startHeight };
  const startedAt = performance.now();
  const timeline: Array<{ atMs: number; height: number }> = [];
  const events: PushEvent[] = [];
  const send = vi.fn((channel: string, payload?: unknown) => {
    events.push({ kind: 'send', channel, payload: payload as { mode?: string; height?: number } | undefined });
  });
  return {
    bounds,
    timeline,
    events,
    setBounds: vi.fn((next: { height?: number }) => {
      Object.assign(bounds, next);
      if (next.height !== undefined) {
        timeline.push({ atMs: performance.now() - startedAt, height: next.height });
        events.push({ kind: 'write', height: next.height });
      }
    }),
    setPosition: vi.fn(),
    setResizable: vi.fn(),
    setSize: vi.fn(),
    /**
     * Windows honours a new minimum by resizing the window immediately, and a new maximum by
     * shrinking it. Emulating that is the only way this stub can catch a call-order bug: the
     * expand path used to install its ~301 px floor before reading the tween's start height, so
     * the native window jumped ~200 px and the animation eased the remainder from mid-air.
     */
    setMinimumSize: vi.fn((minWidth: number, minHeight: number) => {
      if (minHeight > bounds.height) bounds.height = minHeight;
      if (minWidth > bounds.width) bounds.width = minWidth;
    }),
    setMaximumSize: vi.fn((maxWidth: number, maxHeight: number) => {
      if (maxHeight < bounds.height) bounds.height = maxHeight;
      if (maxWidth < bounds.width) bounds.width = maxWidth;
    }),
    getBounds: () => ({ ...bounds }),
    on: vi.fn(),
    isDestroyed: () => false,
    webContents: { send },
  };
}

/**
 * Render `frames` page frames at 60 Hz. `setTimeout` never fires early, so elapsed time is always
 * at least `frames * FRAME_MS` — the tween can finish sooner than it does here, never later.
 */
async function pumpFrames(frames: number): Promise<void> {
  for (let i = 0; i < frames; i++) {
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
    windowManager.onAnimationFrame();
  }
}

beforeEach(() => {
  animationAllowed.value = true;
  // Compact→compact takes the imperceptible-distance branch, so no tween survives from before.
  windowManager.setMode('compact', stubWindow(72) as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('windowManager height tween', () => {
  it('eases the height in and out instead of lurching or stepping it linearly', async () => {
    const w = stubWindow(72);
    // Driven by a scripted clock, not by `setTimeout`: under a full `npm run test` run the real
    // timer slips, the first reported frame arrives at 40 ms instead of 16.7, and a fraction bound
    // then measures the scheduler rather than the curve. Here every height is a pure function of
    // the frame index.
    const clock = vi.spyOn(performance, 'now');
    let now = 0;
    clock.mockImplementation(() => now);
    try {
      windowManager.setMode('expanded', w as never);
      for (let frame = 1; frame <= 12; frame += 1) {
        now = frame * 16.7;
        windowManager.onAnimationFrame();
      }
    } finally {
      clock.mockRestore();
    }

    expect(w.bounds.height).toBe(600);
    expect(w.timeline.length).toBeGreaterThan(3); // animated, not one jump

    // Monotonic growth: no overshoot and no back-step.
    for (let i = 1; i < w.timeline.length; i++) {
      expect(w.timeline[i].height).toBeGreaterThanOrEqual(w.timeline[i - 1].height);
    }

    const distance = 600 - 72;
    const firstStepFraction = (w.timeline[0].height - 72) / distance;
    // The first presented frame (9.3% into a 180 ms envelope) must carry a small share of the
    // distance. `easeOutCubic` put 26.7% of it in this one frame — a ~135 px lurch, the artifact
    // the harness page trace caught — and the 30px-per-16ms loop this replaced put 9.3% here with
    // no easing at all. Both fail; smoothstep puts 0.4%.
    expect(firstStepFraction).toBeLessThan(0.06);

    const n = w.timeline.length;
    const at = (i: number) => w.timeline[Math.min(n - 1, Math.max(0, i))].height;
    // Deceleration still holds, so this is not merely a slow start: a linear curve leaves 25% of
    // the distance in the last quarter of the sequence.
    expect((at(n - 1) - at(Math.floor(n * 0.75))) / distance).toBeLessThan(0.2);

    // Symmetric rather than slow at both ends only.
    const midFraction = (at(Math.floor(n / 2)) - 72) / distance;
    expect(midFraction).toBeGreaterThan(0.25);
    expect(midFraction).toBeLessThan(0.75);

    expect(w.setPosition).toHaveBeenCalledTimes(1); // repositioned once, at the end
  });

  it('does not let the expanded floor move the window before the tween starts', async () => {
    const w = stubWindow(72);
    // Lock it the way the compact branch locks a real palette: min and max both at its own height.
    windowManager.setMode('compact', w as never);
    expect(w.setMinimumSize).toHaveBeenLastCalledWith(800, 72);
    expect(w.setMaximumSize).toHaveBeenLastCalledWith(800, 72);

    windowManager.setMode('expanded', w as never);
    // The bug this proves against: `applyModeConstraints` installed the ≈301 px expanded floor
    // before the tween read its start height, and Windows honours a raised minimum by resizing
    // at once. The palette jumped ~200 px, then eased from mid-air (103 → 479 in the page trace).
    expect(w.getBounds().height).toBe(72);

    await pumpFrames(1);
    expect(w.timeline.at(-1)!.height).toBeLessThan(200);

    await pumpFrames(20);
    const { minHeight, maxHeight } = windowManager.expandedHeightBounds();
    expect(w.setMinimumSize).toHaveBeenLastCalledWith(800, minHeight);
    expect(w.setMaximumSize).toHaveBeenLastCalledWith(800, maxHeight);
    expect(w.bounds.height).toBe(600);
  });

  it('writes nothing at all until the page reports a frame', async () => {
    const w = stubWindow(72);

    windowManager.setMode('expanded', w as never);
    // Shorter than main's idle snap, so only the frame clock could have written anything.
    await new Promise((resolve) => setTimeout(resolve, 60));

    // The whole point of taking the clock from the page: a cadence of main's own shares no phase
    // with the compositor, and that is what produced 11 duplicate frames per transition. Nothing
    // may move until a frame is reported, so a stale or absent renderer cannot half-resize the
    // window. The idle snap is the only thing that writes without a frame.
    expect(w.timeline).toEqual([]);

    await pumpFrames(2);
    expect(w.timeline.length).toBeGreaterThan(0);
  });

  it('advances at most one height per reported frame, never the same height twice in a row', async () => {
    const w = stubWindow(72);

    windowManager.setMode('expanded', w as never);
    await pumpFrames(20);

    const heights = w.timeline.map((s) => s.height);
    const duplicates = heights.slice(1).filter((h, i) => h === heights[i]).length;
    expect(duplicates).toBe(0);
    expect(new Set(heights).size).toBe(heights.length);
    // One write per 60 Hz frame inside the 180 ms envelope, plus the terminal write that lands
    // exactly on the target when easing did not: ceil(180/16) + 1.
    expect(heights.length).toBeLessThanOrEqual(13);
  });

  it('snaps to the target when the page stops reporting frames', async () => {
    const w = stubWindow(72);

    windowManager.setMode('expanded', w as never);
    // Hidden or occluded: rAF is throttled, so no report ever arrives. The geometry must still
    // reach the mode it announced, and `modeSettled` must still be emitted.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(w.timeline.map((s) => s.height)).toEqual([600]);
    expect(w.events.filter((e) => e.kind === 'send' && e.channel === 'window:modeSettled')).toHaveLength(1);
  });

  it('snaps straight to the target when the OS disables client-area animation', async () => {
    animationAllowed.value = false;
    const w = stubWindow(72);

    windowManager.setMode('expanded', w as never);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(w.timeline.map((s) => s.height)).toEqual([600]);
    expect(w.setPosition).toHaveBeenCalledTimes(1);
  });

  it('jumps without starting a tween when the distance is imperceptible', () => {
    const w = stubWindow(599);

    windowManager.setMode('expanded', w as never);

    expect(w.timeline.map((s) => s.height)).toEqual([600]);
    expect(w.setPosition).toHaveBeenCalledTimes(1);
  });

  it('emits modeSettled once, after the last height write, carrying the measured height', async () => {
    const w = stubWindow(72);

    windowManager.setMode('expanded', w as never);
    await pumpFrames(20);

    const changed = w.events.filter((e) => e.kind === 'send' && e.channel === 'window:modeChanged');
    const settled = w.events.filter((e) => e.kind === 'send' && e.channel === 'window:modeSettled');
    expect(changed.length).toBe(1);
    expect(settled.length).toBe(1);
    expect(settled[0]).toMatchObject({ payload: { mode: 'expanded', height: 600 } });

    // The whole point of the pair: `modeChanged` is early so the renderer can lay out and start
    // reporting frames, and `modeSettled` must not be observable until the geometry can actually
    // hold the layout.
    const lastWrite = w.events.map((e) => e.kind).lastIndexOf('write');
    const changedAt = w.events.findIndex((e) => e.kind === 'send' && e.channel === 'window:modeChanged');
    const settledAt = w.events.findIndex((e) => e.kind === 'send' && e.channel === 'window:modeSettled');
    expect(changedAt).toBeLessThan(lastWrite);
    expect(settledAt).toBeGreaterThan(lastWrite);
  });

  it('still acknowledges a mode that is already in effect, without resizing anything', () => {
    const w = stubWindow(600);
    windowManager.setMode('expanded', w as never);
    w.events.length = 0;

    // Second call takes the early return that exists so a user's own resize survives. It used to
    // acknowledge nothing at all, leaving a renderer that asked for the mode waiting forever.
    windowManager.setMode('expanded', w as never);

    expect(w.events.some((e) => e.kind === 'write')).toBe(false);
    expect(w.events.filter((e) => e.kind === 'send' && e.channel === 'window:modeSettled').length).toBe(1);
  });

  it('cancels an in-flight tween when the mode changes again', async () => {
    const growing = stubWindow(72);
    windowManager.setMode('expanded', growing as never);
    await pumpFrames(4);
    const heightsAtSwitch = growing.timeline.length;

    const shrinking = stubWindow(growing.bounds.height);
    windowManager.setMode('compact', shrinking as never);
    // Frames now belong to the new tween, and the abandoned window must stop where it was rather
    // than keep growing behind the new mode.
    await pumpFrames(4);
    expect(growing.timeline.length).toBe(heightsAtSwitch);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(shrinking.bounds.height).toBe(72);
    expect(growing.events.some((e) => e.kind === 'send' && e.channel === 'window:modeSettled')).toBe(false);
  });
});
/**
 * The two rules `window:resizeHeight` depends on. The handler used to hand `setBounds` whatever the
 * renderer sent, and the width-lock listener was guarded by a boolean that could never be cleared,
 * so the second palette window of a session got no lock at all.
 */
describe('windowManager resize authority', () => {
  // workArea is 1920x1080 and the palette's top edge sits 15% down: 1080 - 162 = 918 usable.
  it('clamps a requested height into what the expanded window may hold', () => {
    expect(windowManager.clampExpandedHeight(600)).toBe(600);
    expect(windowManager.clampExpandedHeight(600.4)).toBe(600);
    expect(windowManager.clampExpandedHeight(9999)).toBe(918);
    expect(windowManager.clampExpandedHeight(10)).toBe(300);
  });

  it('refuses a height that is not a usable number instead of writing NaN to the window', () => {
    for (const value of [undefined, null, NaN, Infinity, '600', {}, []]) {
      expect(windowManager.clampExpandedHeight(value)).toBeNull();
    }
  });

  it('puts the same bounds on the native window that it reports to callers', () => {
    const w = stubWindow(600);
    windowManager.applyModeConstraints(w as never, 'expanded');

    const { minHeight, maxHeight } = windowManager.expandedHeightBounds();
    expect(w.setMinimumSize.mock.calls.at(-1)![1]).toBe(minHeight);
    expect(w.setMaximumSize.mock.calls.at(-1)![1]).toBe(maxHeight);
  });

  it('attaches the width lock to a recreated window, and only once per window', () => {
    const first = stubWindow(600);
    const second = stubWindow(600);

    windowManager.setMode('expanded', first as never);
    windowManager.applyModeConstraints(second as never, 'expanded');

    expect(first.on).toHaveBeenCalledTimes(1);
    // The defect: with a one-way boolean latch this second window never got a listener, so its
    // width could drift sideways and nothing pulled it back.
    expect(second.on).toHaveBeenCalledTimes(1);

    windowManager.applyModeConstraints(second as never, 'expanded');
    expect(second.on).toHaveBeenCalledTimes(1);

    const resize = second.on.mock.calls.find(([event]) => event === 'resize');
    expect(resize).toBeDefined();
    second.bounds.width = 900;
    (resize![1] as () => void)();
    expect(second.setSize).toHaveBeenCalledWith(800, 600);
  });
});

