# Qyther architecture reference

> **Status**: live — reconciled against the shipped Pi runtime on 2026-10-17; see docs/AGENTS.md

This is the deep-dive technical reference. The README stays shallow; everything here was re-counted or re-read from this checkout, with the commands listed in the final section. Citations are `path` plus symbol name — never a line number, because line numbers rot (docs/AGENTS.md rule 2). Anything not verified in code is explicitly marked as inference.

## What Qyther is

Qyther is a Windows desktop launcher and AI assistant in one Electron app: a single frameless, always-on-top window summoned with Alt+Space that acts as a fuzzy command-and-file palette (local file search via the Everything `es.exe` CLI) and expands into "Ask mode", a streaming chat driven by **one Pi `Agent` per turn** (`src/main/services/pi/ask-turn.ts`). There is no classifier and no router: the model itself decides what a turn touches by choosing a tool, and every tool is bound at once from six families — Windows GUI automation (32 tools), web search and page fetch, structured-UI generation, office-document generation (`docx`/`pptx`/`xlsx`), browser automation through the Playwright MCP server, and whatever else the configured MCP servers expose — with no confirmation gate: every desktop tool runs without asking, by deliberate product decision. All state is local; the only remote calls are the LLM endpoint, web search, the MCP children, and the `es.exe` download.

## What Qyther is not

| Claim | Verification in this checkout |
| --- | --- |
| Not cross-platform packaged | `package.json` scripts define only `build:win` and `build:win:dir`; there is no `build:mac` or `build:linux` script. `build.win.target` is `nsis` x64; the `build.mac` and `build.linux` keys are absent entirely. Some runtime code does branch for other platforms (`isMacOS()` guards `window-all-closed` in `src/main/main.ts`; the `globalShortcut` path in `src/main/shortcuts.ts` `registerGlobalShortcuts` is the macOS/Linux route), so "Windows-only" describes packaging, not every code path |
| Not a hosted service | No HTTP server framework and no listener in `src/`: greps for `createServer(`, `listen(` and `express` return nothing. The only socket bound at runtime is the development-only CDP port in `src/main/main.ts` (`remote-debugging-port`, set only when `NODE_ENV === 'development'`) |
| No telemetry | `grep -rniE "sentry\|posthog\|amplitude\|mixpanel\|analytics-node" src/` returns 0 hits. No analytics, no crash reporting, no beacon. Every outbound origin is listed under "External boundaries" |
| Not an MCP server | `grep -rn "McpServer\|StdioServerTransport" src/` returns hits only in `src/main/services/mcp/AGENTS.md` (the text of the ban), none in code. This repo is an MCP **client** only |
| Not a library | `package.json` `main` is `out/main/main.js`, an Electron entry point; there is no published module surface |

## Process topology and the security envelope

Three Electron contexts. There are **two** `BrowserWindow` constructions, not one: `src/main/windows.ts:94` (the palette, the only window the Alt+Space hook moves) and `src/main/settings-window.ts:31` (a separate, ordinary settings window opened by `settings:open` and the tray). The palette window is the one with the frameless/transparent/always-on-top geometry; the settings window is a normal top-level window and shares the same sandboxed preload.

| Context | Runs | Envelope |
| --- | --- | --- |
| Main | `src/main/main.ts` module scope, then `app.whenReady()` | `app.enableSandbox()` is called before `whenReady`, so the sandbox is on for every window created afterwards |
| Preload | `src/preload/preload.ts`, built to CJS (`formats: ['cjs']` in `electron.vite.config.ts`) and loaded as `../preload/preload.cjs` by `src/main/windows.ts` `createMainWindow` | Sandboxed, so it cannot import from `src/main`; `WindowMode` is re-declared locally for that reason. It exposes exactly one object, `electronAPI`, through `contextBridge.exposeInMainWorld` |
| Renderer | `src/renderer/main.tsx`, mounting `StrictMode` > `ErrorBoundary` > `ThemeProvider` > `TooltipProvider` > `App` | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` (all three set in the `webPreferences` literal inside `createMainWindow`). Reaches main only through `window.electronAPI` |

Window shape, from the `options` literal in `src/main/windows.ts` `createMainWindow`: `frame: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`, `minimizable: false`, `maximizable: false`, `hasShadow: false`, `roundedCorners: true`, `show: false` (shown on `ready-to-show` to avoid a flash). `resizable` is flipped to true only when `windowManager.setMode('expanded')` runs.

Navigation is locked down in `src/main/main.ts` inside the `app.on('web-contents-created')` block: `setWindowOpenHandler` returns `{ action: 'deny' }` for every request, and `will-navigate` calls `event.preventDefault()` unless the URL's origin is `http://localhost:5173` or the URL starts with `file://`. Any new dev port or origin has to be added there or the window will not load.

Dev-only relaxations, both env-gated and never enabled in production: the CDP port plus `remote-allow-origins: *` under `NODE_ENV === 'development'` (`src/main/main.ts`), and detached DevTools under `ELECTRON_VITE_DEV_MODE === 'true'` (`src/main/windows.ts` `ready-to-show` handler).

Diagrams, in `docs/diagrams/` (the `.mmd` files are the source of truth, the `.svg` files are renders):

- [`system-context.mmd`](diagrams/system-context.mmd) — process topology and every external boundary.
- [`ask-routing.mmd`](diagrams/ask-routing.mmd) — one Ask turn end to end: the pump and its `ActiveTurn`, `runAskTurn()`, the six bound families, `AskEventTranslator`'s six-variant bridge, the abort path — with the deleted graph machinery quarantined in a dashed group.
- [`desktop-hitl.mmd`](diagrams/desktop-hitl.mmd) — the desktop tools as shipped (32 never-throwing tools inside the one Ask loop, over the shared native runtime), plus the `PiDesktopAgent` verifier loop drawn as **unwired**. (The filename is historical: there is no HITL path any more.)

## Boot sequence

Order is a contract: IPC registration precedes window creation so the renderer can never invoke an unbound channel, and the window is created last. From `src/main/main.ts`, in the order the statements appear.

