/**
 * The generative-UI payload main pushes in the terminal `chat:stream-chunk`.
 *
 * This shape is currently declared FOUR times with three different levels of
 * strictness: `src/renderer/hooks/useChatSession.ts:17-22` and
 * `src/renderer/components/ChatMessageBubble.tsx:20-25` (both
 * `{type: GenerativeUIType; title; data; node}`), `src/renderer/types.d.ts:15-20`
 * (`type: string` — and that file WINS at `tsc`, so its looser `type: string` is what
 * main is actually checked against), and `src/preload/preload.ts:120-125`. This is
 * the duplicate *definition* `src/shared/` exists to remove; the four-site
 * registration rule is untouched.
 */

/**
 * The payload discriminants `GenerativeUI/index.tsx:9` can dispatch, in the exact
 * order of that union.
 *
 * **`list` has never had a producer.** No file under `src/main` ever built a
 * `type: 'list'` payload; the renderer has had a branch for it since the feature
 * shipped. The `create_list` tool now produces one, which is what closes the gap.
 */
export const GENERATIVE_UI_TYPES = ["table", "form", "comparison", "list", "chart"] as const;

export type GenerativeUIType = (typeof GENERATIVE_UI_TYPES)[number];

export interface UiPayload {
  type: GenerativeUIType;
  title: string;
  /**
   * Rendered as-is by the matching component (`DataTable`, `FormPreview`,
   * `ComparisonTable`, the inline list branch, `ChartView`). Each has its own
   * exported shape — `TableData`, `FormField`, `ComparisonItem`, `ChartDataPoint`
   * — and each validates defensively, so an unknown-key payload renders the
   * `:92` JSON fallback rather than throwing.
   */
  data: Record<string, unknown>;
  /**
   * Which capability produced the payload: a `ToolFamily` value, or the tool name
   * for an MCP-supplied payload. Historically this held a LangGraph node name
   * (`postProcessNode`, `browserSubgraph`) that no renderer code ever branched on.
   * Kept in the same position and still required, because three renderer sites
   * declare it required — changing that is its own deliberate edit.
   */
  node: string;
}

export function isGenerativeUIType(value: unknown): value is GenerativeUIType {
  return typeof value === "string" && (GENERATIVE_UI_TYPES as readonly string[]).includes(value);
}