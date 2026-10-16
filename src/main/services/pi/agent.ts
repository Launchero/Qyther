/**
 * The Pi desktop agent: one `Agent`, 32 tools, no graph.
 *
 * This replaces `DesktopAgent`'s hand-rolled ReAct loop (`desktop-agent.ts:328-641`, ~300
 * lines of message bookkeeping, tool-call dispatch, retry/backoff and progress plumbing)
 * with the loop Pi already ships. Nothing here re-implements a loop; the only Qyther logic
 * left is the two things Pi deliberately leaves to the caller:
 *
 *  - the **initial screenshot** decision (a cold-start optimisation: skipped for simple
 *    window tasks, and degraded to a text-only first message when capture fails), and
 *  - the **pixel verifier**, which runs on whichever tool sets `details.verifies` and feeds
 *    its verdict back with `agent.steer()` — the native replacement for pushing a corrective
 *    `HumanMessage` into the transcript.
 *
 * NOT wired: this class has no production caller. `runPiDesktopTask()` and
 * `getPiDesktopAgent()` are referenced nowhere outside this file — the Ask loop took the
 * desktop tools directly through `getDesktopToolbox()`, so a shipped turn runs the same 32
 * tools with no verifier in the loop. What IS live here is the shared substrate:
 * `getDesktopRuntime()`/`getDesktopToolbox()` (bound by `ask-tools.ts`) and
 * `disposeDesktopRuntime()`, reached at quit through `closePiDesktopAgent()`. Wiring the
 * verifier back in means either routing Ask turns through this class or lifting the
 * `details.verifies` check into `ask-turn.ts`; deleting this half is the other option.
 */
import { screen } from "electron";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { DesktopAdapter } from "../desktop/types";
import { GroundTruthVerifier } from "../desktop/verifier";
import { WindowsDesktopAdapter } from "../desktop/windows-adapter";
import { AccessibilityTreeAdapter } from "../desktop/accessibility-tree";
import { createPiDesktopToolbox, type PiTool } from "./toolbox";
import { buildSystemPrompt } from "./prompt";
import { dispatchAgentEvent, TextAccumulator, type AgentBridge } from "./events";
import { withAbort, withTimeout } from "./abort";
import { getPiModel, getPiStreamFn, isPiConfigured } from "./provider";
import { createLogger } from "../../utils/logger";

const log = createLogger("Pi");

/**
 * Ceiling on ONE `agent.prompt()` call, i.e. a whole multi-step run.
 *
 * `DesktopAgent` had `llmTimeoutMs = 60_000`, but that capped a *single model call* inside
 * its loop, not the run — a 3-step task legitimately runs for minutes across several calls
 * plus real `wait`/`launch_app` sleeps. Reusing 60s here aborted legitimate runs, so this is
 * a whole-run budget instead. The graph's own `GRAPH_TIMEOUT_MS` (120s in `chat-handlers.ts`)
 * is a separate, shorter leash on the *stream*: when it fires the renderer stops waiting but
 * the node's promise is not cancelled, which is the leak noted on `run()`.
 */
const RUN_TIMEOUT_MS = 10 * 60_000;

export interface PiDesktopRun {
  text: string;
  steps: number;
  aborted: boolean;
}

/**
 * Cheap window tasks do not need the ~1s initial capture. Preserved from
 * `desktop-agent.ts:209-210` — it is a cold-start optimisation, not a heuristic, and the
 * regex is the gate.
 */
function isSimpleWindowTask(task: string): boolean {
  return (
    /^(minimize|maximize|restore|close|focus)\s+(the\s+)?window/i.test(task) ||
    /window.*(minimize|maximize|restore|close|focus)/i.test(task)
  );
}

export interface PiDesktopAgentDeps {
  adapter: DesktopAdapter;
  a11y: AccessibilityTreeAdapter;
  verifier?: GroundTruthVerifier;
}

export class PiDesktopAgent {
  private tools: PiTool[];
  private agent: Agent | null = null;
  private baselineSet = false;
  private steps = 0;
  private runController: AbortController | null = null;

  constructor(private readonly deps: PiDesktopAgentDeps) {
    this.tools = createPiDesktopToolbox(deps.adapter, deps.a11y);
  }

