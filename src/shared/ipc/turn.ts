/**
 * Identity attached to every main → renderer push that belongs to a turn.
 *
 * The renderer used to correlate a stream positionally — "the last message if it is the
 * assistant and still streaming" — which cannot distinguish a stale event from a fresh one,
 * cannot tell two concurrent turns apart, and silently mis-attributes anything that arrives
 * out of order. `threadId` + `seq` make each event self-identifying, following the pattern
 * `browser:*` already used (`browser-handlers.ts:57`).
 *
 * Every field is optional on the wire, deliberately: the one producer that can emit an
 * unstamped event is main's pre-turn failure fallback — a terminal chunk sent when the turn
 * never opened. A subscriber must treat a missing `threadId` as *not attributable*
 * and accept the event, never as stale.
 */
export interface TurnEnvelope {
  /** Per-turn LangGraph thread id, minted by `beginTurn` in `src/main/ipc/chat-handlers.ts`. */
  threadId?: string;
  /** Session the turn belongs to, so a chunk from another session can be dropped. */
  sessionId?: string | null;
  /** Monotonic within one turn; a seq at or below the last seen one is a replay. */
  seq?: number;
}

/**
 * Whether an event may be applied to the transcript the renderer is currently showing.
 *
 * Unstamped events pass — that is the incremental-rollout contract above. An event stamped
 * with a different turn, or a different session than the one being watched, does not.
 */
export function isCurrentTurnEvent(
  env: TurnEnvelope,
  current: { threadId: string | null; sessionId: string | null },
): boolean {
  if (!env.threadId) return true;
  if (current.threadId && env.threadId !== current.threadId) return false;
  if (env.sessionId && current.sessionId && env.sessionId !== current.sessionId) return false;
  return true;
}
