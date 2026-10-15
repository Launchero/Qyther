/**
 * The Ask-mode agent: ONE `Agent`, every tool family bound, no graph.
 *
 * This is the whole replacement for `langgraph/research-agent.ts` (1192 lines, a 5-node
 * `StateGraph`), `browser/browser-subgraph.ts` (8 nodes), `document/document-subgraph.ts`
 * (9 nodes), and both `createReactAgent` calls. What changed is not the tool surface — it
 * is that **routing is now the model's job**. There is no `classifyNode`, no
 * `routeAfterClassify`, no conditional edges, no `Annotation.Root` with 44 keys and no
 * `MemorySaver` checkpointer: the model reads a prompt describing the capabilities and
 * calls the tool it needs.
 *
 * Three things the graph gave us that a plain loop cannot, and what replaced each:
 *
 *  - **Which agent is active** → `families.ts` derives the label from the tool that is
 *    running, so `chat:agent-change` still fires and `AgentIndicator` still renders.
 *  - **Which nodes may stream tokens** → no node list at all. Every assistant message
 *    streams; there is nothing to forget to whitelist.
 *  - **Final state read back after the stream** (`graph.getState()`) → the run returns a
 *    value. Nothing is checkpointed because nothing needs to be re-read.
 *
 * Cancellation is unchanged in shape and is the load-bearing part: `withAbort` races
 * `agent.prompt()`, the caller's `AbortController` drives it, and an abort is an expected
 * outcome that returns `{aborted:true}` rather than throwing. That is what closed the
 * 2026-10-15 hang, and it does not care which framework runs the loop.
 */
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";

import type { AskStreamEvent, AskSummary } from "./ask-events";
import { AskEventTranslator } from "./ask-events";
import { buildAskToolboxes, buildAskFamilyIndex, TOOL_FAMILIES } from "./ask-tools";
import { buildAskSystemPrompt } from "./ask-prompt";
import { PROVIDER_ID, getPiModel, getPiStreamFn, isPiConfigured } from "./provider";
import type { Toolboxes } from "./families";
import type { PiTool } from "./toolbox";
import { TextAccumulator } from "./events";
import { withAbort, withTimeout } from "./abort";
import { createLogger } from "../../utils/logger";

const log = createLogger("Pi");

/**
 * Whole-run budget, matching `PiDesktopAgent`'s `RUN_TIMEOUT_MS` rather than the 120 s the
 * old pump applied to `graph.streamEvents`. 120 s aborted legitimate multi-tool turns; the
 * pump keeps its own shorter leash on *waiting*, which is a different thing.
 */
const ASK_RUN_TIMEOUT_MS = 10 * 60_000;

/** How much prior conversation to replay. Matches the pump's former `MAX_MESSAGES`. */
const HISTORY_TURNS = 10;

export interface AskHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface AskTurnRequest {
  query: string;
  sessionId: string;
  history: readonly AskHistoryEntry[];
  /** Text of any attached files, already extracted by the caller. */
  attachmentContext?: string;
  signal: AbortSignal;
}

export interface AskTurnResult {
  text: string;
  aborted: boolean;
  steps: number;
  summary: AskSummary;
}

export type AskEventSink = (event: AskStreamEvent) => void;

/** Injected so the loop body is testable without constructing a desktop adapter. */
export interface AskTurnDeps {
  toolboxes?: Toolboxes;
}

const now = () => Date.now();

const todayLine = (): string => {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `You have access to the current date. Today is ${today}. When asked about the date, day, or time, use this information directly. Do NOT say you don't have access to a clock or calendar — use the date provided here.`;
};

/**
 * Replay one prior assistant turn.
 *
 * Pi's `AssistantMessage` carries the full model envelope (`api`, `provider`, `model`,
 * `usage`, `stopReason`), so a bare `{role, content}` will not typecheck. The zeroed usage
 * is not a billing record and does not need to be one: these messages are replayed as
 * *context*, and what the endpoint bills is what it receives on this request, not the
 * history we paste into the transcript. Fabricating real numbers would be worse.
 */
function historyAssistantMessage(text: string, model: AssistantMessage["model"]): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: PROVIDER_ID,
    model,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: now(),
  };
}

