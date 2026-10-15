import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useKeyboard } from './useKeyboard';
import type { SearchResult } from '../components/ResultsList';

/**
 * Escape-ladder contract for the graded tiers in `useKeyboard`:
 * tier-1 (a surface owns the key) returns without touching query or window,
 * tier-2 clears a non-empty query, tier-3 hides the window.
 *
 * Tier-1 has two independent signals — App-owned `isModalOpen` and the
 * whole-document `ESCAPE_OWNERS` query — so a mounted dialog can never fall
 * through to tier-2/3. Uses react-dom + jsdom directly (no testing-library),
 * following `useChatSession.test.tsx`.
 */
const stubResult: SearchResult = {
  id: 'row-0',
  title: 'desktop-hitl.mmd',
  subtitle: 'MMD File',
  type: 'file',
  action: 'open',
};

interface ProbeProps {
  searchQuery: string;
  isModalOpen?: boolean;
  dialogMounted: boolean;
  events: { cleared: number; closed: number };
}

function Probe({ searchQuery, isModalOpen = false, dialogMounted, events }: ProbeProps) {
  const [query, setQuery] = React.useState(searchQuery);
  useKeyboard({
    selectedIndex: 0,
    setSelectedIndex: () => {},
    results: [stubResult],
    searchQuery: query,
    onClearQuery: () => {
      events.cleared += 1;
      setQuery('');
    },
    onExecute: async () => {},
    onClose: async () => {
      events.closed += 1;
    },
    searchMode: 'file',
    setSearchMode: () => {},
    onNavigateHistory: () => {},
    isModalOpen,
  });
  return <>{dialogMounted ? <div role="dialog" aria-label="probe dialog" /> : null}</>;
}

describe('useKeyboard Escape ladder', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container.remove();
    document.body.innerHTML = '';
  });

  async function mount(props: Omit<ProbeProps, 'events'>, events: ProbeProps['events']) {
    root = createRoot(container);
    await act(async () => {
      root?.render(<Probe {...props} events={events} />);
    });
  }

  function pressEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }

  it('tier-1: App-owned modal flag alone suppresses clear and hide (no dialog in DOM)', async () => {
    const events = { cleared: 0, closed: 0 };
    await mount({ searchQuery: 'desktop-hitl', isModalOpen: true, dialogMounted: false }, events);
    pressEscape();
    expect(events).toEqual({ cleared: 0, closed: 0 });
  });

  it('tier-1: mounted role=dialog alone suppresses clear and hide (flag off)', async () => {
    const events = { cleared: 0, closed: 0 };
    await mount({ searchQuery: 'desktop-hitl', isModalOpen: false, dialogMounted: true }, events);
    pressEscape();
    expect(events).toEqual({ cleared: 0, closed: 0 });
  });

  it('tier-2: no dialog and non-empty query clears exactly once', async () => {
    const events = { cleared: 0, closed: 0 };
    await mount({ searchQuery: 'desktop-hitl', isModalOpen: false, dialogMounted: false }, events);
    pressEscape();
    expect(events).toEqual({ cleared: 1, closed: 0 });
  });

  it('tier-3: no dialog and empty query hides exactly once', async () => {
    const events = { cleared: 0, closed: 0 };
    await mount({ searchQuery: '', isModalOpen: false, dialogMounted: false }, events);
    pressEscape();
    expect(events).toEqual({ cleared: 0, closed: 1 });
  });
});
