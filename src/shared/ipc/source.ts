/**
 * One web source the agent read, pushed in the terminal `chat:stream-chunk` as `sources`.
 *
 * Third declaration of this shape: `langgraph/state.ts:7` (main, about to be deleted
 * with the graph), `src/renderer/types.d.ts:22-26` (the loose copy that wins at
 * `tsc`), and the renderer's inline listener type in
 * `src/renderer/hooks/useChatSession.ts`. The renderer assigns its own `id`
 * (`source-N`) when it folds the array in, so `id` is deliberately **not** on the
 * wire type.
 */

export interface Source {
  /** Untrusted. `SourcesPanel` runs it through `safeExternalUrl` before any `href`. */
  url: string;
  title: string;
  /** Truncated to 120 characters by the renderer; keep it short on the wire too. */
  excerpt: string;
}