  isReady(): boolean {
    return isPiConfigured() && this.tools.length > 0;
  }

  /**
   * Stop the in-flight run. Safe to call when idle. This is the only way out of a run that
   * is awaiting a model response — Pi routes the abort into the active stream, and the
   * signal is also handed to every tool, so a long `wait`/`launch_app` poll unblocks too.
   */
  abort(): void {
    this.runController?.abort();
    this.agent?.abort();
  }

  /**
   * Release the native resources this agent owns: the adapter's tesseract worker and the
   * UIA facade behind the a11y tree. Called only from `closePiDesktopAgent()` on quit.
   *
   * Deliberately not per-run: the agent is a process-wide singleton, so tearing the native
   * layer down between tasks would leave it unable to run a second one. `abort()` is the
   * per-run stop; this is the process stop.
   */
  async dispose(): Promise<void> {
    this.abort();
    this.agent = null;
    try {
      await this.deps.adapter.cleanup?.();
      await this.deps.a11y.cleanup();
      log.info("Pi desktop agent native resources released");
    } catch (error) {
      // Teardown must never block quit; the native handles die with the process anyway.
      log.warn("Pi desktop agent cleanup failed (continuing quit)", error);
    }
  }

  /**
   * Run one task. `bridge` receives every token, tool transition and the final answer;
   * see `./events.ts` for the translation from Pi's `AgentEvent`.
   *
   * `signal` is optional and additive: pass one and aborting it stops the run. With no
   * signal the run is still stoppable through `abortPiDesktopRun()` — but nothing calls
   * that today. The chat pump no longer reaches this class at all: Ask mode's own
   * `AbortController` is passed into `runAskTurn`, which aborts the `Agent` it built.
   */
  async run(
    task: string,
    sessionId: string,
    bridge: AgentBridge = {},
    signal?: AbortSignal,
  ): Promise<PiDesktopRun> {
    const model = getPiModel();
    if (!model) throw new Error("Pi model is not configured (MODEL/BASE_URL/API_KEY)");

    this.steps = 0;
    this.baselineSet = false;
    const accumulator = new TextAccumulator();
    const prompt = await this.buildFirstMessage(task, sessionId);

    this.agent = new Agent({
      initialState: { systemPrompt: prompt.system, model, tools: this.tools, thinkingLevel: "off" },
      streamFn: getPiStreamFn(),
      sessionId,
      toolExecution: "parallel",
    });

    // One controller per run. It drives Pi's own abort, is handed to every tool through
    // `Agent`, and is what `withAbort` races against so the promise settles promptly.
    const controller = new AbortController();
    this.runController = controller;
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (signal?.aborted) controller.abort();

    const unsubscribe = this.agent.subscribe((event) => {
      this.steps += 1;
      if (event.type === "message_update") {
        const inner = event.assistantMessageEvent as { type?: string; delta?: string };
        if (inner?.type === "text_delta" && inner.delta) accumulator.push(inner.delta);
      }
      dispatchAgentEvent(event, bridge);
      if (event.type === "tool_execution_end") void this.maybeVerify(event);
    });

    let aborted = false;
    try {
      await withAbort(withTimeout(this.agent.prompt(prompt.first), RUN_TIMEOUT_MS), controller.signal);
      aborted = controller.signal.aborted;
    } catch (error) {
      // An abort is an expected outcome, not a failure: the pump already reported the turn.
      if (!controller.signal.aborted) throw error;
      aborted = true;
      log.info(`[Session:${sessionId}] Run aborted after ${this.steps} events`);
    } finally {
      unsubscribe();
      signal?.removeEventListener("abort", onExternalAbort);
      this.runController = null;
    }

    return { text: accumulator.text, steps: this.steps, aborted };
  }