| Step | File and symbol | Failure behaviour |
| --- | --- | --- |
| Load `.env` before anything else | `src/main/main.ts`, the `import 'dotenv/config'` first line | Still required, but not for the reason this row used to give: the module-scope `ChatOpenAI` instances it named are gone with LangChain, and `src/main/services/pi/provider.ts` reads `MODEL` / `BASE_URL` / `API_KEY` **at the call site**, precisely because a module-scope read captured an empty `process.env` and stopped Ask mode from starting at all (`pi/provider.test.ts` pins that). The ordering still matters for everything else that reads env or preferences at import time |
| `__filename` / `__dirname` polyfill onto `globalThis` | `src/main/main.ts` | Fatal; native `bindings` lookups and the post-build `import.meta.dirname` patch both depend on it |
| `app.enableSandbox()` and the GPU/shader-cache command-line switches | `src/main/main.ts` module scope | Fatal |
| `createLogger('App')`, `logSystemInfo()` | `src/main/utils/platform.ts` `logSystemInfo` | Non-fatal, logging only |
| Env presence check for `API_KEY`, `BASE_URL`, `MODEL` | `src/main/main.ts`, inside `app.whenReady()` | Warn only; ask-mode degrades to the error string from `src/main/services/langchain/agent.ts` |
| `initializePreferences()` | `src/main/preferences.ts` | Not wrapped — a throw here escapes `whenReady` and is swallowed by the `uncaughtException` handler, leaving the app half-initialised |
| `initializeDatabaseManager()` then `dbManager.stats()` | `src/main/services/database/database-manager.ts` | Wrapped; degrades to `log.warn` and the app runs with no agent memory |
| `initializeEs()` (guarded by `isWindows()`) | `src/main/utils/esDownloader.ts` | Not wrapped in try/catch; reports failure by returning false, which the caller logs as a warning. File search is simply unavailable |
| `mcpService.initializeWithRetry()` | `src/main/services/mcp/client.ts` | Wrapped; after 3 attempts it warns and Ask mode runs with zero MCP and browser tools, silently |
| `Menu.setApplicationMenu(null)` | `src/main/main.ts` | Fatal |
| `registerIPCHandlers()` | `src/main/ipc/handlers.ts`, which calls `registerChatHandlers()` and `registerMCPHandlers()` | Fatal; `ipcMain.handle` throws on a duplicate channel |
| `registerApiConfigHandlers()` | `src/main/ipc/api-config.ts` | Fatal |
| `registerBrowserHandlers()` | `src/main/ipc/browser-handlers.ts` | Fatal |
| nothing pre-compiles the agent | `src/main/main.ts` | The boot path used to fire-and-forget `getAskGraph()` to pay the graph compile. There is no graph, so there is nothing to warm: `runAskTurn()` builds its `Agent` per turn from `buildAskToolboxes()`, and the only expensive construction — the UIA facade plus the tesseract worker behind `getDesktopToolbox()` — is lazy and stays off boot. |
| `execSync('npx playwright install chromium')` | `src/main/main.ts` | Wrapped; warns and defers to first use. This is the single largest cold-start offender and the only synchronous blocking call on the boot path |
| `registerGlobalShortcuts()` | `src/main/shortcuts.ts` | Fatal; the koffi hook plus `globalShortcut` registration |
| `createTray()` | `src/main/tray.ts` | Fatal |
| `createMainWindow()` | `src/main/windows.ts` | Fatal; last step |

Teardown is a real quit, not a log line. `will-quit` in `src/main/main.ts` calls `event.preventDefault()`, runs the ordered `buildShutdownSteps()` list through `createShutdown()` (`src/main/lifecycle.ts`), and only then `app.exit(0)` — because Electron does not wait on a handler's promises, so the previous handler returned while every disposer was still in flight. `lifecycle.ts` runs the steps sequentially in array order, bounds each at `SHUTDOWN_STEP_DEADLINE_MS` (2 s) so one wedged disposer cannot strand the rest, never rejects, and memoises `run()` so a second `will-quit` joins the run instead of double-disposing. The order: `global-shortcuts` (`unregisterGlobalShortcuts()`, which releases the koffi hook and its 10 ms message-pump interval — if they are not released, the process lingers, which is why this is first) → `tray` → `settings-window` → `browser-agent` (`langChainAgent.cleanupBrowserAgent()`, also the browser subtree's release path) → `mcp` (`mcpService.cleanup()`, the owner of the shared Playwright child) → `pi-desktop-agent` (`closePiDesktopAgent()`, which calls `disposeDesktopRuntime()` unconditionally, so the UIA facade and tesseract worker are released even though the agent singleton was never built) → `ipc-handlers` (removing the bridges only after everything that may still notify the renderer has gone) → `database` (`getDatabaseManager().close()`, last, so its flush captures anything written during teardown). There is no `browserMemory.close()` step: `browser/browser-memory.ts` was deleted along with the graph nodes that wrote to it. `SHUTDOWN_STEP_DEADLINE_MS` is a ceiling on a *stuck* disposer, not a budget for a slow one; the common case is single-digit milliseconds.

The window hides rather than closes: the `close` handler in `src/main/windows.ts` calls `preventDefault()` and hides, and both `hideMainWindow` and the close path emit `window:will-hide` **before** hiding so the renderer can park focus. There is no `requestSingleInstanceLock` and no second-instance handler anywhere in `src/` (0 grep hits), and no blur-to-hide.

## The IPC surface

There is no shared schema and no codegen. Every channel is four hand-synced edits, and the compiler will not catch a missing one:

1. the channel string in `src/preload/preload.ts` (inside the `electronAPI` object literal),
2. the `ipcMain.handle` registration in one of `src/main/ipc/*`,
3. a call site in the renderer through `window.electronAPI`,
4. the type, which flows automatically as `typeof electronAPI` re-exported into `src/renderer/types/electron.d.ts`.

Do not extend `src/renderer/types.d.ts` or `src/preload/types.d.ts` — both are stale hand-maintained duplicates.

Derived counts for this checkout:

| Measure | Count | How derived |
| --- | --- | --- |
| `ipcMain.handle` channels, unique | 62 | grep and `sort -u` over `src/main` |
| — in `src/main/ipc/handlers.ts` | 25 | `grep -c "ipcMain.handle("` |
| — in `src/main/ipc/chat-handlers.ts` `registerChatHandlers` | 11 | same |
| — in `src/main/ipc/mcp-handlers.ts` `registerMCPHandlers` | 10 | same |
| — in `src/main/ipc/browser-handlers.ts` `registerBrowserHandlers` | 9 | same |
| — in `src/main/ipc/api-config.ts` `registerApiConfigHandlers` | 4 | same |
| — in `src/main/ipc/settings-handlers.ts` | 3 | same |
| `ipcRenderer.invoke` channels in preload | 58 | grep and `sort -u` over `src/preload` |
| `ipcRenderer.on` push channels in preload | 14 | same |
| distinct main→renderer send channels | 13 | the **union** grep of both send forms in `src/main` (`grep -rhoE "\.send\(\s*'[^']+'|[^a-zA-Z_.]send\(\s*'[^']+'" … | sort -u`), not the literal `\.send\(` form — that one returns 9 because the four per-turn pushes (`chat:stream-chunk`, `chat:thinking-step`, `chat:agent-change`, `chat:turn-started`) go through the `send` closure `beginTurn` returns, so a literal grep silently misses every chat push |
| `ipcMain.on` receivers | 1 | `window:animationFrame` (`src/main/ipc/handlers.ts`) is the only one, and it is a fire-and-forget frame signal, not a request. Everything else is `handle`/`invoke` |
| Namespaces in use | 13 | `app` `window` `command` `url` `file` `apps` `dialog` `debug` `chat` `mcp` `browser` `api-config` `settings` |

Invoke distribution across those 58: `chat` 11, `app` 8, `browser` 8, `window` 7, `mcp` 7, `file` 4, `api-config` 4, `settings` 3, `dialog` 2, `url` 1, `debug` 1, `command` 1, `apps` 1.

Naming convention is `namespace:camelCaseVerb`, with two known three-segment exceptions: `file:everything:status` (`src/main/ipc/handlers.ts`) and `desktop:screenshot:capture` (`src/preload/preload.ts`).

