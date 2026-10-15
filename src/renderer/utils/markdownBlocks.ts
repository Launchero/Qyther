/**
 * Where a streamed markdown body can be cut so that everything before the cut never has to be
 * parsed or reconciled again.
 *
 * `SimpleMarkdown` is a whole-string, line-by-line parser. While a turn streams, the answer grows
 * every animation frame, so each commit re-parsed the entire accumulated text and rebuilt the whole
 * element array — work whose only visible effect is on the last few lines. Splitting at a boundary
 * whose parser state is provably clean lets the settled half be rendered by a memoized component
 * that React skips outright when its text has not changed.
 *
 * The boundary rules are deliberately conservative, because a wrong cut is a *visible* wrong
 * render, not just a missed optimisation. A cut is allowed only at a blank line that
 * (a) is not inside a ``` fence, and
 * (b) does not follow a list item — a list interrupted by a blank line is a loose list and the
 *     parser owns it as one block, so cutting there would emit two lists.
 * A list *starting* after the cut is fine: a blank line always closes the block before it, so the
 * tail opens its own list exactly as the whole-string parse would.
 * If nothing qualifies, the content is returned whole and the caller behaves exactly as before.
 */

const FENCE = /^\s*```/;
const LIST_ITEM = /^\s*([-*+]\s|\d+\.\s)/;

export interface MarkdownSplit {
  /** Text whose parse cannot change again unless the stream is reset. `''` before the first cut. */
  settled: string;
  /** The block still being written — the only part that re-parses per frame. */
  tail: string;
}

export function splitAtSettledBlock(content: string): MarkdownSplit {
  if (!content) return { settled: '', tail: '' };

  const lines = content.split('\n');
  let inFence = false;
  // Index (exclusive) of the last legal cut, in lines.
  let cut = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.trim() !== '') continue;

    const prev = i > 0 ? lines[i - 1] : '';
    if (!prev.trim() || LIST_ITEM.test(prev)) continue;
    cut = i;
  }

  if (cut < 0) return { settled: '', tail: content };
  // The leading `\n` re-joins `settled`'s last line to the blank line the cut sits on: the cut
  // index names a line, and dropping it from both halves would lose a character per cut.
  return {
    settled: lines.slice(0, cut).join('\n'),
    tail: `\n${lines.slice(cut).join('\n')}`,
  };
}
