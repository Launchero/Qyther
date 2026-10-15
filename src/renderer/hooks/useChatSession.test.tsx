import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useCallback, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useChatSession } from './useChatSession';

/**
 * The repo's first renderer test, and the proof for the worst defect in the audit:
 * `AskModeExpanded` built `loadHistory` from `listSessions` and ran it from
 * `useEffect(loadHistory, [loadHistory])`. Because the hook returned a fresh closure every
 * render, that effect fired after EVERY render, each firing a `chat:list-sessions` IPC whose
 * `setHistoryItems(newArray)` caused another render — an unbounded loop for as long as Ask
 * mode stayed open.
 *
 * Uses react-dom + jsdom directly instead of a testing-library dependency: the repo has
 * neither, and this needed only a mount and a re-render.
 */
const calls = vi.hoisted(() => ({
  listSessions: 0,
  /** Callbacks the hook registered for main's session-list push. */
  sessionsListeners: [] as Array<(sessions: unknown[]) => void>,
  /** Callbacks the hook registered for `chat:stream-chunk`. */
  chunkListeners: [] as Array<(data: unknown) => void>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeElectronStub(): any {
  const unsubscribe = () => {};
  const chat = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialize: vi.fn(async (): Promise<any> => ({ success: true, ready: true })),
    createSession: vi.fn(async () => ({ success: true, sessionId: 'session-probe' })),
    getCurrentSession: vi.fn(async () => null),
    getSession: vi.fn(async () => ({ messages: [] })),
    switchSession: vi.fn(async () => ({ success: true })),
    listSessions: vi.fn(async () => {
      calls.listSessions += 1;
      return [];
    }),
    deleteSession: vi.fn(async () => ({ success: true })),
    clearHistory: vi.fn(async () => ({ success: true })),
    isReady: vi.fn(async () => true),
    sendStreamMessage: vi.fn(async () => ({ success: true, response: '' })),
    cancelTurn: vi.fn(async () => ({ success: true })),
    onTurnStarted: () => unsubscribe,
    onSessionsChanged: (cb: (sessions: unknown[]) => void) => {
      calls.sessionsListeners.push(cb);
      return unsubscribe;
    },
    onStreamChunk: (cb: (data: unknown) => void) => {
      calls.chunkListeners.push(cb);
      return unsubscribe;
    },
    onThinkingStep: () => unsubscribe,
    onAgentChange: () => unsubscribe,
  };
  return {
    chat,
    browser: { closeSession: vi.fn(async () => ({ success: true })) },
    app: { quit: vi.fn(async () => {}) },
  };
}

/** Reproduces the exact dependency shape that looped, with the same mount-time call. */
function Probe() {
  const { listSessions } = useChatSession();
  const [items, setItems] = useState<unknown[]>([]);

  const loadHistory = useCallback(async () => {
    const sessions = await listSessions();
    setItems(sessions.slice(0, 10));
  }, [listSessions]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return <div data-testid="probe">{items.length}</div>;
}

describe('useChatSession listSessions stability', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;

  beforeEach(() => {
    calls.listSessions = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('electronAPI', makeElectronStub());
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
    vi.unstubAllGlobals();
  });

  it('calls chat:list-sessions once across 20 parent re-renders, not once per render', async () => {
    // A holder object rather than a bare variable: TS narrows an assignment made inside a
    // render closure back to `never` at the call site.
    const bump: { fn: (() => void) | null } = { fn: null };
    function Parent() {
      const [tick, setTick] = useState(0);
      // Re-rendering the parent re-renders Probe with it — which is exactly the condition
      // the loop fed on.
      bump.fn = () => act(() => setTick(t => t + 1));
      return <div data-tick={tick}><Probe /></div>;
    }

    root = createRoot(host);
    await act(async () => {
      root?.render(<Parent />);
    });

    // Let initializeChat -> createNewSession settle, which itself re-renders the subtree.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const afterMount = calls.listSessions;
    for (let i = 0; i < 20; i += 1) {
      bump.fn?.();
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    }

    expect(afterMount).toBe(1);
    expect(calls.listSessions).toBe(1);
  }, 15000);
});

/**
 * Step 18's gate: tokens are committed once per animation frame, not once per chunk.
 *
 * `chat:stream-chunk` lands as fast as the model emits, and each landing used to be a
 * `setMessages` — re-rendering the transcript and re-parsing the whole growing answer at a rate no
 * compositor can display. This asserts the two halves of the fix: buffered text is invisible until
 * a frame runs (so N chunks cost one commit), and a terminal chunk drains the buffer in its own
 * tick, because the completion path reads `lastMsg.content` and a stranded buffer would silently
 * delete the end of an answer.
 */
describe('chat:stream-chunk coalescing', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  const probe = { sendMessage: null as null | ((text: string) => Promise<void>), renders: 0 };

  function TranscriptProbe() {
    const { messages, sendMessage } = useChatSession();
    probe.renders += 1;
    probe.sendMessage = sendMessage;
    const last = messages[messages.length - 1];
    return <div>{last?.content ?? ''}</div>;
  }

  /** Deliver chunks without letting a frame run, so any commit is visible as a render. */
  const deliver = (chunk: string) => {
    calls.chunkListeners[0]({ chunk, isComplete: false });
  };

  beforeEach(() => {
    calls.chunkListeners.length = 0;
    probe.sendMessage = null;
    probe.renders = 0;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('electronAPI', makeElectronStub());
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
    vi.unstubAllGlobals();
  });

  const mountStreamingTurn = async () => {
    root = createRoot(host);
    await act(async () => {
      root?.render(<TranscriptProbe />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await probe.sendMessage?.('what does this file do?');
    });
    expect(calls.chunkListeners).toHaveLength(1);
  };

  it('holds five chunks in the buffer until a frame runs, then commits them as one', async () => {
    await mountStreamingTurn();

    probe.renders = 0;
    act(() => {
      for (const piece of ['Alpha', ' ', 'Beta', ' ', 'Gamma']) deliver(piece);
    });

    // The whole point: nothing has been committed, so nothing re-rendered.
    expect(host.textContent).toBe('');
    expect(probe.renders).toBe(0);

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(host.textContent).toBe('Alpha Beta Gamma');
    expect(probe.renders).toBe(1);
  }, 15000);

  it('drains the buffer on the terminal chunk, even when main sends no `fullContent`', async () => {
    await mountStreamingTurn();

    // Two chunks and the completion in the same tick — no frame between them.
    await act(async () => {
      deliver('tail-');
      deliver('piece');
      calls.chunkListeners[0]({ chunk: '', isComplete: true, fullContent: null });
    });

    expect(host.textContent).toBe('tail-piece');
  }, 15000);
});
/**
 * The other half of the same defect, and the plan's behavioural gate: entering Ask mode must cost
 * **zero** `chat:listSessions` calls, because main pushes the list instead. The probe above emulates
 * a component that fetches; this one is the shipped shape, where nothing fetches and the push alone
 * populates `sessions`.
 */
describe('chat:sessions-changed adoption', () => {
  let sessionsRoot: Root | null = null;
  let host: HTMLDivElement;

  function SessionProbe() {
    const { sessions } = useChatSession();
    return <div data-sessions>{sessions.length}</div>;
  }

  beforeEach(() => {
    calls.listSessions = 0;
    calls.sessionsListeners.length = 0;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('electronAPI', makeElectronStub());
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => sessionsRoot?.unmount());
    sessionsRoot = null;
    host.remove();
    vi.unstubAllGlobals();
  });

  it('idles without fetching, then renders what main pushed', async () => {
    sessionsRoot = createRoot(host);
    await act(async () => {
      sessionsRoot?.render(<SessionProbe />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(calls.sessionsListeners).toHaveLength(1);
    expect(calls.listSessions).toBe(0); // polled, not pushed — the number the gate demands
    expect(host.textContent).toBe('0');

    await act(async () => {
      calls.sessionsListeners[0]([
        { id: 'a', title: 'First chat', updatedAt: '2026-10-15T00:00:00.000Z', messageCount: 2 },
        { id: 'b', title: 'Second chat', updatedAt: '2026-10-15T00:01:00.000Z', messageCount: 4 },
      ]);
    });

    expect(host.textContent).toBe('2');
    expect(calls.listSessions).toBe(0); // and still never a fetch
  }, 15000);
});