Pull versus push. Pull channels return a value or reject. Push channels are one-directional from main: `src/main/windows.ts` sends `window:shown`, `window:will-hide` and `window:modeChanged`; the preload subscribes once at module scope and re-dispatches each as a DOM `CustomEvent` (`electron-window-shown` and friends), which is what `src/renderer/hooks/useWindowMode.ts` listens for. The streaming channels bind inside `electronAPI` closures instead and are consumed by `src/renderer/hooks/useChatSession.ts`. Every `onXxx(cb)` returns an `removeListener` unsubscribe and the caller must store and return it — a `useEffect` that subscribes without a cleanup leaks one listener per StrictMode double-mount.

### Documented bridge drift

These are half-wired bridges, not absent features. Do not delete the surviving half.

| Drift | Detail |
| --- | --- |
| Handlers registered but unreachable from the renderer (4) | `browser:initialize`, `browser:executeTask`, `browser:cleanup` (all in `src/main/ipc/browser-handlers.ts` `registerBrowserHandlers`) and `mcp:initialize` (`src/main/ipc/mcp-handlers.ts` `registerMCPHandlers`). `src/preload/preload.ts` invokes `browser:initializeAgent` instead, a different channel, which shadows `browser:initialize` |
| Preload listeners with no sender in main (1) | `desktop:screenshot:capture` |
| Preload sends with no receiver (2) | `desktop:screenshot:result` and `desktop:screenshot:error`. There is exactly one `ipcMain.on` registration repo-wide (`window:animationFrame`, `src/main/ipc/handlers.ts`) and it is neither of these, so the whole screenshot round-trip is dead at both ends |
| Senders with no listener | none |
| Invokes with no handler | none — 58 invokes all resolve |
| Cross-namespace registration | `browser:initializeAgent` and `browser:getStatus` are registered by `registerMCPHandlers`, not by `registerBrowserHandlers`. Grep `ipcMain.handle` across all six registering files (`handlers`, `chat-handlers`, `mcp-handlers`, `browser-handlers`, `api-config`, `settings-handlers`) before assuming where a channel lives |

Three error idioms coexist and a new handler must pick one deliberately: a result envelope `{ success, output?, error? }` with the throw swallowed into a log (`command:execute`, `url:open`, `file:open` in `src/main/ipc/handlers.ts`); a re-throw that crosses IPC and rejects the renderer promise (`window:setMode`, `file:search`, `browser:executeTask`); or a swallowed failure returning a fallback value — only `window:getHeight` still does this, returning `600`. `window:getMode` and `window:toggleMode` used to return `'compact'` on a thrown error and now re-throw: a fabricated mode is not a neutral default, because the renderer lays the palette out for whatever it is told, so the old fallback made an ordinary read indistinguishable from a real compact window. `dialog:openFile`/`openFolder` are a fourth, deliberate shape — `{ path }` on success, `{ cancelled: true }` when the user dismissed it, `{ error }` when the call threw, which used to be reported as a cancel.

## The agent runtime

**There is no graph.** The LangGraph stack — `src/main/services/langgraph/**` (including its own `AGENTS.md`), `browser/browser-subgraph.ts`, `document/document-subgraph.ts`, `document/document-delegation.ts`, the planner/verifier/recovery/memory modules, the intent classifier and all four `@langchain/*` packages — was deleted at the Pi cutover. Nothing in `src/` imports any of it; `grep -rn "NODE_AGENT_MAP\|ASK_GRAPH_NODES\|MemorySaver\|streamEvents(" src --include="*.ts"` returns only comments explaining what was replaced. Any doc describing `AskGraph`, `.addNode`, `node-registry.ts`, `clearGraphCache()` or "22 nodes across three graphs" is describing files that do not exist.

**One turn, one loop.** `src/main/ipc/chat-handlers.ts` calls `runAskTurn()` (`src/main/services/pi/ask-turn.ts`) once per `chat:sendStreamMessage`, and that function builds a fresh Pi `Agent` (`@earendil-works/pi-agent-core`) over every tool family at once: `systemPrompt`, `model`, `tools`, `thinkingLevel: "off"`, `toolExecution: "sequential"`, the memoised `streamFn`, the session id. **The model routes by choosing a tool.** There is no classifier, no fast-path regex table, no `intent/complexity` string to parse and no hand-off between agents — the routing that used to be `classifyNode` + `routerModel.invoke` + `routeAfterClassify` is the model's own tool selection, and `pi/families.ts` turns that choice into the label the renderer shows.

| Family | Assembled by | Tools |
| --- | --- | --- |
| `desktop` | `pi/toolbox.ts` via `agent.ts:getDesktopToolbox()` | 32 TypeBox `AgentTool`s, name list frozen by `pi/toolbox.test.ts` |
| `web` | `pi/tools/web-tools.ts` | 2 — `search_web`, `fetch_page` |
| `ui` | `pi/tools/ui-tools.ts` | 5 — `create_table`, `create_form`, `create_comparison`, `create_list`, `create_chart` |
| `document` | `pi/tools/document-tools.ts` | 5 — `create_docx`, `create_pptx`, `create_xlsx`, `read_document`, `modify_document` |
| `browser` | `pi/tools/browser-tools.ts` | a `browser_`-prefix **filter** over the one shared MCP connection, not a wrapper; no tool count is declared in this repo and none should be |
| `mcp` | `pi/tools/mcp-tools.ts` | the same connection's non-`browser_` tools; `[]` when unconfigured |

`pi/ask-tools.ts:buildAskToolboxes()` is the single assembly point — the role the deleted node registry used to play — and `buildFamilyIndex()` **throws if two families claim one tool name**, because Pi resolves a call by name and a duplicate silently makes one family unreachable. That is why `browser` and `mcp` filter the same list by disjoint prefixes. `pi/families.ts` maps tool name → family → UI agent label through `AGENT_LABEL_BY_FAMILY`, with `IDLE_AGENT_LABEL = "General"` shown before the first tool runs; `ui`, `web` and `mcp` all render as `Research` because the renderer's label set is closed and has no sixth member.

**`toolExecution: "sequential"` is load-bearing, not a preference.** The step string the renderer folds completions onto is the tool name, so two concurrent calls of the same tool would fold onto each other and leave a spinner that never resolves; and these are screen, disk and network actions a user expects to see happen in order.

**Two timeouts, different scopes.** `ASK_PUMP_TIMEOUT_MS` (120 s) is the IPC pump's own patience, owned in `chat-handlers.ts`; `ASK_RUN_TIMEOUT_MS` (10 min) is the whole-turn budget inside `runAskTurn`, wrapped by `withTimeout` (`pi/abort.ts`). `HISTORY_TURNS = 10` bounds how much transcript is replayed. An empty family is a valid state, not a bug: each builder degrades to `[]` when its substrate is missing, and `buildAskSystemPrompt` advertises only non-empty families so the model is never offered a capability with no tools behind it.

Streaming contract, implemented in `src/main/ipc/chat-handlers.ts` inside `registerChatHandlers`.