  /**
   * The system prompt needs to know whether a screenshot is coming, and the first user
   * message carries it. Both branches are load-bearing: a failed capture must degrade to a
   * text-only turn rather than throw, and the simple-window-task skip is the cold-start win.
   */
  private async buildFirstMessage(task: string, sessionId: string): Promise<{ system: string; first: AgentMessage }> {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    log.debug(`[Session:${sessionId}] Primary display: ${width}x${height}`);

    if (isSimpleWindowTask(task)) {
      log.info(`[Session:${sessionId}] Skipping initial screenshot for simple window task (saves ~1s)`);
      return {
        system: buildSystemPrompt({ screenWidth: width, screenHeight: height, sessionId, hasScreenshot: false }),
        first: { role: "user", content: [{ type: "text", text: task }], timestamp: Date.now() },
      };
    }

    const shot = await this.captureInitial();
    const system = buildSystemPrompt({
      screenWidth: width,
      screenHeight: height,
      sessionId,
      hasScreenshot: Boolean(shot),
    });
    // A user turn carries text and at most an image; `AgentMessage["content"]` is wider
    // than that (it also covers assistant thinking/toolCall blocks), so pin it.
    const content: Array<TextContent | ImageContent> = [{ type: "text", text: task }];
    if (shot) {
      content.push({ type: "image", data: stripDataUrl(shot.dataUrl), mimeType: mimeOf(shot.dataUrl) });
    }
    return { system, first: { role: "user", content, timestamp: Date.now() } };
  }

  private async captureInitial(): Promise<{ dataUrl: string } | null> {
    const started = Date.now();
    try {
      const result = await this.deps.adapter.captureScreen(0);
      const primary = result.monitors[0];
      if (primary?.dataUrl) {
        log.info(`[Pi] Initial screenshot ${primary.width}x${primary.height} in ${Date.now() - started}ms`);
        return { dataUrl: primary.dataUrl };
      }
      log.warn("[Pi] Initial screenshot returned no data URL, falling back to text-only");
    } catch (error) {
      log.warn("[Pi] Initial screenshot failed, proceeding with text-only first message", error);
    }
    return null;
  }

  /**
   * Run the pixel verifier for any tool that opted in via `details.verifies`, and steer the
   * verdict back into the run. This is the native form of the old corrective-HumanMessage
   * injection: `steer()` queues the message for the next model turn instead of mutating the
   * transcript behind the loop's back.
   */
  private async maybeVerify(event: Extract<AgentEventLike, { type: "tool_execution_end" }>): Promise<void> {
    const details = (event.result as { details?: { verifies?: boolean } } | undefined)?.details;
    if (!details?.verifies || !this.deps.verifier) return;
    const { toolName, args } = event as unknown as { toolName: string; args: Record<string, unknown> };
    try {
      if (!this.baselineSet) {
        await this.deps.verifier.updateBaseline(this.deps.adapter);
        this.baselineSet = true;
      }
      const verdict = await this.deps.verifier.verify({ type: toolName, args } as never, this.deps.adapter);
      log.info(`[Pi] Verification for "${toolName}": score=${verdict.score} hardReject=${verdict.hardReject}`);
      const message = verdict.hardReject
        ? `VERIFICATION: Your last action (${toolName}) did not produce the expected effect. The screen did not show the expected changes (hard reject). Try a different approach.`
        : verdict.score < 0.5
          ? `VERIFICATION: Your last action (${toolName}) had limited effect on screen. Consider trying a different approach.`
          : null;
      if (message) this.agent?.steer({ role: "user", content: [{ type: "text", text: message }], timestamp: Date.now() });
    } catch (error) {
      log.warn(`[Pi] Verification failed for "${toolName}"`, error);
    }
  }
}

/** Local alias so the verifier hook can name the event arm without importing the union. */
type AgentEventLike = Parameters<typeof dispatchAgentEvent>[0];

const stripDataUrl = (dataUrl: string): string => dataUrl.replace(/^data:[^;,]+;base64,/, "");
const mimeOf = (dataUrl: string): string => /^data:([^;,]+);base64,/.exec(dataUrl)?.[1] ?? "image/png";

/**
 * The native substrate + the 32-tool toolbox, memoised behind one accessor.
 *
 * Split out from `PiDesktopAgent` because the toolbox now has **two** consumers: the
 * desktop agent class below, and `ask-tools.ts`, which binds the same 32 tools into the
 * single Ask-mode agent. They must be the *same* adapter and a11y instances — the UIA
 * facade and the tesseract worker are expensive, process-wide native handles, and two
 * copies would double them and fork the handle tables.
 *
 * Construction is still lazy, which is the real cold-start protection: neither belongs on
 * the boot path, and `main.ts` must never statically import this module.
 */
