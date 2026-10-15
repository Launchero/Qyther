/**
 * `AgentEvent` → the callbacks a chat pump needs. Pure: no Agent, no Electron, no network,
 * so the whole translation is unit-testable by feeding it a recorded event list.
 *
 * This is the Pi-native replacement for the LangChain path's `streamEvent.metadata.langgraph_node`
 * routing. That keyed tokens off an untyped metadata string and a hand-maintained
 * `RESPONSE_NODE_SET`; Pi's `AgentEvent` is a discriminated union, so each arm below is
 * exhaustive by construction and a new event kind is a type error rather than a silent drop.
 *
 * Pi has **no** custom-event channel, so every renderer-facing signal has to ride an existing
 * arm. Progress rides `tool_execution_start`/`_end` and the toolbox's `details`; tokens ride
 * `message_update`. Do not design around a custom event.
 */
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { PiToolDetails } from "./toolbox";

export interface ToolProgress {
  toolName: string;
  toolCallId: string;
  status: string;
  message: string;
  isError: boolean;
  durationMs?: number;
  /** True when the toolbox asked for the pixel verifier to run on this result. */
  verifies: boolean;
}

export interface AgentBridge {
  /** A streamed token, already extracted from the assistant's content block. */
  onText?: (delta: string) => void;
  /** A streamed reasoning fragment, if the model emits any. */
  onThinking?: (delta: string) => void;
  onToolStart?: (progress: ToolProgress) => void;
  onToolEnd?: (progress: ToolProgress) => void;
  /** Fired once per run with the final assistant text. */
  onComplete?: (text: string, details: PiToolDetails | undefined, isError: boolean) => void;
}

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is TextContent => (c as { type?: string })?.type === "text")
    .map((c) => c.text)
    .join("");
};

const detailsOf = (result: unknown): PiToolDetails | undefined =>
  (result as { details?: PiToolDetails } | undefined)?.details;

function handleUpdate(event: Extract<AgentEvent, { type: "message_update" }>, bridge: AgentBridge): void {
  const inner = event.assistantMessageEvent as { type?: string; delta?: string };
  if (!inner?.delta) return;
  if (inner.type === "text_delta") bridge.onText?.(inner.delta);
  else if (inner.type === "thinking_delta") bridge.onThinking?.(inner.delta);
}

function handleToolStart(event: Extract<AgentEvent, { type: "tool_execution_start" }>, bridge: AgentBridge): void {
  bridge.onToolStart?.({
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    status: "capturing",
    message: `Executing: ${event.toolName}`,
    isError: false,
    verifies: false,
  });
}

function handleToolEnd(event: Extract<AgentEvent, { type: "tool_execution_end" }>, bridge: AgentBridge): void {
  const details = detailsOf(event.result);
  bridge.onToolEnd?.({
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    status: details?.status ?? "complete",
    message: textOf((event.result as { content?: unknown } | undefined)?.content) || `Completed: ${event.toolName}`,
    isError: event.isError,
    durationMs: event.durationMs,
    verifies: details?.verifies === true,
  });
}

function handleTurnEnd(event: Extract<AgentEvent, { type: "turn_end" }>, bridge: AgentBridge): void {
  const message = event.message as { content?: unknown; errorMessage?: string };
  bridge.onComplete?.(textOf(message?.content), undefined, Boolean(message?.errorMessage));
}

function handleAgentEnd(event: Extract<AgentEvent, { type: "agent_end" }>, bridge: AgentBridge): void {
  // The last assistant message is the run's answer. Prefer it over the per-turn completion
  // when the run ended on it, so a multi-turn run reports its final message once.
  const last = event.messages?.[event.messages.length - 1];
  if (!last) return;
  const message = last as { role?: string; content?: unknown; errorMessage?: string };
  if (message.role !== "assistant") return;
  bridge.onComplete?.(textOf(message.content), undefined, Boolean(message.errorMessage));
}

/** Feed one event through the bridge. Unknown/irrelevant arms are a no-op by design. */
export function dispatchAgentEvent(event: AgentEvent, bridge: AgentBridge): void {
  switch (event.type) {
    case "message_update":
      return handleUpdate(event, bridge);
    case "tool_execution_start":
      return handleToolStart(event, bridge);
    case "tool_execution_end":
      return handleToolEnd(event, bridge);
    case "turn_end":
      return handleTurnEnd(event, bridge);
    case "agent_end":
      return handleAgentEnd(event, bridge);
    default:
      // agent_start, turn_start, message_start, message_end, tool_execution_update
      return;
  }
}

/** Accumulated text for a whole run — what the transcript persists as the answer. */
export class TextAccumulator {
  private buffer = "";
  push(delta: string): void {
    this.buffer += delta;
  }
  get text(): string {
    return this.buffer;
  }
  reset(): void {
    this.buffer = "";
  }
}