- One pump: `chat:sendStreamMessage` awaits `runAskTurn()` and feeds its events to a translator. `chat:sendMessage` and the HITL `chat:resumeGraph` pump were both deleted. The thread id is still per-turn, `${sessionId}:turn-${Date.now()}`, because the renderer echoes it back on `chat:cancelTurn` — not because anything checkpoints; there is no `MemorySaver` and no state to resume.
- `pi/ask-events.ts:AskEventTranslator` is the whole demux. It takes Pi's typed `AgentEvent` union and emits the six-variant `AskStreamEvent`: `token`, `agent`, `step-start`, `step-complete`, `ui-payload`, `sources`. Because it switches on a discriminated union, a new event arm is a compile error rather than a silent drop — which is precisely the failure class the deleted `metadata.langgraph_node` + `RESPONSE_NODE_SET` string routing produced.
- **The step vocabulary is derived, never mirrored.** `step` is the tool name verbatim; `label` comes from `FamilyIndex.displayLabelFor()`, which reads the human `label` each tool already declares in its own toolbox, and `family` comes from `familyOf()`. The renderer's `ThinkingSteps.tsx` renders `step.label ?? step.step` and folds a completion onto the still-open row by name (`foldSteps`). Adding a name→copy map on either side of the bridge is gated: `families.test.ts` reads both source files and fails if one returns. The deleted predecessors of this rule were `STEP_NAME_BY_TOOL` in main (five names mapped onto graph-node strings, 39 tools left showing `snake_case`) and `PHASE_LABELS`/`LOADING_MESSAGES`/`PHASE_ORDER` in the renderer.
- Agent labels arrive as `{ kind: "agent" }` on the first tool of a turn, deduped by change in the translator so the pump forwards blindly; `ui`/`web`/`mcp` all surface as `Research`.
- Push channels: `chat:stream-chunk` for tokens, `chat:thinking-step` for steps, `chat:agent-change` for the pill. Every push from one turn shares a monotonic `seq` stamped by `beginTurn()`, so the renderer can order events and drop replays instead of inferring position from "the last message if it is the assistant and still streaming". The final chunk carries `uiPayloads`, `sources` and `metrics`, and `metrics` carries only `{ durationMs, model }` — the turn's wall clock and the configured model are measurements; a token count derived from `response.length / 4` and a price from a hard-coded constant were not, and they are gone.
- Structured output no longer goes through a schema-to-JSON round trip. Each `ui` tool's TypeBox `parameters` **are** the contract, and the tool builds `details.uiPayload` from the validated args itself, so a payload cannot be valid to the model and malformed to the renderer. The renderer mirrors it as the five-member union in `src/renderer/components/ask-mode/GenerativeUI/index.tsx` (`table`, `form`, `comparison`, `list`, `chart`) with a JSON fallback branch for unknown types.
- Each completed turn is written to the trajectory tables: `pi/turn-record.ts:buildTurnRecord()` maps the pump's accumulated step rows plus its two timestamp maps onto a `TrajectoryRecord`, and `chat-handlers.ts` calls it on all three in-try exits (completion, timeout, user Stop), never awaited. Completed rows are kept **per occurrence** — "it searched three times" is the signal an evaluation needs — unlike the renderer, which folds them.

No human-in-the-loop path exists. There used to be one — a node called `interrupt()`, `chat-handlers.ts` pushed `desktop:confirmation-request`, and the renderer answered through `chat:resumeGraph` — but the whole round trip has been removed as a deliberate product decision: no `interrupt()` call remains anywhere, both IPC channels are deleted, `src/shared/ipc/hitl-decision.ts` is deleted, and no graph state is left to hold a pending confirmation. Every desktop tool runs without asking.

Cancellation is one controller, owned by the pump. `beginTurn()` registers an `ActiveTurn { controller, cancelledByUser, seq }` in `activeTurns` keyed by the per-turn thread id, and `chat:cancelTurn {threadId}` aborts it; the same controller aborts the pump's 120 s timeout. Its `signal` is passed into `runAskTurn`, which attaches an `abort` listener calling `agent.abort()`, wraps the prompt in `withAbort(withTimeout(agent.prompt(…), ASK_RUN_TIMEOUT_MS), signal)` (`pi/abort.ts`), and treats a settled abort as an expected outcome rather than a failure — it returns `{ aborted: true }`, it does not throw, and it removes the listener and unsubscribes in `finally`. This is the shape that closed the 2026-10-15 hang, where a 3-step task left main at 0% CPU on a promise that never resolved; `cancel.test.ts` imports the production `withAbort` so the gate cannot pass against a mirror of itself. The three exits the pump distinguishes are a user Stop (turn ends as completed for the transcript, recorded as a failure in the trajectory table), a timeout (an error the user should retry), and normal completion.

There is no delegation between agents, because there is only one agent. `AskState`, its `crossAgentContext` append reducer and `document/document-delegation.ts` are deleted; the document family's `delegateToBrowser`/`delegateToDesktop` nodes went with the subgraph. What remains is a single loop that can reach any family in one turn, in the order the model asks for it. `PiDesktopAgent` (`pi/agent.ts`) is a **separate, second** Pi loop with its own initial-screenshot decision and pixel-verifier `steer()` hook — and today nothing calls it: `runPiDesktopTask()` and `abortPiDesktopRun()` have zero production callers, the only production import of `pi/agent.ts` is `ask-tools.ts` taking `getDesktopToolbox()` and `main.ts`'s quit step taking `closePiDesktopAgent()`. Ask mode therefore runs desktop automation through the same 32 tools in the same loop, without the verifier feedback that class provides. The shared native substrate is still released correctly: `closePiDesktopAgent()` calls `disposeDesktopRuntime()` unconditionally, not only when the singleton was ever built, so the UIA facade and the tesseract worker cannot outlive the turn that opened them.

## The desktop capability

Registry truth: **32 tools**, all TypeBox `AgentTool`s in `src/main/services/pi/toolbox.ts`, and the list is frozen by `src/main/services/pi/toolbox.test.ts`, which asserts the toolbox exposes exactly those 32 names. Any doc saying 26 or 28 is stale. They were zod `tool()` factories in `src/main/services/desktop/desktop-tools.ts` until the Pi cutover deleted that file.

The 32 names: `click`, `click_element`, `clipboard`, `close_window`, `double_click`, `drag`, `execute_command`, `file_operations`, `focus_window`, `get_element_info`, `get_element_text`, `get_screen_text`, `get_selected_text`, `get_window_info`, `get_window_list`, `hold_key`, `hover`, `invoke_element`, `key_combo`, `launch_app`, `maximize_window`, `minimize_window`, `move_mouse`, `navigate_to_path`, `restore_window`, `right_click`, `screenshot`, `scroll`, `search_elements`, `set_element_value`, `type_text`, `wait`.

Adding one tool requires four coupled edits, and only one of them is mechanically checked.

| # | Edit | File and symbol | Consequence if skipped |
| --- | --- | --- | --- |
| 1 | `AgentTool` factory with its TypeBox `parameters` schema inline | `src/main/services/pi/toolbox.ts` | the tool does not exist |
| 2 | add the name to the frozen list | `src/main/services/pi/toolbox.test.ts` | `toolbox.test.ts` fails — this is the one mechanical guard |
| 3 | report a real `details.status` (and `details.verifies: true` only if it should run the pixel verifier) | the tool's `execute` | the UI reports `capturing` forever, silently |
| 4 | add a guidance line to the system prompt | `src/main/services/pi/prompt.ts` | the model never prefers it over a screenshot |

