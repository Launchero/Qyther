import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useWindowTween } from './useWindowTween';

/**
 * Proves the page actually offers its frames, and only for the span of one transition. Main's
 * height tween now has no clock of its own, so a pump that never attaches (the exact ref-guard
 * bug the inline drag handler had) would leave every mode change half-applied until the idle
 * snap — and a pump that never stops would be a permanent rAF loop in the palette process, the
 * same class of defect as the session-polling effect this replaced.
 */
const api = vi.hoisted(() => ({
  animationFrame: vi.fn<() => void>(),
}));

function Probe() {
  useWindowTween();
  return <div id="probe" />;
}

const modeChanged = () => act(() => {
  window.dispatchEvent(new CustomEvent('electron-window-mode-changed', { detail: 'expanded' }));
});

const modeSettled = () => act(() => {
  window.dispatchEvent(new CustomEvent('electron-window-mode-settled', { detail: { mode: 'expanded', height: 600 } }));
});

/** Let real animation frames run; jsdom drives rAF off its own clock. */
const frames = (ms: number) => act(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
});

describe('useWindowTween', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('electronAPI', { window: api });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Probe />));
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
    vi.unstubAllGlobals();
  });

  it('reports nothing while no transition is in flight', async () => {
    await frames(80);
    expect(api.animationFrame).not.toHaveBeenCalled();
  });

  it('reports a frame for every animation frame once a mode is announced', async () => {
    modeChanged();
    await frames(100);

    // Roughly 60 Hz for 100 ms; the floor is what matters — one report is a broken pump, and
    // main cannot tween on anything narrower than the page's own cadence.
    expect(api.animationFrame.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(api.animationFrame).toHaveBeenCalledWith();
  });

  it('stops reporting when main settles the mode', async () => {
    modeChanged();
    await frames(60);
    modeSettled();
    const reported = api.animationFrame.mock.calls.length;

    await frames(120);
    expect(api.animationFrame.mock.calls.length).toBe(reported);
  });

  it('stops on its own if the settle push never arrives', async () => {
    modeChanged();
    // Past the pump's own deadline, so a lost push cannot leave the loop running.
    await frames(1400);
    const reported = api.animationFrame.mock.calls.length;
    expect(reported).toBeGreaterThan(3);

    await frames(200);
    expect(api.animationFrame.mock.calls.length).toBe(reported);
  });
});