export interface DesktopRuntime {
  adapter: DesktopAdapter;
  a11y: AccessibilityTreeAdapter;
  verifier: GroundTruthVerifier;
}

let runtime: DesktopRuntime | null = null;
let desktopTools: PiTool[] | null = null;

async function getDesktopRuntime(): Promise<DesktopRuntime> {
  if (runtime) return runtime;
  const adapter = new WindowsDesktopAdapter();
  const a11y = new AccessibilityTreeAdapter();
  await a11y.initialize();
  runtime = { adapter, a11y, verifier: new GroundTruthVerifier() };
  log.info("Pi desktop runtime initialised");
  return runtime;
}

/**
 * The 32 desktop tools as Pi tools, built once. Identity matters: `ask-turn.ts` binds this
 * array into its `Agent`, so handing back a fresh array per call would defeat any
 * identity check and re-run the factory for nothing.
 */
export async function getDesktopToolbox(): Promise<PiTool[]> {
  if (desktopTools) return desktopTools;
  const { adapter, a11y } = await getDesktopRuntime();
  desktopTools = createPiDesktopToolbox(adapter, a11y);
  return desktopTools;
}

/** Release the native handles. The `pi-desktop-agent` step of `buildShutdownSteps()`. */
export async function disposeDesktopRuntime(): Promise<void> {
  const held = runtime;
  runtime = null;
  desktopTools = null;
  if (!held) return;
  try {
    await held.adapter.cleanup?.();
    await held.a11y.cleanup();
    log.info("Pi desktop runtime released");
  } catch (error) {
    // Teardown must never block quit; the native handles die with the process anyway.
    log.warn("Pi desktop runtime cleanup failed (continuing quit)", error);
  }
}

/**
 * Process-wide agent, mirroring the `desktopAgent` singleton `desktop-agent.ts` exported.
 *
 * Construction is lazy because it opens the UIA facade and a tesseract worker, neither of
 * which belongs on the boot path — the Ask-mode agent is assembled at boot and desktop
 * automation is a minority of turns. The verifier baseline lives on the instance, so runs
 * that must share one go through here rather than constructing their own.
 */
let singleton: PiDesktopAgent | null = null;

export async function getPiDesktopAgent(): Promise<PiDesktopAgent> {
  if (singleton) return singleton;
  const { adapter, a11y, verifier } = await getDesktopRuntime();
  singleton = new PiDesktopAgent({ adapter, a11y, verifier });
  return singleton;
}

/** Run one desktop task on the shared agent. The shape both `research-agent.ts` and
 *  `document-delegation.ts` call; neither needs the instance itself. */
export async function runPiDesktopTask(
  task: string,
  sessionId: string,
  bridge: AgentBridge = {},
  signal?: AbortSignal,
): Promise<PiDesktopRun> {
  return (await getPiDesktopAgent()).run(task, sessionId, bridge, signal);
}

/**
 * Abort whatever desktop run is in flight. The chat pump calls this when it stops waiting on
 * a turn — a Stop press, the 120s `GRAPH_TIMEOUT_MS`, or normal completion — which is what
 * guarantees a run cannot outlive its turn.
 *
 * A single slot is correct rather than a compromise: Pi's `Agent.prompt()` throws if that
 * instance is already processing, and the agent is a singleton, so there can only ever be
 * one desktop run. A per-turn map would imply concurrency the agent cannot have.
 */
export function abortPiDesktopRun(): void {
  singleton?.abort();
}

/**
 * Release the agent and everything native it opened. Mirrors the old
 * `desktopAgent.closeSession` / `cleanup` pair, collapsed into one. Called from
 * `app.on('will-quit')` (`src/main/main.ts`) — without it the tesseract worker and the UIA
 * facade outlive the last run and the process lingers on quit.
 *
 * The singleton is cleared *before* awaiting, so a run that starts during teardown gets a
 * fresh agent rather than one whose adapter is being torn down under it.
 */
export async function closePiDesktopAgent(): Promise<void> {
  const agent = singleton;
  singleton = null;
  if (agent) {
    await agent.dispose();
    log.info("Pi desktop agent closed");
  }
  // The runtime is shared with `ask-tools.ts`, so releasing the agent alone would leave the
  // UIA facade and tesseract worker alive for a turn that will never come.
  await disposeDesktopRuntime();
}
