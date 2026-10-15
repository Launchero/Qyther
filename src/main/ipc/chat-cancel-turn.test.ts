import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Proves Stop actually stops the ask pump. Before this, `.abort()` was never called
 * anywhere in `src/` and Stop only reset renderer state while main kept streaming into
 * the transcript it had just cleared.
 *
 * This used to mock `getAskGraph()` and hand back a `streamEvents` generator. There is no
 * graph now — the pump calls `runAskTurn()`, which pushes semantic events through a
 * callback and resolves with the answer — so the mock is the callback shape instead. The
 * three assertions below are unchanged, which is the point: the observable contract the
 * renderer depends on did not move.
 */
const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, arg: unknown) => Promise<unknown>>(),
  sends: [] as Array<{ channel: string; payload: Record<string, unknown> }>,
  aborted: false,
  chunksYielded: 0,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, arg: unknown) => Promise<unknown>) => {
      hoisted.handlers.set(channel, fn);
    },
  },
  IpcMainInvokeEvent: class {},
}));

vi.mock('../services/pi/ask-turn', () => ({
  AskNotConfiguredError: class AskNotConfiguredError extends Error {},
  runAskTurn: async (
    req: { signal: AbortSignal },
    sink: (event: { kind: string; text?: string }) => void,
  ) => {
    sink({ kind: 'token', text: 'partial answer' });
    hoisted.chunksYielded += 1;
    // Stand in for a long generation: sit until the turn's signal is aborted, then settle
    // the way `runAskTurn` does when `withAbort` wins the race.
    await new Promise<void>((resolve) => {
      req.signal.addEventListener('abort', () => {
        hoisted.aborted = true;
        resolve();
      });
    });
    return {
      text: 'partial answer',
      aborted: true,
      steps: 1,
      summary: { uiPayloads: [], sources: [], labels: [] },
    };
  },
}));

vi.mock('../services/langchain/agent', () => ({
  langChainAgent: {
    switchSession: async () => {},
    getCurrentSession: async () => ({ messages: [] }),
    addMessagePublic: () => {},
    setSessionsChangedNotifier: () => {},
  },
}));

// Irrelevant to the pump, but its pdf-parse import needs DOM globals under jsdom.
vi.mock('../services/utils/document-loader', () => ({
  extractDocument: async () => '',
  getFormatConfig: () => ({}),
  DOCUMENT_EXTENSIONS: [],
}));

import { registerChatHandlers } from './chat-handlers';

function invoke(channel: string, arg: unknown): Promise<unknown> {
  const event = {
    sender: {
      send: (ch: string, payload: Record<string, unknown>) => hoisted.sends.push({ channel: ch, payload }),
    },
  };
  const handler = hoisted.handlers.get(channel);
  if (!handler) throw new Error(`${channel} was never registered`);
  return handler(event, arg);
}

function sentChunksOn(channel: string) {
  return hoisted.sends.filter(s => s.channel === channel).map(s => s.payload);
}

describe('chat:cancelTurn stops the running turn', () => {
  beforeEach(() => {
    hoisted.handlers.clear();
    hoisted.sends.length = 0;
    hoisted.aborted = false;
    hoisted.chunksYielded = 0;
    registerChatHandlers();
  });

  it('announces the turn id before streaming, so the renderer can name what it stops', async () => {
    const send = invoke('chat:sendStreamMessage', { content: 'hello', sessionId: 'sess-1' });
    // Let the pump reach the model-stream event, then stop it.
    while (hoisted.chunksYielded === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    const started = sentChunksOn('chat:turn-started');
    expect(started.length).toBe(1);
    expect(typeof started[0].threadId).toBe('string');
    expect((started[0].threadId as string).startsWith('sess-1:turn-')).toBe(true);

    await invoke('chat:cancelTurn', { threadId: started[0].threadId });
    await send;

    expect(hoisted.aborted).toBe(true);
  });

  it('finishes the turn as a stop, not as an error the user is told to retry', async () => {
    const send = invoke('chat:sendStreamMessage', { content: 'hello', sessionId: 'sess-2' });
    while (hoisted.chunksYielded === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    const threadId = sentChunksOn('chat:turn-started')[0].threadId;
    await invoke('chat:cancelTurn', { threadId });
    const result = (await send) as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    const terminal = sentChunksOn('chat:stream-chunk').find(chunk => chunk.isComplete === true);
    expect(terminal).toBeTruthy();
    expect(terminal?.error).toBeUndefined();
  });

  it('stamps every push of a turn with the same identity, in order', async () => {
    const send = invoke('chat:sendStreamMessage', { content: 'hello', sessionId: 'sess-stamp' });
    while (hoisted.chunksYielded === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    const threadId = sentChunksOn('chat:turn-started')[0].threadId;
    await invoke('chat:cancelTurn', { threadId });
    await send;

    const started = sentChunksOn('chat:turn-started');
    expect(started.length).toBe(1);
    expect(started[0].seq).toBe(1);
    expect(started[0].sessionId).toBe('sess-stamp');
    expect(typeof started[0].threadId).toBe('string');

    // Announced identity must be the identity on the tokens it covers, and strictly ordered.
    const streamed = hoisted.sends.filter(s => s.channel === 'chat:stream-chunk');
    expect(streamed.length).toBeGreaterThan(0);
    for (const { payload } of streamed) {
      expect(payload.threadId).toBe(started[0].threadId);
      expect(typeof payload.seq).toBe('number');
      expect(payload.seq as number).toBeGreaterThan(1);
    }
    const seqs = streamed.map(s => s.payload.seq as number);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it('validates its argument and is a no-op for a thread that is not running', async () => {
    expect(await invoke('chat:cancelTurn', { threadId: '' })).toEqual({
      success: false,
      error: 'threadId must be a non-empty string',
    });
    expect(await invoke('chat:cancelTurn', { threadId: 42 })).toEqual({
      success: false,
      error: 'threadId must be a non-empty string',
    });
    expect(await invoke('chat:cancelTurn', { threadId: 'never-started' })).toEqual({ success: true });
  });
});
