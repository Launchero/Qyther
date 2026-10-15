import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The session list is pushed, not polled. `AskModeExpanded` used to fetch it in an effect whose
 * dependency was a fresh closure every render, which re-fired the IPC on every render it caused —
 * the fix is main publishing on every mutation, so this drives the production registrar and checks
 * what actually lands on the wire.
 */
const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, arg?: unknown) => Promise<unknown>>(),
  sends: [] as Array<{ channel: string; payload: unknown }>,
  notifier: null as null | ((sessions: Array<Record<string, unknown>>) => void),
  sessions: [
    {
      id: 'session-a',
      title: 'First chat',
      messages: [{ role: 'user', content: 'hi', timestamp: new Date('2026-10-15T00:00:00Z') }],
      createdAt: new Date('2026-10-15T00:00:00Z'),
      updatedAt: new Date('2026-10-15T00:01:00Z'),
      model: 'gpt-4o',
    },
    {
      id: 'session-b',
      title: 'Never used',
      messages: [],
      createdAt: new Date('2026-10-15T00:02:00Z'),
      updatedAt: new Date('2026-10-15T00:02:00Z'),
      model: 'gpt-4o',
    },
  ],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, arg?: unknown) => Promise<unknown>) => {
      hoisted.handlers.set(channel, fn);
    },
  },
  IpcMainInvokeEvent: class {},
}));

// There is no graph any more. The pump calls `runAskTurn()`, which streams through a
// callback and resolves; this test is about `chat:sessions-changed`, so a turn that yields
// nothing is all it needs.
vi.mock('../services/pi/ask-turn', () => ({
  AskNotConfiguredError: class AskNotConfiguredError extends Error {},
  runAskTurn: async () => ({
    text: '',
    aborted: false,
    steps: 0,
    summary: { uiPayloads: [], sources: [], labels: [] },
  }),
}));

vi.mock('../services/langchain/agent', () => ({
  langChainAgent: {
    initialize: async () => {},
    isReady: () => true,
    isInitialized: () => true,
    addMessagePublic: () => {},
    // Mirrors the production filter: an empty session is not in the visible list.
    listSessions: async () => hoisted.sessions.filter((session) => (session.messages as unknown[]).length > 0),
    setSessionsChangedNotifier: (fn: (sessions: Array<Record<string, unknown>>) => void) => {
      hoisted.notifier = fn;
    },
  },
}));

vi.mock('../services/utils/document-loader', () => ({
  extractDocument: async () => '',
  getFormatConfig: () => ({}),
  DOCUMENT_EXTENSIONS: [],
}));

import { registerChatHandlers } from './chat-handlers';

const sender = {
  send: (channel: string, payload: unknown) => {
    hoisted.sends.push({ channel, payload });
  },
  isDestroyed: () => false,
};

async function initialize(): Promise<unknown> {
  const handler = hoisted.handlers.get('chat:initialize');
  if (!handler) throw new Error('chat:initialize was never registered');
  return handler({ sender });
}

beforeEach(() => {
  hoisted.sends.length = 0;
  hoisted.notifier = null;
  registerChatHandlers();
});

describe('chat:sessions-changed push', () => {
  it('hands the agent a notifier, so a mutation can publish itself', () => {
    expect(typeof hoisted.notifier).toBe('function');
  });

  it('publishes the current list on chat:initialize, so the renderer never fetches it', async () => {
    await initialize();

    const push = hoisted.sends.find((entry) => entry.channel === 'chat:sessions-changed');
    expect(push).toBeDefined();
    expect(push?.payload).toHaveLength(1); // the empty session is filtered out
  });

  it('sends summaries, not transcripts', async () => {
    await initialize();

    expect(hoisted.sends[0].payload).toEqual([
      { id: 'session-a', title: 'First chat', updatedAt: '2026-10-15T00:01:00.000Z', messageCount: 1 },
    ]);
  });

  it('republishes on every mutation the visible list can change from', async () => {
    await initialize(); // main only knows which webContents to answer after a renderer has asked
    const notifier = hoisted.notifier!;
    const sentBefore = hoisted.sends.length; // initialize itself published once

    notifier(hoisted.sessions.slice(0, 1) as never);
    notifier([] as never);

    expect(hoisted.sends.length).toBe(sentBefore + 2);
    expect(hoisted.sends.slice(sentBefore).map((entry) => entry.channel)).toEqual([
      'chat:sessions-changed',
      'chat:sessions-changed',
    ]);
    expect(hoisted.sends.at(-1)?.payload).toEqual([]);
  });

  it('is inert before any renderer has asked about chat, rather than throwing at the mutation', () => {
    const notifier = hoisted.notifier!;
    // No chat:initialize has run in this registration, so main has no sender to answer. The
    // mutation that triggered the publish must still complete — a renderer that is not listening
    // cannot be an error in the agent's write path.
    expect(() => notifier(hoisted.sessions as never)).not.toThrow();
    expect(hoisted.sends).toEqual([]);
  });
});
