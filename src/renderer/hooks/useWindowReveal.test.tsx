import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useWindowReveal } from './useWindowReveal';

/**
 * `useWindowReveal` owns the palette's only entrance animation, and the two facts that matter about
 * it are invisible in a frame trace: which signal arms it, and whether a second signal restarts a
 * fade already running — re-adding the class resets opacity to 0 and makes the visible-but-
 * transparent window *longer*, which is exactly the defect the visibility clock replaced. So the
 * clock is faked here and the class additions are counted, not measured.
 *
 * react-dom + jsdom, no testing-library: the repo ships neither (`useChatSession.test.tsx` is the
 * pattern this copies).
 */
const REVEAL_CLASS = 'palette-revealing';

let clock = 0;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function mountProbe() {
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    useWindowReveal(ref);
    return <div ref={ref} data-probe />;
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  // Observe before rendering: the mount-time reveal runs inside the first commit, so an observer
  // attached afterwards would never see it.
  const observer = new MutationObserver(() => {});
  observer.observe(host, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });

  const root: Root = createRoot(host);
  act(() => {
    root.render(<Probe />);
  });

  const surface = host.querySelector<HTMLDivElement>('[data-probe]')!;
  // Drain the mount-time records so `reveals()` counts only what happens after the probe is built.
  observer.takeRecords();

  return {
    /** How many times the reveal class has been *added* since the last read. `reveal()` removes
     *  then re-adds in one tick, so only the adding record counts. */
    reveals(): number {
      let count = 0;
      for (const record of observer.takeRecords()) {
        if (record.target !== surface) continue;
        const before = new Set((record.oldValue ?? '').split(' ').filter(Boolean));
        if (!before.has(REVEAL_CLASS) && surface.classList.contains(REVEAL_CLASS)) count += 1;
      }
      return count;
    },
    classListed: () => surface.classList.contains(REVEAL_CLASS),
    cleanup: () => {
      observer.disconnect();
      act(() => root.unmount());
      host.remove();
    },
  };
}

const dispatchVisibility = () => document.dispatchEvent(new Event('visibilitychange'));
const dispatchShown = () => window.dispatchEvent(new CustomEvent('electron-window-shown'));

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  setVisibility('visible');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWindowReveal', () => {
  it('arms a reveal on mount so the very first paint animates', () => {
    const p = mountProbe();
    try {
      expect(p.classListed()).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it('re-arms from a visibility transition alone, without waiting for the IPC round trip', () => {
    const p = mountProbe();
    try {
      setVisibility('hidden');
      dispatchVisibility();
      expect(p.reveals()).toBe(0); // hiding must not play an entrance

      setVisibility('visible');
      dispatchVisibility();
      expect(p.reveals()).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  it('does not let the IPC fallback restart a fade that is already running', () => {
    const p = mountProbe();
    try {
      setVisibility('visible');
      dispatchVisibility();
      expect(p.reveals()).toBe(1);

      clock = 20; // one frame later, mid-fade
      act(() => dispatchShown());
      expect(p.reveals()).toBe(0);
      expect(p.classListed()).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it('still uses the IPC fallback when no visibility transition armed the reveal', () => {
    const p = mountProbe();
    try {
      clock = 1000; // past the fallback guard on every path
      act(() => dispatchShown());
      expect(p.reveals()).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  it('detaches both listeners on unmount', () => {
    const p = mountProbe();
    expect(p.classListed()).toBe(true);
    p.cleanup();

    clock = 5000;
    setVisibility('hidden');
    dispatchVisibility();
    setVisibility('visible');
    dispatchVisibility();
    dispatchShown();
    expect(p.reveals()).toBe(0);
  });
});
