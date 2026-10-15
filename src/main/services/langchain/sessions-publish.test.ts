import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `chat-sessions-push.test.ts` proves the wire: main registers a notifier with the agent and answers
 * a renderer. That test *mocks* the agent, so it cannot prove the other half — that a real mutation
 * of the sessions Map actually publishes. This drives the production singleton and asserts the
 * publish happens where the visible list can change, and nowhere it cannot.
 *
 * Everything the agent talks to outside its own Map is stubbed: MCP and the browser agents.
 * None of them are on the session-list path. There is no model client left to stub —
 * `agent.ts` stores transcripts only, and the model is Pi's, built lazily elsewhere.
 */
const hoisted = vi.hoisted(() => ({ mcpReady: false }));

vi.mock('../mcp/client', () => ({
  mcpService: {
    isInitialized: () => hoisted.mcpReady,
    getTools: () => [],
    getServerNames: () => [],
    initializeWithRetry: async () => {},
    cleanup: async () => {},
  },
}));

vi.mock('../browser/stateful-browser-agent', () => ({
  statefulBrowserAgent: { cleanup: async () => {}, initialize: async () => {} },
}));

vi.mock('../browser/browser-session-manager', () => ({
  browserSessionManager: { list: () => [], cleanupAll: async () => {} },
}));

const { langChainAgent } = await import('./agent');

type Published = Array<{ id: string; title: string; messages: unknown[] }>;

let published: Published[];

beforeEach(() => {
  published = [];
  langChainAgent.setSessionsChangedNotifier((sessions) => {
    published.push(sessions as unknown as Published);
  });
});

afterEach(() => {
  langChainAgent.setSessionsChangedNotifier(null);
});

describe('langChainAgent session publishing', () => {
  it('publishes the session the moment it becomes visible, not when it is merely created', async () => {
    const before = published.length;
    const sessionId = await langChainAgent.createSession('A chat');
    // An empty session is filtered out of `listSessions()`, so creating one changes nothing the
    // renderer shows — and publishing on it would be noise on every new chat.
    expect(published.length).toBe(before);

    langChainAgent.addMessagePublic('user', 'hello there');

    expect(published.length).toBe(before + 1);
    const latest = published.at(-1)!;
    expect(latest.map((session) => session.id)).toContain(sessionId);
    expect(latest.at(0)?.messages).toHaveLength(1);
  });

  it('publishes again when a session disappears', async () => {
    const sessionId = await langChainAgent.createSession('Doomed');
    langChainAgent.addMessagePublic('user', 'first');

    const before = published.length;
    await langChainAgent.deleteSession(sessionId);

    expect(published.length).toBe(before + 1);
    expect(published.at(-1)!.map((session) => session.id)).not.toContain(sessionId);
  });

  it('drops an emptied session from the published list', async () => {
    await langChainAgent.createSession('Emptied');
    langChainAgent.addMessagePublic('user', 'words');
    expect(published.at(-1)!.length).toBeGreaterThan(0);

    await langChainAgent.clearHistory();

    // `clearHistory` empties the current session, which the visible filter then excludes.
    expect(published.at(-1)!.every((session) => session.messages.length > 0)).toBe(true);
  });

  it('stops publishing when no listener is registered, without throwing', async () => {
    langChainAgent.setSessionsChangedNotifier(null);
    const sessionId = await langChainAgent.createSession('Quiet');

    expect(() => langChainAgent.addMessagePublic('user', 'nobody is listening')).not.toThrow();
    // And the mutation itself still landed.
    const session = await langChainAgent.getSession(sessionId);
    expect(session?.messages.length).toBeGreaterThan(0);
  });
});
