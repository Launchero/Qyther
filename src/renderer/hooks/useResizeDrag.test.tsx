import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useResizeDrag } from './useResizeDrag';

/**
 * Proves the handle actually resizes. The inline version it replaces never registered
 * `mousemove`/`mouseup` at all (a ref guard inside a `[]`-dep effect), so `window:resizeHeight`
 * was unreachable and main's expanded-mode height ceiling constrained nothing.
 */
const api = vi.hoisted(() => ({
  getHeight: vi.fn<(this: unknown) => Promise<number>>(),
  resizeHeight: vi.fn<(this: unknown, h: number) => Promise<void>>(),
}));

function Probe() {
  const { onResizeMouseDown } = useResizeDrag();
  return <div id="handle" onMouseDown={onResizeMouseDown} />;
}

const flushFrame = () => act(async () => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
});

describe('useResizeDrag', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;

  const mouseDownOnHandle = () => act(() => {
    document.getElementById('handle')!.dispatchEvent(
      new MouseEvent('mousedown', { clientY: 100, bubbles: true, cancelable: true }),
    );
  });

  const moveBy = (delta: number) => act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 + delta, bubbles: true }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.getHeight.mockResolvedValue(600);
    api.resizeHeight.mockResolvedValue(undefined);
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

  it('resizes from the measured base height once the drag moves', async () => {
    mouseDownOnHandle();
    await flushFrame(); // let getHeight settle
    moveBy(50);
    await flushFrame();

    expect(api.resizeHeight).toHaveBeenCalledTimes(1);
    expect(api.resizeHeight).toHaveBeenCalledWith(650);
  });

  it('ignores a move that arrives before the base height is known', async () => {
    let resolveHeight: (h: number) => void = () => {};
    api.getHeight.mockReturnValue(new Promise<number>((r) => { resolveHeight = r; }));

    mouseDownOnHandle();
    moveBy(200);
    await flushFrame();
    expect(api.resizeHeight).not.toHaveBeenCalled();

    act(() => resolveHeight(600));
    moveBy(20);
    await flushFrame();
    expect(api.resizeHeight).toHaveBeenCalledWith(620);
  });

  it('coalesces many moves within one frame into a single IPC', async () => {
    mouseDownOnHandle();
    await flushFrame();

    moveBy(10);
    moveBy(20);
    moveBy(30);
    await flushFrame();

    expect(api.resizeHeight).toHaveBeenCalledTimes(1);
    expect(api.resizeHeight).toHaveBeenCalledWith(630);
  });

  it('stops resizing on mouseup and detaches the listeners', async () => {
    mouseDownOnHandle();
    await flushFrame();
    moveBy(40);
    await flushFrame();
    expect(api.resizeHeight).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await flushFrame();

    moveBy(80);
    await flushFrame();
    expect(api.resizeHeight).toHaveBeenCalledTimes(1);
  });
});