/**
 * Build the prompt. The system prompt is Pi's own, carried on `initialState.systemPrompt`,
 * which `Agent` turns into the leading system message — so history and attachments go in
 * as ordinary messages behind it.
 */
function buildMessages(req: AskTurnRequest, systemPrompt: string, model: AssistantMessage["model"]): Message[] {
  const messages: Message[] = [
    { role: "system", content: todayLine(), timestamp: now() },
    { role: "system", content: systemPrompt, timestamp: now() },
  ];

  if (req.attachmentContext) {
    messages.push({
      role: "system",
      content: `The user has attached the following files as context for this conversation. Reference their contents when answering:\n${req.attachmentContext}`,
      timestamp: now(),
    });
  }

  for (const entry of req.history.slice(-HISTORY_TURNS)) {
    messages.push(
      entry.role === "user"
        ? { role: "user", content: entry.content, timestamp: now() }
        : historyAssistantMessage(entry.content, model),
    );
  }

  messages.push({ role: "user", content: req.query, timestamp: now() });
  return messages;
}

/** Thrown when the endpoint is unusable, so the pump can report it as an error turn. */
export class AskNotConfiguredError extends Error {
  constructor() {
    super("AI endpoint is not configured (MODEL/BASE_URL/API_KEY)");
    this.name = "AskNotConfiguredError";
  }
}

export async function runAskTurn(
  req: AskTurnRequest,
  sink: AskEventSink,
  deps: AskTurnDeps = {},
): Promise<AskTurnResult> {
  if (!isPiConfigured()) throw new AskNotConfiguredError();

  const model = getPiModel();
  if (!model) throw new AskNotConfiguredError();

  const toolboxes: Toolboxes = deps.toolboxes ?? (await buildAskToolboxes());
  const families = buildAskFamilyIndex(toolboxes);
  /**
 * `Toolboxes` is typed on `{ name: string }` so `families.ts` and `ask-events.ts` stay
 * Electron-free and unit-testable without constructing a desktop adapter. At this one
 * boundary the entries are real `PiTool`s, because `ask-tools.ts` is the only producer and
 * every factory in it returns one.
 */
const tools = Object.values(toolboxes).flat() as PiTool[];
  const translator = new AskEventTranslator(families);
  const accumulator = new TextAccumulator();

  // Only families with tools are advertised, so the prompt cannot name a capability the
  // model has no tool for.
  const bound = TOOL_FAMILIES.filter((family) => (toolboxes[family]?.length ?? 0) > 0);
  const systemPrompt = buildAskSystemPrompt(req.sessionId, bound, req.query);

  const agent = new Agent({
    initialState: { systemPrompt, model, tools, thinkingLevel: "off" },
    streamFn: getPiStreamFn(),
    sessionId: req.sessionId,
    // Sequential on purpose. The renderer builds a *timeline* from tool transitions and
    // folds a completion onto the open step by matching its `step` string, which is the
    // tool name — so two concurrent calls to the same tool would fold onto each other and
    // leave a spinner that never resolves. Parallel also buys nothing here: these are
    // screen, disk and network actions a user expects to see happen in order.
    toolExecution: "sequential",
  });

  const onAbort = () => agent.abort();
  req.signal.addEventListener("abort", onAbort, { once: true });
  if (req.signal.aborted) agent.abort();

  let steps = 0;
  let aborted = false;
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    steps += 1;
    for (const semantic of translator.translate(event)) sink(semantic);
    if (event.type === "message_update") {
      const inner = event.assistantMessageEvent as { type?: string; delta?: string };
      if (inner?.type === "text_delta" && inner.delta) accumulator.push(inner.delta);
    }
  });

  try {
    await withAbort(
          withTimeout(agent.prompt(buildMessages(req, systemPrompt, model.id)), ASK_RUN_TIMEOUT_MS),
          req.signal,
        );
    aborted = req.signal.aborted;
  } catch (error) {
    // An abort is an expected outcome, not a failure: the pump already reported the turn.
    if (!req.signal.aborted) throw error;
    aborted = true;
    log.info(`[Ask:${req.sessionId}] Run aborted after ${steps} events`);
  } finally {
    unsubscribe();
    req.signal.removeEventListener("abort", onAbort);
  }

  return { text: accumulator.text, aborted, steps, summary: translator.summary };
}