There is no danger policy and no status-inference map any more. `DANGER_POLICY` (29 `safe`, 2 `reviewable`, 1 `dangerous`) and `inferStatusFromTool` both died with `desktop-agent.ts`, and **neither is replaced**. Every tool reports its own `details.status`, so the exhaustiveness check that used to guard the policy map is unnecessary — a tool cannot forget its own flag. Nothing pauses for approval: that gate was removed by decision, so `execute_command` still runs arbitrary PowerShell with no prompt and no allowlist.

`file_operations` (seven enum actions: `list_directory`, `read_file`, `write_file`, `copy_file`, `move_file`, `delete_file`, `file_exists`) carries no per-action danger override any more.

One verifier, automatic.

| Verifier | File | When it runs | Gate |
| --- | --- | --- | --- |
| `GroundTruthVerifier` | `src/main/services/desktop/verifier.ts` | after any tool whose result sets `details.verifies` — `close_window` is the only one today | pixel-diff thresholds `PIXEL_DIFF_THRESHOLD` 0.01 and `ACTION_EFFECT_MIN_DIFF` 0.02; the verdict is fed back with `agent.steer()` on hard-reject or a score below 0.5 |

The 912-line NL-postcondition `desktop-verifier.ts`, the `verifier` node it ran in, the recovery ladder in `desktop-recovery.ts` (`MAX_RETRIES = 2`, `shouldRetry`, `replan`) and the trajectory memory in `desktop-memory.ts` were all deleted at the Pi cutover; Pi has no equivalent. The browser subtree still **declares** a five-strategy recovery union (`retry`, `alternative`, `replan`, `skip`, `abort` in `src/main/services/browser/types.ts`) — but nothing consumes it: no code produces a `BrowserRecoveryAction`, no branch reads one, and there is no abort-at-three ladder. It is a type left behind by the deleted `browser-recovery.ts`, so drawing or citing it as a running recovery loop is wrong; it is deletion-candidate debt, not a mechanism.

Native backend families — four mechanisms, and the accessibility one is often mis-documented.

| Family | File and symbol | Detail |
| --- | --- | --- |
| koffi FFI | `src/main/services/desktop/input-simulation.ts` | loads `user32.dll` and `shell32.dll` through `koffi.load`; 44 exported functions covering SendInput, cursor and window APIs, DPI helpers, `blockInput`, and elevation/protection probes |
| libwin32 | same file, the `libwin32/user32` and `libwin32/advapi32` imports | used only for `GetWindowThreadProcessId` and token elevation; DPI and input-blocking are koffi-only |
| UIA via COM | `src/main/services/desktop/uia-native.ts` (`require('node-winautomation')`) behind the `AccessibilityTreeAdapter` facade in `accessibility-tree.ts` | **native COM, not PowerShell UIA.** The old PowerShell path (`uia-wrapper.ts`) has been deleted. The adapter logs that it initialised natively with no PowerShell |
| Screen capture and OCR | `screenshot-capture.ts` (`electron.desktopCapturer.getSources`) and `windows-adapter.ts` (`tesseract.js` `createWorker`) | capture falls back to a PowerShell `System.Drawing` script on failure or when zero sources return, once plus one retry; OCR backs the screenshot-fallback verifier score |

`DesktopAdapter` in `src/main/services/desktop/types.ts` is the seam between tools and Win32, with `WindowsDesktopAdapter` as its only implementation. Counted from the interface body it declares **18** members: 17 tool-facing methods plus the optional `cleanup?()`, which `PiDesktopAgent.dispose()` calls on quit to terminate the tesseract worker and release the input-simulation FFI state. `cleanup` is optional precisely so a stub adapter in `toolbox.test.ts` need only implement the 17.

Two handle tables are the agent's only working memory and both are process-local integers: `hWndMap` in `input-simulation.ts` (rendered to the model as `[N] "title"` by `get_window_list` and re-resolved by every window tool) and `elementHandleMap` in `uia-native.ts`. Stale handles fail with an explicit "may be invalid or the window may no longer exist" string, so the model must re-list after any UI change. Coordinates are clamped to the primary `workArea` in `windows-adapter.ts`, not to the full screen. `execute_command` runs arbitrary strings through `exec` with `shell: 'powershell.exe'` and a 30 s default timeout, with no allowlist and no confirmation prompt.

## Persistence and local state

| Store | Path | Engine and contents |
| --- | --- | --- |
| Agent memory | `desktop-agent.db` under `app.getPath('userData')`, set in `src/main/services/database/database-manager.ts` `initializeDatabaseManager` | **`sql.js`** (pure-JS WASM SQLite, imported as `initSqlJs`/`Database`). Four tables from four migrations in `schema.ts` (`MIGRATIONS`): `desktop_trajectories`, `desktop_trajectory_steps`, `desktop_failures`, `migrations` |
| Applied-migration ledger | same file | the `migrations` table is what `runMigrations` reads back to make relaunches idempotent. `SCHEMA_VERSION` is `1` despite four migrations and is log-only — never compared, so deleting ledger rows re-runs migrations against a live file |
| Write model | `persistToDisk` in `database-manager.ts` | the whole database is serialised and `fs.writeFileSync`-ed on every write. There is no WAL; a crash mid-write can lose the last write, which is why trajectory writes are batched per task |
| Browser memory | — | **Deleted.** `src/main/services/browser/browser-memory.ts` and its separate `browser-memory/trajectories.db` are gone, with the `memoryRetrieve`/`memoryStore` graph nodes that were its only writers and the `browserMemory.close()` shutdown step that released it. `ls src/main/services/browser/` returns `browser-session-manager.ts`, `browser-skill-loader.ts`, `skills/`, `stateful-browser-agent.ts`, `types.ts` and `AGENTS.md` — no store |
| App preferences | `preferences.json` under userData, `src/main/preferences.ts` | `windowMode`, `customDimensions`, `lastPosition`, `llm`, `mcp`. The merge is a shallow spread, so `savePreferences({ llm })` replaces the entire `llm` object. `resetPreferences` is exported and called by nothing |
| API config | `api-config.json` under userData, `src/main/ipc/api-config.ts` | the `api-config:*` save/load/delete/test surface |
| `es.exe` | userData, `src/main/utils/esDownloader.ts` | downloaded zip extracted there, not a system install |
| Generated documents | `~/Documents` only, `getDocumentsFolder()` in `src/main/services/document/document-executor.ts` | there is no user-chosen destination and no other write root |

Chat history is **not** persisted. Sessions live in the `sessions: Map` inside `src/main/services/langchain/agent.ts` and die with the process. That file is no longer an agent — the graph and the ReAct half were deleted at the Pi cutover and what survives (364 lines) is the session store, the `isReady()` probe that reports `isPiConfigured()` through `chat:initialize`, and the browser-session owner the `browser-agent` quit step disposes. The episodic tables are the one thing that does persist from a turn: `pi/turn-record.ts` builds a `TrajectoryRecord` and `chat-handlers.ts` writes it through `saveTrajectory()` once per completed Ask turn. `desktop_failures` still has **zero production writers** — `DatabaseManager.recordFailure()` exists and is queried by `getFailureStats()`/`getRecentFailures()`, but nothing calls it; per-tool failures are only visible as `success = 0` rows inside a trajectory's steps. The database doc's statement is still the correct one for the *schema's* purpose: chat itself is in-memory.

