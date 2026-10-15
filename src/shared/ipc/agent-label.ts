/**
 * The closed set of labels the renderer will actually render for an active agent.
 *
 * `src/renderer/components/ask-mode/AgentIndicator.tsx:5-11` holds the only
 * `AGENT_CONFIG` map, and `:22-23` does `if (!config) return null` — so a label
 * outside this set does not error, does not warn, and simply renders nothing.
 * That is the same silent-drift class the root rail records for LangGraph node
 * registration, so the set lives here where both processes can import it.
 *
 * Types-only apart from the two narrow guards, which are pure and deterministic.
 */

export const AGENT_LABELS = ["Research", "General", "Browser", "Desktop", "Document"] as const;

export type AgentLabel = (typeof AGENT_LABELS)[number];

/**
 * The payload main pushes on `chat:agent-change`. The renderer reads exactly one
 * field off it (`withAgentLabel` stores `data.label` onto the streaming message),
 * and `AgentIndicator` then looks that string up in its own closed map.
 */
export interface AgentChangePayload {
  label: AgentLabel;
}

/** Fail closed on an unknown label rather than coercing it, per `src/shared/AGENTS.md`. */
export function isAgentLabel(value: unknown): value is AgentLabel {
  return typeof value === "string" && (AGENT_LABELS as readonly string[]).includes(value);
}