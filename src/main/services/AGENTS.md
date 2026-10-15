# src/main/services — DOX agent-runtime parent

Binding work contract for this subtree. The root `AGENTS.md` rail controls repo-wide rules; this doc controls the agent runtime across `services/`. Child docs control their folders.

## Purpose

Host of the Ask-mode agent runtime: LLM model bootstrap, the one Ask loop, the cross-process streaming contract to the renderer, and the tool families that loop binds. **There is no graph, no intent classifier and no inter-agent delegation** — one Pi `Agent` holds every family at once and routes by choosing a tool.

## Ownership

- `pi/` — the whole runtime: model bootstrap, `runAskTurn`, the six tool families and their assembly point, the `AgentEvent`→bridge translator, cancellation. Owned by `pi/AGENTS.md`. This is the **live** Ask path.
- `langchain/agent.ts` (~360 lines) — **now a session store only**: the in-memory `ChatSession` map, the `chat:sessions-changed` push notifier, and the browser-session lifecycle methods `mcp-handlers.ts`/`browser-handlers.ts` call. It holds no model and builds no agent; `isReady()` defers to Pi's `isPiConfigured()`. No child doc; rules live here.
- Cross-process streaming contract — implemented in `src/main/ipc/chat-handlers.ts`, consumed from `pi/ask-turn.ts`; owned by this doc.
- `utils/document-loader.ts` — leaf, no doc of its own.
- Web substrate — `web/` (search provider chain + URL fetch pipeline), owned by `web/AGENTS.md`. Consumed by the `web` tool family (`pi/tools/web-tools.ts`).
- Desktop runtime substrate — `desktop/` (koffi/libwin32 calls, UIA facade, OCR, capture, pixel verifier), owned by `desktop/AGENTS.md`. The 32 tools that drive it live in `pi/toolbox.ts`.
- Browser subtree — `browser/` (Playwright session, skills material), owned by `browser/AGENTS.md`. Its tool *family* is `pi/tools/browser-tools.ts`.
- Document subtree — `document/` (the docx/pptx/xlsx writers and the re-parse verifier), owned by `document/AGENTS.md`. Its tool *family* is `pi/tools/document-tools.ts`.

## Local Contracts

- **One way in**: nothing outside `src/main` touches these modules. Renderer reaches the runtime only through the IPC handlers in `src/main/ipc/` (`chat-handlers.ts` for Ask, `mcp-handlers.ts` for MCP control); the channel contract is owned by `src/main/ipc/AGENTS.md`.
- **Env reads at module load.** `pi/provider.ts:16-18` reads `MODEL`/`API_KEY`/`BASE_URL` at import time, so env must be set before first import of this subtree. `langchain/agent.ts` no longer constructs a model and no longer reads env beyond a warn in `initialize()`.
- **With no API key there is no mock or offline path.** `runAskTurn` throws `AskNotConfiguredError` before any model call; the pump maps that to the renderer's not-configured envelope (`{ success, ready:false, retryable:false, error }`). Never add an offline path unasked.
- **Streaming contract** (highest-value content here):
  - One `runAskTurn(req, onEvent)` call per turn (`chat-handlers.ts:468`), wrapped in the pump's own `ASK_PUMP_TIMEOUT_MS` (120 s) leash, which is **distinct from** `ASK_RUN_TIMEOUT_MS` (10 min) inside `ask-turn.ts`. The pump's stops the renderer waiting; the inner one bounds the model run.
  - Per-turn thread id `${sessionId}:turn-${Date.now()}` — one thread per turn isolates nothing now (there is no checkpointer) but still names the turn on the wire.
  - The translator (`pi/ask-events.ts`) turns each `AgentEvent` into zero or more `AskStreamEvent`s; the pump switches on `event.kind` and emits `chat:stream-chunk` for `token`, `chat:agent-change` for `agent` (deduped against the last emitted label), and `chat:thinking-step` for `step-start`/`step-complete`.
  - **The label is derived from the tool, not announced by a classifier.** `families.ts` maps tool name → family → `AgentLabel`; before any tool runs the label is `IDLE_AGENT_LABEL` (`"General"`).
  - Terminal chunk carries `metrics`, `thinkingSteps`, `fullContent`, `uiPayloads`, `sources`. `uiPayloads` and `sources` are accumulated by the translator and shipped **only** in the terminal chunk — the renderer only renders a payload once `isStreaming` is false, so an early push would be dropped rather than shown.
  - Three exits, three shapes: a user Stop is `{chunk:'', isComplete:true}` **without** `error`; a timeout is `{chunk:'', isComplete:true, error}` the user is told to retry; normal completion is the full terminal chunk above.
  - HITL: **there is none.** The approval gate, `interrupt()` and `chat:resumeGraph` are all deleted. No turn pauses and no renderer channel can resume one.