## External boundaries

| Boundary | Code | Contract |
| --- | --- | --- |
| LLM endpoint | `src/main/services/pi/provider.ts` (one `Provider<"openai-completions">` with id `"qyther"`, plus the memoised `streamFn`) and `pi/ask-turn.ts`, which builds the `Agent` per turn | any OpenAI-compatible Chat-Completions endpoint. **Three** env vars — `MODEL` (default `qwen3.6-plus`), `API_KEY`, `BASE_URL` — and they are read **at the call site**, never captured at module import: a module-scope read made Ask mode render its not-configured card on a correctly configured machine, because the bundled main graph evaluates `provider.ts` independently of `main.ts`'s `import 'dotenv/config'`, and `provider.test.ts` now pins the late-populate case. There is no `FAST_MODEL` any more (`grep -rn FAST_MODEL src` is empty) and no second classifier model to route to, because routing is the model choosing a tool. Web search reads its own per-provider keys under `src/main/services/web/search/`. `isPiConfigured()` is `apiKey() && baseUrl()`; without it `runAskTurn()` throws `AskNotConfiguredError` before any network call and the pump maps that to the renderer's not-configured envelope — there is no mock or offline path |
| MCP servers | `src/main/services/mcp/client.ts` `MCPService`, config `mcp-config.json` at repo root | client only, over `@earendil-works/pi-mcp` (the `@langchain/mcp-adapters` dependency is gone), tool schemas declared with `Type` from `@earendil-works/pi-ai`, `MCP_TOOL_TIMEOUT_MS` = 30 s. The example file declares `filesystem`, `sequential-thinking`, `notion` and `github` plus a commented HTTP example; the gitignored live `mcp-config.json` on this machine declares `filesystem`, `sequential-thinking` and `playwright`, and the browser family is only reachable when a `playwright` server is configured. Loading is gated on `prefs.mcp.enabled`; a missing or unparseable config degrades to zero servers with a warning, never a crash |
| Web search and page fetch | `src/main/services/web/` — `searchWeb`, `fetchWebPage`, `checkFetchUrl` | Sequential provider chain in registry order (`exa` -> `parallel` -> `searxng` -> `marginalia` -> `duckduckgo` -> `tavily` -> `brave`), first usable response wins, failures returned as model-facing notes rather than thrown. **Five of the seven need no API key at all**: two keyless MCP endpoints (`mcp.exa.ai/mcp`, SSE-framed; `search.parallel.ai/mcp`, double-encoded payload), a bounded rotating pool of public SearXNG instances, the Marginalia small-web index, and the DuckDuckGo HTML endpoint. Every keyless engine rate-limits by IP (measured: 0 of 71 SearXNG instances served JSON to a cloud IP, DuckDuckGo bans and unbans on its own), so the chain is a best-effort ladder rather than redundancy. Measured live 2026-10-15. Google-style query directives (`site:`, `-site:`, `after:`/`before:`, `filetype:`, quoted phrases) are parsed once, re-emitted per engine dialect, and re-applied as a lenient post-filter that relaxes a constraint matching nothing. Fetch: `<url>.md` sibling, markdown content negotiation, reader chain (local extractor, then `r.jina.ai`) behind a quality gate, 500k hard cap plus a caller budget. Every URL passes `checkFetchUrl` (http/https only, no credentials, loopback/private/link-local/metadata blocked) **twice** — once on the string, once after redirects. Consumed by the `web` tool family (`src/main/services/pi/tools/web-tools.ts` — `search_web`, `fetch_page`) and nothing else; the old consumer, `langgraph/tools.ts`, is deleted |
| Local file index | `src/main/utils/esDownloader.ts` and `esRunner.ts` | `es.exe` is fetched from the GitHub releases API for `voidtools/ES` and unzipped into userData; searches shell out to it |
| Browser | `src/main/services/browser/stateful-browser-agent.ts` | Chromium is driven **only** through the Playwright MCP stdio child (headless, `--caps=vision`), selected by a `browser_` name-prefix filter. No browser tool count is declared in this repo and none should be written into code or docs |
| Operating system | the desktop subtree above | Win32 via koffi/libwin32, UIA via `node-winautomation` COM, capture via Electron `desktopCapturer`, OCR via `tesseract.js`, plus a PowerShell `System.Drawing` capture fallback |

## Cross-cutting traps

| Trap | Where | Effect |
| --- | --- | --- |
| An unregistered logger subsystem lost its `info` and `debug` lines in production | `SUBSYSTEM_ENV_VARS` in `src/main/utils/logger.ts` | **Closed, and gated both ways.** Every `createLogger('<Name>')` call site in `src/main` (33 names, re-derived by scanning the tree) has a registry entry, and `logger.test.ts` fails on either drift: an unregistered name, or a registry entry whose subsystem is gone. One caveat the gate cannot see: it scans raw text, so `Graph: 'LOG_GRAPH'` survives only because `logger.ts`'s own doc-comment still contains `createLogger('Graph')` — the graph it named is deleted |
| A new tool that no family binds, or that two families both bind, is unreachable | `pi/families.ts:buildFamilyIndex()` and `pi/ask-tools.ts:buildAskToolboxes()` | the graph-era version of this trap was a node with no `ASK_GRAPH_NODES` row: no tokens, no agent change, no error. `buildFamilyIndex` now **throws** on a duplicate tool name (Pi resolves a call by name, so a duplicate silently makes one family unreachable), and `families.test.ts` fails if a label the map can emit is not one `AgentIndicator.tsx` renders, or if a name→copy map returns on either side of the step bridge |
| A module-scope `process.env` read silently disables a feature | `pi/provider.ts`, pinned by `pi/provider.test.ts` | **This shipped.** `provider.ts` used to capture `API_KEY`, `BASE_URL` and `MODEL` into module-level `const`s, and because the bundled main graph evaluates that module independently of `main.ts`'s `import 'dotenv/config'`, Ask mode rendered its not-configured card on a correctly configured machine — with the card telling the user to restart, which could not help because the capture recurred every boot. Env is now read at the point of use. There is no `FAST_MODEL` and no second classifier model, so the old default-drift trap (`qwen3.5-plus` vs `qwen3.6-plus` across four files) has one value left: `MODEL`, defaulting to `qwen3.6-plus` |
| Runtime prompt material is not packaged | the copy step in `electron.vite.config.ts` and `build.files` in `package.json` | the build copies only `sql-wasm.wasm` and `Automation.node` into `out/main`, and packages `out/**/*` plus `package.json`. `src/main/services/browser/skills/` holds six `SKILL.md` directories that no copy step touches — verified empirically: `out/main/` in this checkout contains the wasm but no `skills` directory. `browser-skill-loader.ts` resolves `skills` next to the bundle, so a production build logs "Skills directory not found" and runs with zero skills; skills are observable only under `npm run dev`. Same reasoning applied to `mcp-config.json`: it sits at the repo root, is resolved from `PROJECT_ROOT` in `client.ts`, and is not in `build.files` — inference, not an observed production run, that a packaged build therefore starts with no MCP servers |
| Generated documents overwrite each other | `uniqueFilePath` in `src/main/services/document/document-executor.ts` | the first `try` block contains only comments and an unconditional `break`, so the `while (true)` exits on iteration one and the `statSync` plus `_N` renaming branch below it never runs. Asking twice for the same title replaces the first file |
| `contentSpec` has no schema behind it | `document-executor.ts`, reached by `pi/tools/document-tools.ts` | the five document tools declare real TypeBox parameters, but `contentSpec` itself is passed through as a free-form record and the three writers read it through raw `as` casts (`sections`, `slides`, `sheets`), so a malformed spec is a runtime failure, not a rejected tool call. The old form of this row named `services/document/document-tools.ts` as "aspirational with zero importers"; that file is deleted and the family lives in `pi/tools/` |
| `stepTimeout` is declared and never read | `stateful-browser-agent.ts` and `browser-session-manager.ts` | there is no 30 s per-step limit; the effective timeout is the Playwright MCP env value |
| Two independent Chromium paths, one loop each | `browser:executeTask` in `src/main/ipc/browser-handlers.ts` vs the `browser` family in `pi/tools/browser-tools.ts` | Ask mode drives Playwright MCP tools inside its own `Agent` turn, filtered by the `browser_` prefix; `browser:executeTask` runs `statefulBrowserAgent`, a separate ReAct-style executor with its own per-call skill slot and its own session manager. They share the MCP connection but not the loop, the cancellation owner or the transcript, so a turn that mixes them has two authorities over one browser |
| Three deleted detectors | `ui-detector.ts` in `desktop/`, `document/` and `browser/` (all three had zero importers), plus `services/document/document-tools.ts` and the whole `langgraph/` folder | **deleted**, along with `mockAskData.ts`, which is unreferenced but still committed. A doc naming any of the first group as current is describing a file that does not exist |

