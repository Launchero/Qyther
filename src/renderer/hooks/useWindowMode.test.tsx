import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useWindowMode } from './useWindowMode';

/**
 * `windowMode` used to have two owners: the hook wrote it optimistically before the
 * `window:setMode` IPC round-tripped, main echoed its own answer back, and the echo was dropped by
 * `mode !== windowMode` because the renderer had already guessed it. A separate `visibilitychange`
 * handler then re-fetched and overwrote the value every time the window came up, and the push
 * listener re-subscribed on every mode change because `windowMode` was in its deps.
 *
 * These four tests are the contract that replaced it: the value arrives only from main, a request
 * changes nothing on its own, visibility re-fetches nothing, and the subscription is stable.
 */
const getMode = vi.fn();
const setMode = vi.fn();

function Probe({ query, searchMode }: { query: string; searchMode?: 'file' | 'ai' }) {
  const { windowMode, isCollapsing } = useWindowMode({ searchQuery: query, searchMode });
  return <div data-probe>{`${windowMode}|${isCollapsing ? 'flash' : 'still'}`}</div>;
}

function mount(query = '', searchMode?: 'file' | 'ai') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(<Probe query={query} searchMode={searchMode} />);
  });

  return {
    value: () => host.querySelector<HTMLDivElement>('[data-probe]')!.textContent!,
    rerender: (nextQuery: string, nextMode?: 'file' | 'ai') => {
      act(() => {
        root.render(<Probe query={nextQuery} searchMode={nextMode} />);
      });
    },
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Flush the mount snapshot's promise chain. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function pushMode(mode: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent('electron-window-mode-changed', { detail: mode }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  getMode.mockReset();
  getMode.mockResolvedValue('compact');
  setMode.mockReset();
  setMode.mockResolvedValue('compact');
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { window: { getMode, setMode } },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWindowMode', () => {
  it('takes the mode from main, and renders it', async () => {
    const p = mount();
    try {
      await settle();
      expect(p.value()).toBe('compact|still');

      pushMode('expanded');
      expect(p.value()).toBe('expanded|still');
    } finally {
      p.cleanup();
    }
  });

  it('requests a mode from a query change but does not adopt it until main answers', async () => {
    // Two characters is the auto-expand threshold (`AUTO_EXPAND_CHAR_THRESHOLD`).
    const p = mount('ab');
    try {
      await settle();

      act(() => {
        vi.advanceTimersByTime(150); // the auto-expand debounce
      });
      expect(setMode).toHaveBeenCalledWith('expanded');
      // The defect this replaces: the hook set 'expanded' here, before the round trip.
      expect(p.value()).toBe('compact|still');

      pushMode('expanded');
      expect(p.value()).toBe('expanded|still');
    } finally {
      p.cleanup();
    }
  });

  it('never re-fetches the mode on a visibility change', async () => {
    const p = mount();
    try {
      await settle();
      expect(getMode).toHaveBeenCalledTimes(1);

      pushMode('expanded');
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(getMode).toHaveBeenCalledTimes(1); // the clobbering resync is gone
      expect(p.value()).toBe('expanded|still'); // and the announced mode survived it
    } finally {
      p.cleanup();
    }
  });

  it('collapses again after its own auto-expand, because main echoing a request is not a manual move', async () => {
    const p = mount();
    try {
      await settle();

      p.rerender('ab');
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(setMode).toHaveBeenLastCalledWith('expanded');
      pushMode('expanded'); // main's echo of the request the hook just made
      expect(p.value()).toBe('expanded|still');

      p.rerender('');
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(setMode).toHaveBeenLastCalledWith('compact');
    } finally {
      p.cleanup();
    }
  });

  it('keeps a mode main announced unprompted, even when the query is empty', async () => {
    const p = mount();
    try {
      await settle();
      setMode.mockClear();

      pushMode('expanded'); // Alt+Shift+M: main moved it, nobody asked
      expect(p.value()).toBe('expanded|still');

      p.rerender('ab');
      p.rerender('');
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(setMode).not.toHaveBeenCalled(); // the auto-collapse policy must stay muted
    } finally {
      p.cleanup();
    }
  });

  it('subscribes to the mode push once and keeps it across re-renders', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const p = mount();
    try {
      await settle();
      const modeListeners = add.mock.calls.filter(([type]) => type === 'electron-window-mode-changed').length;
      expect(modeListeners).toBe(1);

      pushMode('expanded');
      p.rerender('abc');
      p.rerender('abcdef', 'ai');
      expect(add.mock.calls.filter(([type]) => type === 'electron-window-mode-changed').length).toBe(modeListeners);
    } finally {
      p.cleanup();
      add.mockRestore();
    }
  });
});
