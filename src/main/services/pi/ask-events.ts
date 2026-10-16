/**
 * `AgentEvent` → the semantic events the chat pump pushes. Pure: no Agent, no Electron,
 * no network, no tool imports — feed it a recorded event list and it is fully testable.
 *
 * This replaces the `graph.streamEvents()` demux in `ipc/chat-handlers.ts`, which keyed
 * tokens off `metadata.langgraph_node` plus a hand-maintained `RESPONSE_NODE_SET`
 * whitelist. Two failure modes went with it:
 *
 *  - a graph node missing the whitelist streamed **nothing**, with no error anywhere;
 *  - the renderer's `ThinkingSteps.tsx` matched the `step` string against fixed maps, and
 *    the real node names (`browserSubgraph`, `postProcessNode`) matched none of them, so
 *    they rendered raw with no badge and no loading copy.
 *
 * Here the `step` string is the **tool name, verbatim**, and the human-readable copy comes
 * from `FamilyIndex.displayLabelFor()` — the `label` each toolbox already declares on the
 * tool itself. Nothing in this file, and nothing in the renderer, keeps a name→copy map.
 *
 * The previous shape mapped five tool names onto legacy graph-node strings
 * (`search_web` → `externalSearch`, and so on) so that three old badges would keep working.
 * That made the fall-through invisible: the other 39 first-party tools rendered their
 * internal identifier, and the file's own comment called that "a readable label, not a
 * blank". It was not readable and it was not a blank — it was `launch_app`.
 */
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AgentLabel } from "../../../shared/ipc/agent-label";
import type { Source } from "../../../shared/ipc/source";
import type { UiPayload } from "../../../shared/ipc/ui-payload";
import type { PiToolDetails } from "./toolbox";
import { IDLE_AGENT_LABEL, type FamilyIndex, type ToolFamily } from "./families";

/** One thing worth pushing to the renderer. A single `AgentEvent` can yield several. */
export type AskStreamEvent =
  | { kind: "token"; text: string }
  | { kind: "agent"; label: AgentLabel }
  | { kind: "step-start"; step: string; label: string; family: ToolFamily | null; detail: string; data: Record<string, unknown> }
  | { kind: "step-complete"; step: string; label: string; family: ToolFamily | null; detail: string }
  | { kind: "ui-payload"; payload: UiPayload }
  | { kind: "sources"; sources: Source[] };

export interface AskSummary {
  /** In the order the model produced them; the terminal chunk ships this list. */
  readonly uiPayloads: readonly UiPayload[];
  readonly sources: readonly Source[];
  /** The agent labels seen this turn, de-duplicated and in order. */
  readonly labels: readonly AgentLabel[];
}

/** `true` when the step string is one Pi hands us for a tool, not one we chose. */
const TOOL_STEP = "tool_execution";

/** The declared label, or the tool name itself when a toolbox supplied none. */
const displayLabel = (families: FamilyIndex, toolName: string): string =>
  families.displayLabelFor(toolName) ?? toolName;

const detailsOf = (result: unknown): PiToolDetails | undefined =>
  (result as { details?: PiToolDetails } | undefined)?.details;

const textDelta = (event: Extract<AgentEvent, { type: "message_update" }>): string => {
  const inner = event.assistantMessageEvent as { type?: string; delta?: string };
  return inner?.type === "text_delta" && inner.delta ? inner.delta : "";
};

export class AskEventTranslator {
  private readonly uiPayloads: UiPayload[] = [];
  private readonly sources: Source[] = [];
  private readonly labels: AgentLabel[] = [];

  constructor(private readonly families: FamilyIndex) {}

  get summary(): AskSummary {
    return { uiPayloads: this.uiPayloads, sources: this.sources, labels: this.labels };
  }

  /**
   * Translate one Pi event. Returns the semantic events it produced, in push order.
   *
   * The agent label is emitted on `tool_execution_start` rather than at turn start: with
   * no classifier there is no "Research" phase to announce before the model acts, so
   * `IDLE_AGENT_LABEL` (`General`) is what the pump uses until the first tool decides
   * otherwise. That is also the one label `AgentIndicator` always had and nothing sent.
   */
  translate(event: AgentEvent): AskStreamEvent[] {
    switch (event.type) {
      case "message_update":
        return this.onMessageUpdate(event);
      case "tool_execution_start":
        return this.onToolStart(event);
      case "tool_execution_end":
        return this.onToolEnd(event);
      default:
        // agent_start, turn_start, message_start, message_end, tool_execution_update,
        // and any arm Pi adds later. Deliberately a no-op: an event kind Qyther does not
        // surface is not an error, it is simply not pushed.
        return [];
    }
  }

  /** Convenience for a pump that has no per-event hook — every event, no filtering. */
  get idleLabel(): AgentLabel {
    return IDLE_AGENT_LABEL;
  }

  private onMessageUpdate(event: Extract<AgentEvent, { type: "message_update" }>): AskStreamEvent[] {
    const text = textDelta(event);
    return text ? [{ kind: "token", text }] : [];
  }

  private onToolStart(event: Extract<AgentEvent, { type: "tool_execution_start" }>): AskStreamEvent[] {
    const out: AskStreamEvent[] = [];
    // Only on change, so the pump forwards blindly and the renderer is not told the same
    // label twice — that dedup used to live in `chat-handlers.ts` as `lastEmittedAgent`.
    const changed = this.pushLabel(this.families.labelFor(event.toolName));
    if (changed) out.push({ kind: "agent", label: changed });
    out.push({
      kind: "step-start",
      step: event.toolName,
      label: displayLabel(this.families, event.toolName),
      family: this.families.familyOf(event.toolName) ?? null,
      detail: `Executing: ${event.toolName}`,
      data: { toolName: event.toolName, toolCallId: event.toolCallId, type: TOOL_STEP },
    });
    return out;
  }

  private onToolEnd(event: Extract<AgentEvent, { type: "tool_execution_end" }>): AskStreamEvent[] {
    const out: AskStreamEvent[] = [
      {
        kind: "step-complete",
        step: event.toolName,
        label: displayLabel(this.families, event.toolName),
        family: this.families.familyOf(event.toolName) ?? null,
        detail: `Completed: ${event.toolName}`,
      },
    ];
    const details = detailsOf(event.result);
    if (details?.uiPayload) {
      this.uiPayloads.push(details.uiPayload);
      out.push({ kind: "ui-payload", payload: details.uiPayload });
    }
    if (details?.sources?.length) {
      this.sources.push(...details.sources);
      out.push({ kind: "sources", sources: details.sources });
    }
    return out;
  }

  /** Record a label, returning it only when it differs from the one already current. */
private pushLabel(label: AgentLabel): AgentLabel | undefined {
    if (this.labels[this.labels.length - 1] === label) return undefined;
    this.labels.push(label);
    return label;
  }
}