## Known gaps and honest limits

**Validation is split between the two layers, and three rules are shared modules.** `validateUrl` and `validatePath` exist only as local functions inside `src/main/ipc/handlers.test.ts` — they are not in `handlers.ts` or `preload.ts`, and a same-named `validateUrl` in `src/renderer/utils/citationFormatter.ts` is an unrelated renderer helper, not a bridge guard. Everything else that actually gates an IPC argument lives in its own Electron-free, production-imported module: `isCommandSafe` (`src/main/ipc/command-guard.ts`, called by the `command:execute` handler), `checkBaseUrl` (`src/main/ipc/api-config-guard.ts`, called by `api-config.ts` before `api-config:save` persists a renderer-supplied `baseUrl` and before `api-config:test` fetches it with a key attached), and `isSafeSearchQuery` / `isUsablePath` (`src/main/ipc/file-guard.ts`, called by the `file:search`, `file:open` and `file:revealInFolder` handlers, with `file-guard.test.ts` asserting main's pattern list still equals preload's). Most other handlers still validate inline.

| Channel | Checked in preload | Checked in main |
| --- | --- | --- |
| `command:execute` | string blocklist of `rm -rf`, `del /s`, `format`, `shutdown` | the **same four patterns** via `isCommandSafe` (`command-guard.ts`) — the bypass is closed, the keyword list is still weak |
| `file:search` | metacharacter blocklist (`&&`, `\|\|`, `;`, `\|`, `&`, `>`, `<`, `^`) and a 500-character cap | the same rule in `isSafeSearchQuery` (`file-guard.ts`) |
| `url:open` | `startsWith('http')` | `URL` parse plus an `http:`/`https:` allowlist |
| `file:open` | type check only | `isUsablePath` (`file-guard.ts`: non-empty, ≤1000 chars, no NUL, no interior escape) |
| `file:revealInFolder` | type check only | `isUsablePath`, and the shell call is skipped with a warning when it fails |
| `api-config:save` / `api-config:test` | none (the whole object is passed through) | `checkBaseUrl` before persisting and before fetching |

`command:execute` is still the sharpest edge, but not for the reason this doc used to give. Main re-checks the same four keywords, so neither a direct `ipcRenderer.invoke('command:execute', …)` from a compromised renderer nor a DevTools `Runtime.evaluate` steps around the guard; what remains weak is the blocklist itself, which is trivially bypassed (`Remove-Item -Recurse`, aliases, encoded commands). Treat the channel as arbitrary OS execution. If you tighten validation, tighten both layers in the same change — main is the boundary the sandbox actually guarantees, and preload is renderer-reachable.

**Coverage is real but uneven.** `npm run test` collects 50 files / 400 tests, and 48 of them import production code - the guards (`command-guard.test.ts`, `file-guard.test.ts`, `api-config-guard.test.ts`), the window singleton (`windowManager.test.ts`), the quit-time teardown policy (`lifecycle.test.ts`, which is why that module is Electron-free and separate from `main.ts`), the IPC wire contracts (`chat-sessions-push.test.ts`, `chat-cancel-turn.test.ts`), the logger registry (`logger.test.ts`), the shared boundary parsers (`src/shared/ipc/*.test.ts`), the agent's session publish (`sessions-publish.test.ts`), the Pi runtime (`pi/provider.test.ts` including the env-read timing that once stopped Ask mode from starting at all, `pi/toolbox.test.ts` driving all 32 tools against stub adapters, `pi/events.test.ts`, `pi/cancel.test.ts`, `pi/families.test.ts` on the tool-family index, `pi/ask-events.test.ts` on the event bridge, `pi/turn-record.test.ts` on the trajectory builder), `input-simulation.ts` (`ffi.test.ts`), `mcp/client-contract.test.ts` (which imports `MCPService` from `./client` and `loadPreferences` from `../../preferences`), the renderer hook tests, the renderer util tests, and two Ask-surface component mounts (`components/ask-mode/UnifiedCommandBar.test.tsx`, `components/ask-mode/AskModeExpanded.test.tsx`). Only two still prove nothing about shipped code: `handlers.test.ts` re-declares its own copies of `validateUrl`/`validatePath`/`isCommandSafe` and imports nothing but `vitest`, and `ocr.test.ts` re-implements its subject against `pngjs`. No test drives the browser subtree's behaviour - `pi/tools/browser-tools.test.ts` imports `statefulBrowserAgent` only to assert its method names are functions - and nothing constructs a `PiDesktopAgent` or runs a real Pi loop. `lifecycle.test.ts` covers the teardown *policy* and not the `will-quit` wiring, because `main.ts` is structurally unimportable under vitest — so the quit path's coverage stops one layer short of where the resources actually are. A green suite therefore under-proves the handler surface, and only the live harness (`scripts/harness/`) exercises the shipped window.

**Measured gate results in this checkout** (run after `npm install`; `node_modules` is present here, which contradicts several AGENTS.md files that still assert it is absent, and `tsconfig.json` no longer sets `baseUrl`):

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0, no output — 0 errors |
| Lint | `npx eslint "src/**/*.ts" "src/**/*.tsx"` | exit 0, 11 warnings and 0 errors — all eleven in `src/main/services/desktop/**` (`input-simulation.ts` 8, `uia-native.ts` 3), all pre-existing. This is a baseline to hold, not a caption to copy; the old 44-warning figure predates the Pi cutover |
| Unit tests | `npx vitest run` | exit 0, 50 test files / 400 tests, all passing — and see the caveat immediately above |

