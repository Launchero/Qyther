import { describe, it, expect } from 'vitest';

import { foldSteps } from './ThinkingSteps';
import type { ThinkingStep } from '../../../shared/ipc/thinking-step';

const start = (step: string, label = step): ThinkingStep => ({
  type: 'tool_start',
  step,
  label,
  family: 'desktop',
  status: 'in_progress',
  detail: `Executing: ${step}`,
});

const done = (step: string, label = step): ThinkingStep => ({
  type: 'node_end',
  step,
  label,
  family: 'desktop',
  status: 'completed',
  detail: `Completed: ${step}`,
  update: true,
});

describe('foldSteps', () => {
  it('folds a completion onto the open row for the same tool', () => {
    const folded = foldSteps([start('click'), done('click')]);

    expect(folded).toHaveLength(1);
    expect(folded[0].status).toBe('completed');
    expect(folded[0].detail).toBe('Completed: click');
  });

  it('keeps repeated calls to one tool as separate rows', () => {
    // The shipped behaviour collapsed these into a single line, which erased the only
    // evidence a user had that the agent was retrying or looping.
    const folded = foldSteps([
      start('search_web'), done('search_web'),
      start('search_web'), done('search_web'),
      start('search_web'), done('search_web'),
    ]);

    expect(folded).toHaveLength(3);
    expect(folded.every(s => s.status === 'completed')).toBe(true);
  });

  it('never reorders the steps — arrival order is execution order', () => {
    const folded = foldSteps([
      start('fetch_page'), done('fetch_page'),
      start('click'), done('click'),
      start('fetch_page'), done('fetch_page'),
    ]);

    expect(folded.map(s => s.step)).toEqual(['fetch_page', 'click', 'fetch_page']);
  });

  it('appends an update row that had no open step rather than dropping it', () => {
    const folded = foldSteps([done('clipboard')]);

    expect(folded).toHaveLength(1);
    expect(folded[0].step).toBe('clipboard');
  });

  it('does not fold a completion onto an already-completed row of the same tool', () => {
    const folded = foldSteps([start('click'), done('click'), done('click')]);

    expect(folded).toHaveLength(2);
  });

  it('carries the label and family from the completion when the start row had none', () => {
    const folded = foldSteps([
      { ...start('create_docx', ''), label: undefined },
      done('create_docx', 'Create Word document'),
    ]);

    expect(folded[0].label).toBe('Create Word document');
    expect(folded[0].family).toBe('desktop');
  });
});
