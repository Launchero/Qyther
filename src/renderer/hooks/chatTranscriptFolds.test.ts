import { describe, it, expect } from 'vitest';

import {
  withAgentLabel,
  withThinkingStep,
  type ChatMessage,
} from './useChatSession';
import type { ThinkingStep } from '../../shared/ipc/thinking-step';

/**
 * The two transcript folds are pure functions of `(messages, push)`, so they are tested without
 * mounting anything. They exist because both pushes used to write a hook-level mirror (`thinkingSteps`,
 * `activeAgent`) *and* the message, with the message write happening inside the `setThinkingSteps`
 * updater — an updater React is allowed to call twice, and a second owner of a fact the transcript
 * reads off the message. These tests pin the single-owner contract and the purity that replaces it.
 */
const step = (over: Partial<ThinkingStep> = {}): ThinkingStep => ({
  type: 'webSearch',
  step: '1',
  status: 'in_progress',
  detail: 'Searching the web',
  ...over,
});

/**
 * One frozen instant for every fixture. `toEqual` compares `Date` objects by their time value, so
 * calling `new Date()` inside each fixture made the determinism test fail whenever its two calls
 * straddled a millisecond boundary — a flaky gate is a broken gate, and this one was measuring the
 * clock, not the fold.
 */
const T = new Date('2026-10-15T00:00:00.000Z');

function streamingTurn(): ChatMessage[] {
  return [
    { id: 'u1', role: 'user', content: 'the question', timestamp: T },
    {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: T,
      isStreaming: true,
      thinkingSteps: [] as ThinkingStep[],
    },
  ];
}

const last = (messages: ReturnType<typeof streamingTurn>) => messages[messages.length - 1];

describe('withThinkingStep', () => {
  it('appends a new step to the streaming message and leaves the rest of the transcript alone', () => {
    const before = streamingTurn();
    const after = withThinkingStep(before, step());

    expect(last(after).thinkingSteps).toEqual([step({ update: undefined })]);
    expect(after[0]).toBe(before[0]);
    // A changed transcript must be a new array, or React renders the old one and the step never
    // appears — which is what an in-place push looks like.
    expect(after).not.toBe(before);
  });

  it('does not mutate the array or the message it was handed', () => {
    const before = streamingTurn();
    const snapshot = JSON.stringify(before);

    withThinkingStep(before, step());

    expect(JSON.stringify(before)).toBe(snapshot);
    expect(last(before).thinkingSteps).toEqual([]);
  });

  it('is deterministic: the same input and the same push produce an equal result twice', () => {
    const first = withThinkingStep(streamingTurn(), step());
    const second = withThinkingStep(streamingTurn(), step());

    expect(first).toEqual(second);
  });

  it('folds an update into the in-progress step instead of appending a second one', () => {
    const started = withThinkingStep(streamingTurn(), step());
    const finished = withThinkingStep(started, step({ update: true, status: 'complete', detail: '4 results' }));

    expect(last(finished).thinkingSteps).toHaveLength(1);
    expect(last(finished).thinkingSteps?.[0]).toMatchObject({ status: 'complete', detail: '4 results' });
  });

  it('appends an update that matches no in-progress step, so a late push cannot be dropped', () => {
    const started = withThinkingStep(streamingTurn(), step({ step: '1', status: 'complete' }));
    const next = withThinkingStep(started, step({ step: '2', update: true }));

    expect(last(next).thinkingSteps).toHaveLength(2);
  });

  it('returns the identical array when nothing is streaming, so no re-render is scheduled', () => {
    const settled: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: 'done', timestamp: new Date(), thinkingSteps: [] },
    ];

    expect(withThinkingStep(settled, step())).toBe(settled);
  });
});

describe('withAgentLabel', () => {
  it('attaches the label to the streaming message, which is what the indicator renders', () => {
    const before = streamingTurn();
    const after = withAgentLabel(before, 'Browser');

    expect(last(after)).toMatchObject({ agent: { label: 'Browser' } });
    expect(after).not.toBe(before);
    expect(before[1]).not.toMatchObject({ agent: { label: 'Browser' } });
  });

  it('ignores the push once the message has settled', () => {
    const settled: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: 'done', timestamp: new Date() },
    ];

    expect(withAgentLabel(settled, 'Desktop')).toBe(settled);
  });
});