- **Teardown is owned by `main.ts`, and this subtree's releases are steps in that list.** The order is `global-shortcuts` → `tray` → `browser-agent` → `mcp` → `pi-desktop-agent` → `database`. See `../../AGENTS.md` ## Process & Resource Lifecycle for why that order is a contract. Three belong here:
  - **`cleanupBrowserAgent()` is the browser subtree's release path and clears its own timer.** It nulls the session id *after* clearing `browserSessionTimeout`; it used to leave the timer armed, so a live 5-minute handle outlived the work it watched and later fired against a null session. Reached at quit through a dynamic import from `main.ts` (ineffective for chunking — the registrars already import this module statically — kept because the import doubles as the "was a session ever opened?" test).
  - **`PiDesktopAgent.dispose()`** (native tesseract + UIA) is the `pi-desktop-agent` step, bounded and observed.
  - **`DatabaseManager.close()`** is the `database` step and is deliberately **last**, because it flushes to disk and should capture anything written during the earlier steps.
  - There is **no `browser-memory` step**: `browser/browser-memory.ts` was deleted with the graph node that was its only writer.
  - **A new long-lived holder in this subtree gets a step in `buildShutdownSteps()` in the same change that creates it.**
- **Delegation is gone, and that is a design change not a gap.** The single agent holds the browser, desktop and document tools simultaneously, so "delegate to the browser" is the model calling a `browser_` tool mid-turn. `document/document-delegation.ts`, `AskState.crossAgentContext` and the typed `*DelegationResult` shapes are all deleted with it.
- **Web research runs search then fetch, and both come from one folder.** The `web` family calls `searchWeb` for ranked sources and `fetchWebPage` on the top results, so the model works from real page bodies rather than snippets. Both come from `web/`, which is Electron-free and LangChain-free on purpose; its guard, budgets and chain policy are `web/AGENTS.md`'s contract. Every source the chain returned rides in `details.sources` so the chat pump can ship citations.
- **MCP supply line**: `mcpService.getTools()` returns `PiTool[]` and feeds exactly two consumers, both of which *filter* it rather than wrapping it — `pi/tools/browser-tools.ts` takes the `browser_`-prefixed ones, `pi/tools/mcp-tools.ts` takes the rest. There is deliberately no second adapter layer: `mcp/client.ts` is the single conversion point from an MCP server's JSON Schema to a Pi tool.
- **`zod` is unused in `src/` and stays only as a transitive peer.** All schemas are TypeBox (`parameters` on a Pi tool *is* the schema). Do not reintroduce a Zod layer next to a TypeBox one.

## Work Guidance

- New agent capability: create the toolbox under `pi/tools/`, add its `ToolFamily` row to `pi/families.ts`, its guidance string to `pi/ask-prompt.ts`, and one bind line in `pi/ask-tools.ts`. Four edits; the `families.test.ts` duplicate-name gate makes a fifth unnecessary.
- Model configuration changes go through env vars read at module load; do not add a second config surface.
- Karpathy caps from the root rail apply: max 50 lines per function.

## Verification

- `npm run typecheck`, `npm run lint` and `npm run test` all run in this checkout — `node_modules` is installed here (`npx electron-rebuild` only when a native addon must match Electron's ABI). A fresh clone needs `npm install` first.
- **What is covered here.** The Ask loop's pieces are unit-gated under `pi/` (94 tests / 11 files: the family index, the translator, each toolbox, the abort race, the 32 desktop tools). `chat-handlers.ts` is imported by three wire tests — `ipc/chat-sessions-push.test.ts`, `ipc/chat-resume-contract.test.ts`, `ipc/chat-cancel-turn.test.ts` — and `langchain/agent.ts` is driven for real by `langchain/sessions-publish.test.ts` (it stubs MCP and the browser agents, and asserts the agent publishes a session list on its own mutation sites and not on a create that leaves the list unchanged).
- **What is not covered: the pump itself.** Chunk assembly and label routing in `chat-handlers.ts` have no test, so `npm run dev` watching `chat:agent-change` / `chat:stream-chunk` end-to-end remains the gate for that path. Say so rather than implying the wire tests cover it.
- Test files in this subtree: `pi/*.test.ts` and `pi/tools/*.test.ts`, `mcp/client-contract.test.ts` (drives the real pi-mcp client against the repo's own stdio server), `mcp/tool-router.test.ts`, `database/database-manager.test.ts`, `utils/document-loader.test.ts`, `document/document-executor.test.ts`, `document/document-tools.test.ts`, `desktop/ffi.test.ts`, `desktop/ocr.test.ts` (re-implements its subject against `pngjs`, so it proves nothing about shipped code), `langchain/sessions-publish.test.ts`, `web/**` tests. **There is no `langgraph/` any more** — any doc citing `research-agent-registry.test.ts` or `state.test.ts` is stale.

## Child DOX Index

| Doc | Owns |
|---|---|
| `web/AGENTS.md` | The web substrate: provider chain, query directives, reader chain, URL guard. Framework-free by construction |
| `pi/AGENTS.md` | The Pi runtime: model bootstrap, the one Ask loop, the six tool families, system prompt, `AgentEvent`→bridge, `PiDesktopAgent`. **Wired as the whole Ask path** |
| `mcp/AGENTS.md` | MCP client only: `mcp-config.json`-driven server addition, the shared connection every family filters over |
| `database/AGENTS.md` | sql.js persistence: migration recipe, trajectory/failure tables |
| `desktop/AGENTS.md` | Windows native substrate only: koffi/libwin32 calls, UIA facade, OCR, capture, pixel verifier |
| `document/AGENTS.md` | Document generation: five Pi tools over the writers, `~/Documents` sandbox, re-parse verification |
| `browser/AGENTS.md` | Playwright-MCP browser family: prefix filter, skills material, session lifecycle |
