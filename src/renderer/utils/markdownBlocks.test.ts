import { describe, it, expect } from 'vitest';
import { splitAtSettledBlock } from './markdownBlocks';

/**
 * The contract that makes the split safe, in priority order:
 * 1. no character is lost or reordered,
 * 2. `settled` never moves backwards as the stream grows (otherwise the memoized half would
 *    re-render, which is the whole point),
 * 3. a cut is refused inside a fence and around a loose list, because there the parser owns state
 *    across the blank line and splitting it changes what the user sees.
 */
describe('splitAtSettledBlock', () => {
  const rejoin = (content: string) => {
    const { settled, tail } = splitAtSettledBlock(content);
    return settled + tail;
  };

  it('reconstructs the input exactly, for every shape it refuses or accepts', () => {
    const cases = [
      '',
      'one paragraph',
      'para one\n\npara two',
      'para one\n\npara two\n\npara three',
      '# Heading\n\nbody text\n\n## Next\n\nmore',
      'before\n\n```\ncode\nwith\n\nblank lines inside\n```\n\nafter',
      '- alpha\n- beta\n\n- gamma\n- delta',
      'text\n\n- item one\n- item two\n',
      'a\n\n\n\nb',
    ];
    for (const content of cases) {
      expect(rejoin(content)).toBe(content);
    }
  });

  it('cuts at a blank line between two blocks and keeps the tail whole', () => {
    const { settled, tail } = splitAtSettledBlock('para one\n\npara two being streamed');
    expect(settled).toBe('para one');
    expect(tail).toBe('\n\npara two being streamed');
  });

  it('refuses every blank line inside a code fence', () => {
    // The only blank lines here are inside the fence, so nothing may settle.
    expect(splitAtSettledBlock('```\nlet a = 1;\n\nlet b = 2;\n\n').settled).toBe('');
    // A legal cut before the fence does not license a cut inside it.
    expect(splitAtSettledBlock('intro\n\n```\ncode\n\nmore\n').settled).toBe('intro');
  });

  it('takes the last legal cut, so the tail is only the block still being written', () => {
    const { settled, tail } = splitAtSettledBlock('```\ncode\n```\n\nnext block\n\nstill writing');
    expect(settled).toBe('```\ncode\n```\n\nnext block');
    expect(tail).toBe('\n\nstill writing');
  });

  it('will not split a list that a blank line only makes loose', () => {
    expect(splitAtSettledBlock('- alpha\n\n- beta\n').settled).toBe('');
    expect(splitAtSettledBlock('para\n\n- alpha\n\n- beta').settled).toBe('para');
  });

  it('only ever grows the settled half while a turn streams', () => {
    const pieces = ['# Title\n', '\n', 'First paragraph body\n', '\n', 'Second paragraph start\n',
      'continues\n', '\n', '## Section two\n', '\n', 'tail being writ'];
    let content = '';
    let previousSettled = '';
    for (const piece of pieces) {
      content += piece;
      const { settled } = splitAtSettledBlock(content);
      expect(settled.startsWith(previousSettled)).toBe(true);
      previousSettled = settled;
    }
    // And it actually settled something, or the optimisation would be inert.
    expect(previousSettled.length).toBeGreaterThan(0);
  });
});
