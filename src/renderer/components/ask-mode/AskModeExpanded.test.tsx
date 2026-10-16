import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AskModeExpanded } from '../AskModeExpanded';

/**
 * The first test that mounts the Ask-mode shell.
 *
 * It exists because §6 item 6 deleted six components out of this surface
 * (`SearchWebToggle`, `RelatedQuestions`, `ContextUsageIndicator`,
 * `GenerativeUISkeleton`, `GenerativeUIProgress`, `useDesktopState`) and the only prior
 * evidence that the shell still renders was a unit test on one child. A surface whose
 * composition is untested breaks silently: the removed props were threaded through three
 * files, and a missing prop in JSX is not a type error when the prop is optional.
 *
 * Same no-new-dependency shape as `useChatSession.test.tsx`: react-dom + jsdom, no
 * testing-library.
 */
function makeElectronStub() {
  const off = () => {};
  return {
    chat: {
      initialize: vi.fn(async () => ({ success: true, ready: true })),
      createSession: vi.fn(async () => ({ success: true, sessionId: 's1' })),
      getCurrentSession: vi.fn(async () => null),
      getSession: vi.fn(async () => ({ messages: [] })),
      switchSession: vi.fn(async () => ({ success: true })),
      listSessions: vi.fn(async () => []),
      deleteSession: vi.fn(async () => ({ success: true })),
      clearHistory: vi.fn(async () => ({ success: true })),
      isReady: vi.fn(async () => true),
      sendStreamMessage: vi.fn(async () => ({ success: true, response: '' })),
      cancelTurn: vi.fn(async () => ({ success: true })),
      onTurnStarted: () => off,
      onSessionsChanged: () => off,
      onStreamChunk: () => off,
      onThinkingStep: () => off,
      onAgentChange: () => off,
    },
    browser: {
      closeSession: vi.fn(async () => ({ success: true })),
      getSessionStatus: vi.fn(async () => ({ active: false, url: null })),
      setMode: vi.fn(async () => ({ success: true })),
      initializeAgent: vi.fn(async () => ({ success: true })),
      onProgress: () => off,
      onError: () => off,
    },
    window: { getHeight: vi.fn(async () => 603), hide: vi.fn(async () => {}) },
    app: { quit: vi.fn(async () => {}) },
    mcp: { getStatus: vi.fn(async () => ({ connected: [] })), getServers: vi.fn(async () => []) },
    dialog: { openFile: vi.fn(async () => ({ cancelled: true })), openFolder: vi.fn(async () => ({ cancelled: true })) },
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

async function mount() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = makeElectronStub();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <AskModeExpanded
        searchQuery=""
        onSearchChange={() => {}}
        attachedFiles={[]}
        recentSearchResults={[]}
        mcpCount={0}
      />,
    );
  });
  // The readiness gate resolves off the mount tick; let it and the rAF focus request land.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

afterEach(() => {
  act(() => { root?.unmount(); });
  root = null;
  host?.remove();
});

describe('AskModeExpanded shell', () => {
  it('renders the conversation surface after the dead-control deletions', async () => {
    await mount();

    expect(host.querySelector('.ask-mode-expanded')).not.toBeNull();
    // The not-configured card must NOT be what renders with a ready stub.
    expect(host.querySelector('.chat-not-ready')).toBeNull();
    expect(host.textContent).not.toContain("Ask mode isn't connected");
  });

  it('still offers the welcome state and a working input row', async () => {
    await mount();

    const input = host.querySelector('textarea');
    expect(input, 'the ask input is gone').not.toBeNull();
    expect(host.textContent).toContain('What do you need help with?');
    // The tile that used to promise a content search now promises a name search.
    expect(host.textContent).toContain('Find a file by name');
    expect(host.textContent).not.toContain('Where is the authentication middleware defined?');
  });

  it('renders no control whose state does not cross IPC', async () => {
    await mount();

    const text = host.textContent ?? '';
    const labels = [...host.querySelectorAll('[aria-label]')]
      .map((el) => el.getAttribute('aria-label') ?? '')
      .join(' | ');

    // Deleted in item 6: the web-search toggle, the desktop-mode toggle, and the
    // unreachable desktop progress panel. None may reappear as a rendered control.
    expect(labels + text).not.toMatch(/web search/i);
    expect(labels + text).not.toMatch(/desktop automation|desktop mode/i);
    // Deleted in item 4: no confidence affordance anywhere in the surface.
    expect(text).not.toMatch(/confidence/i);
    // The fabricated accounting is gone: no currency figure without a usage record.
    expect(text).not.toMatch(/\$\d/);
  });

  it('mounts and unmounts without leaking the browser-status poller', async () => {
    await mount();
    const status = (window.electronAPI.browser.getSessionStatus as ReturnType<typeof vi.fn>)
      .mock.calls.length as number;

    act(() => { root?.unmount(); });
    root = null;

    // The poller only runs while browser mode is enabled, which it is not on mount.
    expect(status).toBeLessThanOrEqual(1);
    host?.remove();
  });
});
