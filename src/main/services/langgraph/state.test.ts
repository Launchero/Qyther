// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { AskState } from './state';

// The reducers in state.ts are load-bearing: a wrong one means cross-turn contamination on a
// reused thread. This drives the real AskState through a real graph, so a langgraph major that
// changes annotation/reducer semantics shows up here instead of in production.
function buildTwoNodeGraph() {
  return new StateGraph(AskState)
    .addNode('first', () => ({
      messages: [new HumanMessage({ content: 'one' })],
      reasoningSteps: [
        { step: 's1', status: 'completed' as const, detail: 'first' },
        { step: 's2', status: 'completed' as const, detail: 'first' },
      ],
      uiPayloads: [{ type: 'list' as const, title: 'p1', data: {}, node: 'first' }],
      researchResults: ['a', 'b'],
    }))
    .addNode('second', () => ({
      messages: [new HumanMessage({ content: 'two' })],
      reasoningSteps: [{ step: 's3', status: 'completed' as const, detail: 'second' }],
      uiPayloads: [{ type: 'chart' as const, title: 'p2', data: {}, node: 'second' }],
      researchResults: ['c'],
    }))
    .addEdge(START, 'first')
    .addEdge('first', 'second')
    .addEdge('second', END);
}

describe('AskState reducers', () => {
  it('compiles a graph against the production annotation root', async () => {
    const graph = buildTwoNodeGraph().compile();
    const result = await graph.invoke({ userQuery: 'probe' });
    expect(result).toBeTruthy();
  });

  it('appends reasoningSteps across nodes', async () => {
    const result = await buildTwoNodeGraph().compile().invoke({ userQuery: 'probe' });
    expect(result.reasoningSteps.map((s: { step: string }) => s.step)).toEqual(['s1', 's2', 's3']);
  });

  it('appends uiPayloads across nodes', async () => {
    const result = await buildTwoNodeGraph().compile().invoke({ userQuery: 'probe' });
    expect(result.uiPayloads.map((p: { title: string }) => p.title)).toEqual(['p1', 'p2']);
  });

  it('replaces messages rather than accumulating them', async () => {
    const result = await buildTwoNodeGraph().compile().invoke({ userQuery: 'probe' });
    expect(result.messages).toHaveLength(1);
    expect(String(result.messages[0].content)).toBe('two');
  });

  it('replaces per-turn arrays such as researchResults', async () => {
    const result = await buildTwoNodeGraph().compile().invoke({ userQuery: 'probe' });
    expect(result.researchResults).toEqual(['c']);
  });

  it('keeps declared defaults for untouched fields', async () => {
    const result = await buildTwoNodeGraph().compile().invoke({ userQuery: 'probe' });
    expect(result.intent).toBe('general');
    expect(result.finalResponse).toBe('');
    expect(result.complexityScore).toBe('simple');
    expect(result.verified).toBe(false);
  });
});

describe('HITL primitives the streaming contract depends on', () => {
  it('exposes MemorySaver, Command and interrupt', () => {
    expect(new MemorySaver()).toBeTruthy();
    expect(new Command({ resume: 'yes' })).toBeTruthy();
    expect(typeof interrupt).toBe('function');
  });

  it('resumes an interrupted node through Command', async () => {
    const graph = new StateGraph(AskState)
      .addNode('pauses', () => {
        const answer = interrupt('confirm this action') as string;
        return { finalResponse: answer };
      })
      .addEdge(START, 'pauses')
      .addEdge('pauses', END);

    const app = graph.compile({ checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: 'hitl-probe' } };

    const first = (await app.invoke({ userQuery: 'probe' }, config)) as Record<string, unknown>;
    const interrupts = first['__interrupt__'];
    expect(Array.isArray(interrupts) ? interrupts.length : 0).toBeGreaterThan(0);

    const resumed = (await app.invoke(new Command({ resume: 'approved' }), config)) as Record<string, unknown>;
    expect(resumed.finalResponse).toBe('approved');
  });
});