**What is untested, deliberately on the record.** Most of the ~60 IPC handlers — the ones that validate now have a test (`command-guard`, `file-guard`, `api-config-guard`, and the three chat wire contracts), but `app:*`, `dialog:*`, `apps:list`, `url:open`, `debug:log` and the `window:resizeHeight` handler itself still have none (`windowManager.test.ts` proves `clampExpandedHeight`, not the handler's expanded-mode-only check or its returned height). The token-stream pump (chunk assembly and the `AskStreamEvent` kind switch in `chat-handlers.ts`) has no test that drives a real Pi loop, even though the cancel path does. The document subtree has one executor test, not coverage. The entire browser subtree and the skill loader have none. `main.ts`, `windows.ts`, `shortcuts.ts` and `tray.ts` have none, so the Alt+Space hook and the reveal/settle pushes are proven only by `npm run harness:selftest` against the running window. `scripts/desktop-ffi-test.ts` re-declares its own koffi bindings rather than importing `input-simulation.ts`, so it validates the FFI pattern rather than shipped code, and it is wired to no npm script — `src/main/services/desktop/ffi.test.ts` is the version that does import production. Renderer hooks are covered by seven test files (`useWindowMode`, `useWindowReveal`, `useWindowTween`, `useResizeDrag`, `useChatSession`, `useKeyboard.escape`, `chatTranscriptFolds`); two components are mounted (`ask-mode/UnifiedCommandBar.test.tsx`, `ask-mode/AskModeExpanded.test.tsx`) and one is gated as a pure function (`ask-mode/ThinkingSteps.test.tsx`). No test mounts the app shell — palette, `ResultsList` and the settings window are unproven in jsdom, so layout and CSS remain manual-pass territory.

## How this doc is verified

Every number above was re-derived, not copied. Run these from the repo root; they are all read-only.

```bash
# desktop tool count — the frozen list in the test is the authority
npx vitest run src/main/services/pi/toolbox.test.ts
grep -cE "^  name: '[a-z_]+'" src/main/services/pi/toolbox.ts

# there is no DANGER_POLICY and no inferStatusFromTool any more; both died with desktop-agent.ts
grep -rn "DANGER_POLICY\|inferStatusFromTool" src/main | grep -v "^\S*:\s*[0-9]*:\s*\*\|//"

# IPC surface — expect 62 handlers, 58 invokes, 14 listener channels
# send channels: expect 9 from the literal grep and 13 from the union grep below —
# the four per-turn chat pushes go through beginTurn's send closure and are invisible to `.send(`
grep -rhoE "\.send\(\s*'[^']+'|[^a-zA-Z_.]send\(\s*'[^']+'" src/main | sed -E "s/.*'([^']+)'/\1/" | sort -u | wc -l
grep -rhoE "ipcMain\.handle\(\s*['\"][^'\"]+" src/main   | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l
grep -rhoE "ipcRenderer\.invoke\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l
grep -rhoE "ipcRenderer\.on\(\s*['\"][^'\"]+" src/preload     | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l
grep -rhoE "\.send\(\s*['\"][^'\"]+" src/main              | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l

# bridge drift — the three lists in the IPC section
comm -23 <(grep -rhoE "ipcMain\.handle\(\s*['\"][^'\"]+" src/main | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u) \
         <(grep -rhoE "ipcRenderer\.invoke\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u)
comm -23 <(grep -rhoE "ipcRenderer\.on\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u) \
         <(grep -rhoE "\.send\(\s*['\"][^'\"]+" src/main | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u)
grep -rn "ipcMain.on(" src/main --include=*.ts | grep -v "\.test\."   # expect exactly 1: window:animationFrame

# agent runtime — there is no graph; these are the live counts
grep -n "toHaveLength(32)" src/main/services/pi/toolbox.test.ts        # the desktop family, frozen
sed -n '/export const TOOL_FAMILIES/,/^\];/p' src/main/services/pi/families.ts | grep -c '"'   # 6 families
grep -c "name: \"" src/main/services/pi/tools/ui-tools.ts               # 5 structured-UI tools
# The count, two ways that agree:
awk '/^export function createPiDesktopToolbox/,/^}$/' src/main/services/pi/toolbox.ts | grep -c "Tool("   # 32 construction sites
npx vitest run src/main/services/pi/toolbox.test.ts                                                      # the frozen name list asserts the same 32
# Do NOT publish a `name:` grep for it: in toolbox.ts bare `name:` reports 27 and `name: "` reports 23,
# because several tools are built by factories (`PointTool`, `windowTool`) receiving the name as an argument.
grep -rn "ASK_GRAPH_NODES\|NODE_AGENT_MAP\|clearGraphCache\|\.addNode(" src --include=*.ts   # expect: comments only

# logger registry, both directions — mirrors what logger.test.ts asserts
sed -n '/const SUBSYSTEM_ENV_VARS/,/^};/p' src/main/utils/logger.ts | grep -oE "^  [A-Za-z]+:" | tr -d ' :' | sort > /tmp/reg.txt
grep -rhoE "createLogger\((\"|')[^\"']+(\"|')\)" src/main --include=*.ts | sed -E "s/createLogger\((\"|')//;s/(\"|')\)//" | sort -u > /tmp/used.txt
comm -23 /tmp/used.txt /tmp/reg.txt | wc -l   # unregistered names: 0
comm -13 /tmp/used.txt /tmp/reg.txt | wc -l   # registry entries with no call site: 0
# 34 lines in /tmp/used.txt, 33 in /tmp/reg.txt: the extra is logger.ts's own `createLogger('<name>')`
# doc-comment example, and `Graph` survives only because a comment still contains it.

# persistence engine — sql.js, and no better-sqlite3 anywhere
grep -n "from 'sql.js'" src/main/services/database/database-manager.ts
grep -rn "better-sqlite3" src/ package.json   # expect only the stale comment and the doc claims
grep -cE "id: [0-9]," src/main/services/database/schema.ts    # migrations = 4

# invariants that must stay empty
grep -rn "McpServer\|StdioServerTransport" src/ | grep -v AGENTS.md   # client-only
grep -rn "requestSingleInstanceLock" src/ | grep -v AGENTS.md          # does not exist
grep -rn "document-tools" src/ --include=*.ts | grep -E "import|from '"  # dead files stay uncalled

# gates, after npm install and npx electron-rebuild for the native deps
npx tsc --noEmit
npx eslint "src/**/*.ts" "src/**/*.tsx"
npx vitest run
```

Freshness rule: this document is `live` only while its counts match the commands above. If a change alters a tool count, an IPC channel count, a family's tool list, the persistence engine or the accessibility backend, either update this file in the same pass or state in the change report that it is now stale. Cite `path` plus symbol, never `path:line`, and never re-copy a number from `overall-architecture.md`, `docs/desktop-agent.md` or `docs/desktop-agent-gap-analysis.md` — those files disagree with the code on the desktop tool count, the accessibility backend and the storage engine.
