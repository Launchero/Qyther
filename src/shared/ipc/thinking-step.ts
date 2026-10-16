/**
 * One tool step of an Ask turn, as it crosses from the chat pump to the transcript.
 *
 * Types-only, like the other `shared/ipc` modules, so main, preload and renderer all read
 * the same declaration. This shape used to exist twice — `ThinkingStepRow` in
 * `src/main/ipc/chat-handlers.ts` and `ThinkingStep` in `src/renderer/hooks/useChatSession.ts`
 * — and the two drifted exactly the way duplicated boundary types do: when the bridge
 * started carrying a human `label`, only one of them would have known about it.
 */
export interface ThinkingStep {
  type: string;
  /** The tool name, verbatim. Never a renderer-side alias for it. */
  step: string;
  /**
   * Human copy taken from the tool's own `label` declaration by
   * `FamilyIndex.displayLabelFor()`, falling back to the tool name when a toolbox
   * supplied none. The renderer displays this and holds no name→copy map of its own.
   */
  label?: string;
  /** Which tool family contributed the step, so a badge needs no tool-name list either. */
  family?: string | null;
  status: string;
  detail: string;
  data?: unknown;
  /** Set when this row updates an already-open step rather than adding one. */
  update?: boolean;
}
