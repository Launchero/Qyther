import { describe, it, expect } from 'vitest';
import { isCurrentTurnEvent } from './turn';

// The renderer drops an event by calling this. A false negative loses a token from the
// answer the user is watching, so the accept path is asserted as carefully as the drop path.
import type { TurnEnvelope } from './turn';

/** How an unstamped chunk actually arrives: a payload whose type extends the envelope. */
interface ChunkPayload extends TurnEnvelope {
  chunk: string;
  isComplete: boolean;
}

describe('isCurrentTurnEvent', () => {
  const current = { threadId: 'sess-1:turn-1000', sessionId: 'sess-1' };

  it('accepts an unstamped event, because the resume path still sends none', () => {
    expect(isCurrentTurnEvent({}, current)).toBe(true);
    const unstamped: ChunkPayload = { chunk: 'x', isComplete: false };
    expect(isCurrentTurnEvent(unstamped, current)).toBe(true);
  });

  it('accepts an event stamped with the turn being watched', () => {
    expect(isCurrentTurnEvent({ threadId: 'sess-1:turn-1000' }, current)).toBe(true);
  });

  it('drops an event from a superseded turn', () => {
    expect(isCurrentTurnEvent({ threadId: 'sess-1:turn-0815' }, current)).toBe(false);
  });

  it('accepts when the renderer has not been told the current turn yet', () => {
    expect(isCurrentTurnEvent({ threadId: 'sess-1:turn-1000' }, { threadId: null, sessionId: null })).toBe(true);
  });

  it('drops an event that names a different session', () => {
    expect(isCurrentTurnEvent({ threadId: current.threadId, sessionId: 'sess-2' }, current)).toBe(false);
  });

  it('skips the session check when either side has no session', () => {
    expect(isCurrentTurnEvent({ threadId: current.threadId, sessionId: null }, current)).toBe(true);
    expect(isCurrentTurnEvent({ threadId: current.threadId, sessionId: 'sess-1' }, { threadId: current.threadId, sessionId: null })).toBe(true);
  });
});
