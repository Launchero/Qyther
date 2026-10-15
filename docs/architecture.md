# Qyther architecture reference

> **Status**: live — re-derived from source on 2026-10-13; see docs/AGENTS.md

This is the deep-dive technical reference. The README stays shallow; everything here was re-counted or re-read from this checkout, with the commands listed in the final section. Citations are `path` plus symbol name — never a line number, because line numbers rot (docs/AGENTS.md rule 2). Anything not verified in code is explicitly marked as inference.

## What Qyther is

Qyther is a Windows desktop launcher and AI assistant in one Electron app: a single frameless, always-on-top window summoned with Alt+Space that acts as a fuzzy command-and-file palette (local file search via the Everything `es.exe` CLI) and expands into "Ask mode", a streaming chat driven by a LangGraph agent runtime. That runtime classifies each request and can route it into three capabilities — Windows GUI automation, browser automation through the Playwright MCP server, and office-document generation (`docx`/`pptx`/`xlsx`) — with no confirmation gate: every desktop tool runs without asking, by deliberate product decision. All state is local; the only remote calls are the LLM endpoint, web search, the MCP children, and the `es.exe` download.

## What Qyther is not

| Claim | Verification in this checkout |
| --- | --- |
| Not cross-platform packaged | `package.json` scripts define only `build:win` and `build:win:dir`; there is no `build:mac` or `build:linux` script. `build.win.target` is `nsis` x64; the `build.mac` and `build.linux` keys are absent entirely. Some runtime code does branch for other platforms (`isMacOS()` guards `window-all-closed` in `src/main/main.ts`; the `globalShortcut` path in `src/main/shortcuts.ts` `registerGlobalShortcuts` is the macOS/Linux route), so "Windows-only" describes packaging, not every code path |
| Not a hosted service | No HTTP server framework and no listener in `src/`: greps for `createServer(`, `listen(` and `express` return nothing. The only socket bound at runtime is the development-only CDP port in `src/main/main.ts` (`remote-debugging-port`, set only when `NODE_ENV === 'development'`) |
| No telemetry | `grep -rniE "sentry\|posthog\|amplitude\|mixpanel\|analytics-node" src/` returns 0 hits. No analytics, no crash reporting, no beacon. Every outbound origin is listed under "External boundaries" |
| Not an MCP server | `grep -rn "McpServer\|StdioServerTransport" src/` returns hits only in `src/main/services/mcp/AGENTS.md` (the text of the ban), none in code. This repo is an MCP **client** only |
| Not a library | `package.json` `main` is `out/main/main.js`, an Electron entry point; there is no published module surface |

## Process topology and the security envelope

Three Electron contexts, one window, no additional `BrowserWindow` type anywhere in the tree.

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
- [`ask-routing.mmd`](diagrams/ask-routing.mmd) — the AskGraph, its router, and the six non-node handlers.
- [`desktop-hitl.mmd`](diagrams/desktop-hitl.mmd) — the desktop subgraph, the flat ReAct loop and the danger classification. (The filename is historical: there is no HITL path any more.)

## Boot sequence

Order is a contract: IPC registration precedes window creation so the renderer can never invoke an unbound channel, and the window is created last. From `src/main/main.ts`, in the order the statements appear.

| Step | File and symbol | Failure behaviour |
| --- | --- | --- |
| Load `.env` before anything else | `src/main/main.ts`, the `import 'dotenv/config'` first line | Fatal by design — every module-scope `ChatOpenAI` reads `process.env` at import time, so ordering is not optional |
| `__filename` / `__dirname` polyfill onto `globalThis` | `src/main/main.ts` | Fatal; native `bindings` lookups and the post-build `import.meta.dirname` patch both depend on it |
| `app.enableSandbox()` and the GPU/shader-cache command-line switches | `src/main/main.ts` module scope | Fatal |
| `createLogger('App')`, `logSystemInfo()` | `src/main/utils/platform.ts` `logSystemInfo` | Non-fatal, logging only |
| Env presence check for `API_KEY`, `BASE_URL`, `MODEL` | `src/main/main.ts`, inside `app.whenReady()` | Warn only; ask-mode degrades to the error string from `src/main/services/langchain/agent.ts` |
| `initializePreferences()` | `src/main/preferences.ts` | Not wrapped — a throw here escapes `whenReady` and is swallowed by the `uncaughtException` handler, leaving the app half-initialised |
| `initializeDatabaseManager()` then `dbManager.stats()` | `src/main/services/database/database-manager.ts` | Wrapped; degrades to `log.warn` and the app runs with no agent memory |
| `initializeEs()` (guarded by `isWindows()`) | `src/main/utils/esDownloader.ts` | Not wrapped in try/catch; reports failure by returning false, which the caller logs as a warning. File search is simply unavailable |
| `mcpService.initializeWithRetry()` | `src/main/services/mcp/client.ts` | Wrapped; after 3 attempts it warns and the graph runs with zero MCP tools, silently |
| `Menu.setApplicationMenu(null)` | `src/main/main.ts` | Fatal |
| `registerIPCHandlers()` | `src/main/ipc/handlers.ts`, which calls `registerChatHandlers()` and `registerMCPHandlers()` | Fatal; `ipcMain.handle` throws on a duplicate channel |
| `registerApiConfigHandlers()` | `src/main/ipc/api-config.ts` | Fatal |
| `registerBrowserHandlers()` | `src/main/ipc/browser-handlers.ts` | Fatal |
| `getAskGraph()` pre-compile | `src/main/services/langgraph/research-agent.ts` | Fire-and-forget promise with `.catch` → warn; recompiled on the first chat |
| `execSync('npx playwright install chromium')` | `src/main/main.ts` | Wrapped; warns and defers to first use. This is the single largest cold-start offender and the only synchronous blocking call on the boot path |
| `registerGlobalShortcuts()` | `src/main/shortcuts.ts` | Fatal; the koffi hook plus `globalShortcut` registration |
| `createTray()` | `src/main/tray.ts` | Fatal |
| `createMainWindow()` | `src/main/windows.ts` | Fatal; last step |

Teardown is a real quit, not a log line. `will-quit` in `src/main/main.ts` calls `event.preventDefault()`, runs the ordered `buildShutdownSteps()` list through `createShutdown()` (`src/main/lifecycle.ts`), and only then `app.exit(0)` — because Electron does not wait on a handler's promises, so the previous handler returned while every disposer was still in flight. `lifecycle.ts` runs the steps sequentially in array order, bounds each at `SHUTDOWN_STEP_DEADLINE_MS` (2 s) so one wedged disposer cannot strand the rest, never rejects, and memoises `run()` so a second `will-quit` joins the run instead of double-disposing. The order: `unregisterGlobalShortcuts()` → `destroyTray()` → `langChainAgent.cleanupBrowserAgent()` (which is also the browser subtree's release path) → `mcpService.cleanup()` → `browserMemory.close()` → `closePiDesktopAgent()` → `getDatabaseManager().close()`. The hook and its 10 ms message-pump interval are released inside `cleanupWindowsGlobalHotkey` (`src/main/shortcuts.ts`), which is why that step is first — if they are not released, the process lingers. `SHUTDOWN_STEP_DEADLINE_MS` is a ceiling on a *stuck* disposer, not a budget for a slow one; the common case is single-digit milliseconds.

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
| `ipcMain.handle` channels, unique | 59 | grep and `sort -u` over `src/main` |
| — in `src/main/ipc/handlers.ts` | 25 | `grep -c "ipcMain.handle("` |
| — in `src/main/ipc/chat-handlers.ts` `registerChatHandlers` | 11 | same |
| — in `src/main/ipc/mcp-handlers.ts` `registerMCPHandlers` | 10 | same |
| — in `src/main/ipc/browser-handlers.ts` `registerBrowserHandlers` | 9 | same |
| — in `src/main/ipc/api-config.ts` `registerApiConfigHandlers` | 4 | same |
| `ipcRenderer.invoke` channels in preload | 55 | grep and `sort -u` over `src/preload` |
| `ipcRenderer.on` push channels in preload | 13 | same |
| distinct main→renderer send channels | 8 | grep of `.send('` in `src/main`, `sort -u` |
| `ipcMain.on` receivers | 0 | none exist; every pull channel is `handle`/`invoke` |
| Namespaces in use | 12 | `app` `window` `command` `url` `file` `apps` `dialog` `debug` `chat` `mcp` `browser` `api-config` |

Invoke distribution across those 55: `chat` 11, `app` 8, `browser` 8, `window` 7, `mcp` 7, `file` 4, `api-config` 4, `dialog` 2, `url` 1, `command` 1, `apps` 1, `debug` 1.

Naming convention is `namespace:camelCaseVerb`, with two known three-segment exceptions: `file:everything:status` (`src/main/ipc/handlers.ts`) and `desktop:screenshot:capture` (`src/preload/preload.ts`).

Pull versus push. Pull channels return a value or reject. Push channels are one-directional from main: `src/main/windows.ts` sends `window:shown`, `window:will-hide` and `window:modeChanged`; the preload subscribes once at module scope and re-dispatches each as a DOM `CustomEvent` (`electron-window-shown` and friends), which is what `src/renderer/hooks/useWindowMode.ts` listens for. The streaming channels bind inside `electronAPI` closures instead and are consumed by `src/renderer/hooks/useChatSession.ts`. Every `onXxx(cb)` returns an `removeListener` unsubscribe and the caller must store and return it — a `useEffect` that subscribes without a cleanup leaks one listener per StrictMode double-mount.

### Documented bridge drift

These are half-wired bridges, not absent features. Do not delete the surviving half.

| Drift | Detail |
| --- | --- |
| Handlers registered but unreachable from the renderer (4) | `browser:initialize`, `browser:executeTask`, `browser:cleanup` (all in `src/main/ipc/browser-handlers.ts` `registerBrowserHandlers`) and `mcp:initialize` (`src/main/ipc/mcp-handlers.ts` `registerMCPHandlers`). `src/preload/preload.ts` invokes `browser:initializeAgent` instead, a different channel, which shadows `browser:initialize` |
| Preload listeners with no sender in main (1) | `desktop:screenshot:capture` |
| Preload sends with no receiver (2) | `desktop:screenshot:result` and `desktop:screenshot:error`. There are zero `ipcMain.on` registrations repo-wide, so the whole screenshot round-trip is dead at both ends |
| Senders with no listener | none |
| Invokes with no handler | none — 55 invokes all resolve |
| Cross-namespace registration | `browser:initializeAgent` and `browser:getStatus` are registered by `registerMCPHandlers`, not by `registerBrowserHandlers`. Grep `ipcMain.handle` across all five files before assuming where a `browser:*` channel lives |

Three error idioms coexist and a new handler must pick one deliberately: a result envelope `{ success, output?, error? }` with the throw swallowed into a log (`command:execute`, `url:open`, `file:open` in `src/main/ipc/handlers.ts`); a re-throw that crosses IPC and rejects the renderer promise (`window:setMode`, `file:search`, `browser:executeTask`); or a swallowed failure returning a fallback value (`window:getMode` and `window:toggleMode` fall back to `'compact'`, `window:getHeight` to `600`).

## The agent runtime

Four compiled graphs, 29 nodes total, all counts from `.addNode` greps.

| Graph | File | Nodes | Names |
| --- | --- | --- | --- |
| AskGraph | `src/main/services/langgraph/research-agent.ts` `getAskGraph` | 5 | `classify`, `browserSubgraph`, `desktopAgent`, `documentSubgraph`, `postProcessNode` |
| Browser subgraph | `src/main/services/browser/browser-subgraph.ts` | 8 | `memoryRetrieve`, `skillRouter`, `loadSkills`, `planner`, `executeSubtask`, `verifier`, `recovery`, `memoryStore` |
| Document subgraph | `src/main/services/document/document-subgraph.ts` | 9 | `memoryRetrieve`, `classifyAction`, `planner`, `executeAction`, `delegateToBrowser`, `delegateToDesktop`, `verifier`, `recovery`, `memoryStore` |

Three compiled graphs, 22 nodes. There is no desktop subgraph: it was deleted at the Pi cutover. `desktopAgent` is a node in name only — `desktopAgentNode` makes one call to `runPiDesktopTask(...)` in `src/main/services/pi/agent.ts` and maps the returned tool progress onto `desktopActions` / `desktopExecutionTrace`. The Pi agent is a single loop over 32 TypeBox tools, not a plan→execute→verify→recover graph, so there is nothing to register.

AskGraph shape: `__start__` → `classify` → a conditional edge → exactly one of the three subgraph nodes → all three fan into `postProcessNode` → `END`. The checkpointer is `new MemorySaver()` and the compiled instance is cached on an env-derived key (`getGraphEnvCacheKey`), so `getAskGraph()` pays the compile once at boot. After changing `MODEL`, `FAST_MODEL`, `BASE_URL` or `API_KEY` at runtime you must call `clearGraphCache()` or the cached graph keeps the old model config.

Classification, and the fast path that avoids the LLM. `classifyNode` runs heuristics before any model call: `detectFastPath` matches six patterns from `FAST_PATTERNS` (`greeting`, `thanks`, `acknowledgement`, `farewell`, `date`, `time`), accepts only queries of 1–60 characters, and rejects anything containing a question mark except the date and time patterns. A fast-path hit returns `intent: "general"` immediately with no network call. `isContextualFollowup` then selects a history-aware prompt, `rewriteQueryWithContext` resolves anaphora against prior messages, and `routerModel.invoke` (a `ChatOpenAI` with `maxTokens: 10`) returns a literal `intent/complexity` string. Parsing is guarded twice: an intent outside the five valid ones (`research`, `general`, `browser`, `desktop`, `document`) falls back to `general`, and an unparseable complexity falls back to the `assessComplexity` heuristic. `routeAfterClassify` then collapses the five intents into three targets — `desktop` and `document` route to their subgraphs, everything else routes through `browserSubgraph`.

Six handlers that are **not** graph nodes. `comparisonNode`, `formNode`, `chartNode`, `externalSearchNode`, `internalKnowledgeNode` and `generalChatNode` are all defined in `src/main/services/langgraph/research-agent.ts` and none appears in `.addNode`. They are dispatched by ordinary function calls inside `browserSubgraphNode`, in this order: contextual followup, comparison regex, form regex, chart regex, research plus medium/complex, `externalSearchNode`, research plus simple, `internalKnowledgeNode`, general, `generalChatNode`, and finally a browser-automation fallback delegating to `executeBrowserSubgraph`.

Why that distinction matters: because they are not nodes, they produce no LangGraph node events, so they emit no `chat:agent-change` and no `chat:thinking-step` of their own; they are not resumable checkpointer steps; adding `.addNode` for any of them would create an unreachable duplicate; and a conditional edge to one is a bug, not a refactor. A new imperative handler belongs in that dispatch chain inside `browserSubgraphNode`, not in the graph.

Streaming contract, implemented in `src/main/ipc/chat-handlers.ts` inside `registerChatHandlers`.

- `graph.streamEvents(input, { version: "v2", configurable: { thread_id }, recursionLimit: 50, timeout })` on the `chat:sendStreamMessage` handler. That is the only chat pump: `chat:sendMessage` and the HITL `chat:resumeGraph` pump were both deleted.
- The thread id is per-turn, `${sessionId}:turn-${Date.now()}`, so one `MemorySaver` thread never carries checkpoint state across turns.
- Tokens are emitted **only** for nodes in `RESPONSE_NODE_SET`, which the `chat:sendStreamMessage` pump imports from `src/main/services/langgraph/node-registry.ts`. It contains the four entries `browserSubgraph`, `desktopSubgraph`, `documentSubgraph`, `postProcessNode`; `classify` is deliberately absent, so classification never streams tokens and appears in `NODE_AGENT_MAP` only. Both maps are derived from one `ASK_GRAPH_NODES` table, and `research-agent-registry.test.ts` compares that table against the `.addNode()` calls in `research-agent.ts`, so a node and its registry row cannot disagree.
- `NODE_AGENT_MAP` maps the five AskGraph node names to UI agent labels (`classify` and `postProcessNode` render as Research, the three subgraphs as Browser, Desktop, Document).
- Push channels: `chat:stream-chunk` for tokens, `chat:thinking-step` for reasoning steps, `chat:agent-change` for the agent pill. The final chunk carries `uiPayloads`, `sources` and `metrics`. Every post-stream state read goes through `withStateLock`.
- Structured output uses one trio consistently: a Zod schema, `chatModel.withStructuredOutput(schema, { method: "jsonMode" })`, then a post-parse validity filter. The renderer side mirrors it as a five-member payload union in `src/renderer/components/ask-mode/GenerativeUI/index.tsx` (`GenerativeUIType`: `table`, `form`, `comparison`, `list`, `chart`) with a JSON fallback branch for unknown types.

No human-in-the-loop path exists. There used to be one — a node called `interrupt()`, `chat-handlers.ts` pushed `desktop:confirmation-request`, and the renderer answered through `chat:resumeGraph` — but the whole round trip has been removed as a deliberate product decision: no `interrupt()` call remains anywhere, both IPC channels are deleted, `src/shared/ipc/hitl-decision.ts` is deleted, and `desktopConfirmationState` is gone from `AskState`. Every desktop tool runs without asking.

Cancellation is the other half of that story, and it is what replaced the gate. The chat pump registers each turn's `AbortController` in `activeTurns` keyed by the per-turn thread id, and `chat:cancelTurn {threadId}` aborts it. LangGraph does not cancel a node that is already running, so the pump's `finally` in `chat-handlers.ts` also calls `abortPiDesktopRun()` — on **every** exit path, not only a user stop. Inside the Pi agent, `withAbort` (`src/main/services/pi/abort.ts`) races `agent.prompt()` against the run's own controller, so the node settles as an abort instead of hanging; a `Stop` press, the 120 s `GRAPH_TIMEOUT_MS` and normal completion all end up there. That combination is what closes the 2026-10-15 hang, where a 3-step task left main at 0% CPU on a promise that never resolved.

Delegation between agents travels in `AskState.crossAgentContext` (an append reducer in `src/main/services/langgraph/state.ts`) and in typed results such as `BrowserDelegationResult`. The edges are one-directional: document delegates to both browser and desktop (`src/main/services/document/document-delegation.ts`), the desktop agent is reached by the AskGraph's `desktopAgent` node via `runPiDesktopTask`, and there is no desktop-to-document handoff and no browser delegation out of the browser subtree.

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

The 912-line NL-postcondition `desktop-verifier.ts`, the `verifier` node it ran in, the recovery ladder in `desktop-recovery.ts` (`MAX_RETRIES = 2`, `shouldRetry`, `replan`) and the trajectory memory in `desktop-memory.ts` were all deleted at the Pi cutover; Pi has no equivalent. The browser subtree keeps its own five-strategy recovery union (`retry`, `alternative`, `replan`, `skip`, `abort` in `src/main/services/browser/types.ts`) and aborts at three recoveries.

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
| Browser memory | `browser-memory/trajectories.db` under userData, `src/main/services/browser/browser-memory.ts` | a separate `sql.js` file with its own single `trajectories` table; `retrieve()` returns only `success = 1` rows matched on task keywords |
| App preferences | `preferences.json` under userData, `src/main/preferences.ts` | `windowMode`, `customDimensions`, `lastPosition`, `llm`, `mcp`. The merge is a shallow spread, so `savePreferences({ llm })` replaces the entire `llm` object. `resetPreferences` is exported and called by nothing |
| API config | `api-config.json` under userData, `src/main/ipc/api-config.ts` | the `api-config:*` save/load/delete/test surface |
| `es.exe` | userData, `src/main/utils/esDownloader.ts` | downloaded zip extracted there, not a system install |
| Generated documents | `~/Documents` only, `getDocumentsFolder()` in `src/main/services/document/document-executor.ts` | there is no user-chosen destination and no other write root |

Chat history is **not** persisted. Sessions live in the `sessions: Map` inside `src/main/services/langchain/agent.ts` and die with the process. The database doc's own statement is the correct one: chat is in-memory, the schema is for the desktop/document learning loop only.

## External boundaries

| Boundary | Code | Contract |
| --- | --- | --- |
| LLM endpoint | `src/main/services/langgraph/research-agent.ts` (`chatModel`, `routerModel`, `rewriteModel`) and `src/main/services/langchain/agent.ts` | any OpenAI-compatible endpoint through `@langchain/openai` `ChatOpenAI`. Four env vars, read at module import: `API_KEY`, `BASE_URL`, `MODEL`, `FAST_MODEL` (plus the optional `TAVILY_API_KEY` / `BRAVE_API_KEY` / `JINA_API_KEY` for web). Without a key `chatModel` stays null and ask-mode returns a canned error string — there is no mock or offline path beyond the classifier fast path |
| MCP servers | `src/main/services/mcp/client.ts` `MCPService`, config `mcp-config.json` at repo root | client only, over `MCPAdapter` (2.x; was `MultiServerMCPClient`) from `@langchain/mcp-adapters` with `prefixToolNameWithServerName: false` and a 30 s default tool timeout. Three servers declared here: `filesystem`, `sequential-thinking`, `playwright`. Loading is gated on `prefs.mcp.enabled`; a missing or unparseable config degrades to zero servers with a warning, never a crash |
| Web search and page fetch | `src/main/services/web/` — `searchWeb`, `fetchWebPage`, `checkFetchUrl` | Sequential provider chain in registry order (`exa` -> `parallel` -> `searxng` -> `marginalia` -> `duckduckgo` -> `tavily` -> `brave`), first usable response wins, failures returned as model-facing notes rather than thrown. **Five of the seven need no API key at all**: two keyless MCP endpoints (`mcp.exa.ai/mcp`, SSE-framed; `search.parallel.ai/mcp`, double-encoded payload), a bounded rotating pool of public SearXNG instances, the Marginalia small-web index, and the DuckDuckGo HTML endpoint. Every keyless engine rate-limits by IP (measured: 0 of 71 SearXNG instances served JSON to a cloud IP, DuckDuckGo bans and unbans on its own), so the chain is a best-effort ladder rather than redundancy. Measured live 2026-10-15. Google-style query directives (`site:`, `-site:`, `after:`/`before:`, `filetype:`, quoted phrases) are parsed once, re-emitted per engine dialect, and re-applied as a lenient post-filter that relaxes a constraint matching nothing. Fetch: `<url>.md` sibling, markdown content negotiation, reader chain (local extractor, then `r.jina.ai`) behind a quality gate, 500k hard cap plus a caller budget. Every URL passes `checkFetchUrl` (http/https only, no credentials, loopback/private/link-local/metadata blocked) **twice** — once on the string, once after redirects. Consumed by `externalSearchNode`; the old `langgraph/tools.ts` is deleted |
| Local file index | `src/main/utils/esDownloader.ts` and `esRunner.ts` | `es.exe` is fetched from the GitHub releases API for `voidtools/ES` and unzipped into userData; searches shell out to it |
| Browser | `src/main/services/browser/stateful-browser-agent.ts` | Chromium is driven **only** through the Playwright MCP stdio child (headless, `--caps=vision`), selected by a `browser_` name-prefix filter. No browser tool count is declared in this repo and none should be written into code or docs |
| Operating system | the desktop subtree above | Win32 via koffi/libwin32, UIA via `node-winautomation` COM, capture via Electron `desktopCapturer`, OCR via `tesseract.js`, plus a PowerShell `System.Drawing` capture fallback |

## Cross-cutting traps

| Trap | Where | Effect |
| --- | --- | --- |
| Unregistered logger subsystems lose their `info` and `debug` lines in production | `SUBSYSTEM_ENV_VARS` in `src/main/utils/logger.ts` | 50 distinct `createLogger('<Name>')` subsystem names are constructed across `src/main`, of which 26 have a registry entry. The remaining **24 are unregistered**, including all seven `Document*` names and six of the nine `Browser*` names, plus `InputSimulator`, `UIANative`, `AccessibilityTree`, `ScreenshotCapture`, `WindowsDesktopAdapter`, `GroundTruthVerifier`, `MCPRouter`, `ApiConfig`. An unregistered name inherits `globalLevel`, which defaults to `error` in production, so its `info` and `debug` output never appears and no environment switch can enable it |
| A new graph node with no registry row used to produce no output at all | one `ASK_GRAPH_NODES` table (`src/main/services/langgraph/node-registry.ts`), bound to the builder by `research-agent-registry.test.ts` | the failure mode was silent: no tokens, no agent change, no error. Register the node once and `NODE_AGENT_MAP` plus the emitting set follow automatically; a node and a registry row that disagree now fail `npm run test` |
| `clearGraphCache()` is exported but called by nothing | `src/main/services/langgraph/research-agent.ts` | env changes after the first `getAskGraph()` are silently ignored; invalidation is manual and there is no env watcher |
| Model default drift | `chatModel` in `src/main/services/langchain/agent.ts` defaults to `qwen3.5-plus`; every other default across `agent.ts`, `research-agent.ts`, `chat-handlers.ts` and the browser planner/verifier/recovery defaults to `qwen3.6-plus` | applies only when `MODEL` is unset; harmonise, do not add a third value |
| Runtime prompt material is not packaged | the copy step in `electron.vite.config.ts` and `build.files` in `package.json` | the build copies only `sql-wasm.wasm` and `Automation.node` into `out/main`, and packages `out/**/*` plus `package.json`. `src/main/services/browser/skills/` holds six `SKILL.md` directories that no copy step touches — verified empirically: `out/main/` in this checkout contains the wasm but no `skills` directory. `browser-skill-loader.ts` resolves `skills` next to the bundle, so a production build logs "Skills directory not found" and runs with zero skills; skills are observable only under `npm run dev`. Same reasoning applied to `mcp-config.json`: it sits at the repo root, is resolved from `PROJECT_ROOT` in `client.ts`, and is not in `build.files` — inference, not an observed production run, that a packaged build therefore starts with no MCP servers |
| The document `read` action dead-ends | `classifyAction` and `executeActionNode` in `src/main/services/document/document-subgraph.ts` | a read-classified request is routed straight to `executeAction` with `subtasks: []`, trips the no-subtask guard and returns `No subtask available`. Document reading is not wired end-to-end |
| Generated documents overwrite each other | `uniqueFilePath` in `src/main/services/document/document-executor.ts` | the first `try` block contains only comments and an unconditional `break`, so the `while (true)` exits on iteration one and the `statSync` plus `_N` renaming branch below it never runs. Asking twice for the same title replaces the first file |
| `contentSpec` has no schema behind it | `document-executor.ts` | the planner emits it as a free `z.record`, and the three writers read it through raw `as` casts (`sections`, `slides`, `sheets`). `document-tools.ts` describes the shapes that were intended and has zero importers, so it is aspirational, not a contract |
| `traceNode` records by mutation | `document-subgraph.ts` | LangGraph applies returned partials, never mutations, so the document timeline never reaches state and `executeDocumentSubgraph` hands back the initial empty array |
| `stepTimeout` is declared and never read | `stateful-browser-agent.ts` and `browser-session-manager.ts` | there is no 30 s per-step limit; the effective timeout is the Playwright MCP env value |
| The direct browser IPC bypasses the subgraph | `browser:executeTask` in `src/main/ipc/browser-handlers.ts` | runs the bare ReAct executor with no planner, verifier, recovery or skills; skills and the plan/verify loop apply only to the graph and delegation entry points |
| Reducers are load-bearing | `src/main/services/langgraph/state.ts` | a per-turn field using an append reducer instead of `replaceArray` leaks across turns on a reused thread |
| Three deleted detectors | `ui-detector.ts` in `desktop/`, `document/` and `browser/` have been deleted (all three had zero importers). `document-tools.ts`, `mockAskData.ts` and several renderer hooks and components are likewise dead with zero importers |

## Known gaps and honest limits

**Validation is split asymmetrically between the two layers, and no validator is shared.** The names `validateUrl`, `validatePath` and `isCommandSafe` exist only as local functions inside `src/main/ipc/handlers.test.ts`; they are not in `handlers.ts` or `preload.ts`. Production handlers validate inline.

| Channel | Checked in preload | Checked in main |
| --- | --- | --- |
| `command:execute` | string blocklist of `rm -rf`, `del /s`, `format`, `shutdown` | none — the handler passes the string to `promisify(exec)` |
| `file:search` | metacharacter blocklist (`&&`, `\|\|`, `;`, `\|`, `&`, `>`, `<`, `^`) and a 500-character cap | none |
| `url:open` | `startsWith('http')` | `URL` parse plus an `http:`/`https:` allowlist |
| `file:open` | type check only | length cap plus a backslash pattern |
| `file:revealInFolder` | type check only | **none** — the handler calls `shell.showItemInFolder` with the raw path |

`command:execute` is the sharpest edge: its only guard lives in the preload layer, which is renderer-reachable, so any direct `ipcRenderer.invoke('command:execute', …)` from a compromised renderer bypasses the blocklist entirely. Tightening validation means tightening both layers in the same change, with main as the boundary the sandbox actually guarantees.

**Coverage is real but uneven.** `npm run test` collects 38 files / 305 tests, and 35 of them import production code - the guards (`command-guard.test.ts`, `file-guard.test.ts`, `api-config-guard.test.ts`), the window singleton (`windowManager.test.ts`), the quit-time teardown policy (`lifecycle.test.ts`, which is why that module is Electron-free and separate from `main.ts`), the IPC wire contracts (`chat-sessions-push.test.ts`, `chat-cancel-turn.test.ts`), the logger registry (`logger.test.ts`), the shared boundary parsers (`src/shared/ipc/*.test.ts`), the agent's session publish (`sessions-publish.test.ts`), the Pi runtime (`pi/provider.test.ts`, `pi/toolbox.test.ts` driving all 32 tools against stub adapters, `pi/events.test.ts`, `pi/cancel.test.ts`), `input-simulation.ts` (`ffi.test.ts`) and the renderer hook tests plus one pure renderer util test (`markdownBlocks.test.ts`). Only three still prove nothing about shipped code: `handlers.test.ts` re-declares its own copies of `validateUrl`/`validatePath`/`isCommandSafe` and imports nothing from production; `ocr.test.ts` re-implements its subject against `pngjs`; `client-contract.test.ts` imports only the `@langchain/mcp-adapters` library (though it drives the repo's own stdio MCP server, which makes it a genuine contract test of a dependency's behaviour, not of this repo's code). No test imports any `services/browser` module, and nothing constructs a `PiDesktopAgent` or runs a real Pi loop. `lifecycle.test.ts` covers the teardown *policy* and not the `will-quit` wiring, because `main.ts` is structurally unimportable under vitest — so the quit path's coverage stops one layer short of where the resources actually are. A green suite therefore under-proves the handler surface, and only the live harness (`scripts/harness/`) exercises the shipped window.

**Measured gate results in this checkout** (run after `npm install`; `node_modules` is present here, which contradicts several AGENTS.md files that still assert it is absent, and `tsconfig.json` no longer sets `baseUrl`):

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0, no output — 0 errors |
| Lint | `npx eslint "src/**/*.ts" "src/**/*.tsx"` | exit 0, 44 warnings and 0 errors (unused vars and `no-explicit-any`, both configured to warn) |
| Unit tests | `npx vitest run` | exit 0, 38 test files / 305 tests, all passing — and see the caveat immediately above |

**What is untested, deliberately on the record.** Most of the ~60 IPC handlers — the ones that validate now have a test (`command-guard`, `file-guard`, `api-config-guard`, and the three chat wire contracts), but `app:*`, `dialog:*`, `apps:list`, `url:open`, `debug:log` and the `window:resizeHeight` handler itself still have none (`windowManager.test.ts` proves `clampExpandedHeight`, not the handler's expanded-mode-only check or its returned height). The token-stream pump (chunk assembly, `NODE_AGENT_MAP` routing, the `responseNodes` whitelist) has no test even though the cancel path does. The document subtree has one executor test, not coverage. The entire browser subtree and the skill loader have none. `main.ts`, `windows.ts`, `shortcuts.ts` and `tray.ts` have none, so the Alt+Space hook and the reveal/settle pushes are proven only by `npm run harness:selftest` against the running window. `scripts/desktop-ffi-test.ts` re-declares its own koffi bindings rather than importing `input-simulation.ts`, so it validates the FFI pattern rather than shipped code, and it is wired to no npm script — `src/main/services/desktop/ffi.test.ts` is the version that does import production. Renderer hooks are covered by five `.test.tsx` files (`useWindowMode`, `useWindowReveal`, `useWindowTween`, `useResizeDrag`, `useChatSession`); no component-level or DOM-integration test exists, so layout and CSS remain manual-pass territory.

## How this doc is verified

Every number above was re-derived, not copied. Run these from the repo root; they are all read-only.

```bash
# desktop tool count — the frozen list in the test is the authority
npx vitest run src/main/services/pi/toolbox.test.ts
grep -cE "^  name: '[a-z_]+'" src/main/services/pi/toolbox.ts

# there is no DANGER_POLICY and no inferStatusFromTool any more; both died with desktop-agent.ts
grep -rn "DANGER_POLICY\|inferStatusFromTool" src/main | grep -v "^\S*:\s*[0-9]*:\s*\*\|//"

# IPC surface — expect 59 handlers, 55 invokes, 13 listener channels, 8 send channels
grep -rhoE "ipcMain\.handle\(\s*['\"][^'\"]+" src/main   | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l
grep -rhoE "ipcRenderer\.invoke\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l
grep -rhoE "ipcRenderer\.on\(\s*['\"][^'\"]+" src/preload     | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l
grep -rhoE "\.send\(\s*['\"][^'\"]+" src/main              | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u | wc -l

# bridge drift — the three lists in the IPC section
comm -23 <(grep -rhoE "ipcMain\.handle\(\s*['\"][^'\"]+" src/main | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u) \
         <(grep -rhoE "ipcRenderer\.invoke\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u)
comm -23 <(grep -rhoE "ipcRenderer\.on\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u) \
         <(grep -rhoE "\.send\(\s*['\"][^'\"]+" src/main | sed -E "s/.*\(\s*['\"]//;s/['\"]//" | sort -u)
grep -rn "ipcMain.on(" src/main   # expect no matches

# graph nodes — expect 5, 8, 9 for a total of 22 across 3 compiled graphs (there is no desktop subgraph)
grep -c "\.addNode(" src/main/services/langgraph/research-agent.ts \
  src/main/services/browser/browser-subgraph.ts \
  src/main/services/document/document-subgraph.ts
grep -cE "^async function (comparisonNode|formNode|chartNode|externalSearchNode|internalKnowledgeNode|generalChatNode)" \
  src/main/services/langgraph/research-agent.ts   # the six non-node handlers = 6

# logger registry gap — 50 names constructed, 26 registered, 24 unregistered
sed -n '/const SUBSYSTEM_ENV_VARS/,/^};/p' src/main/utils/logger.ts | grep -oE "^  [A-Za-z]+:" | tr -d ' :' | sort > /tmp/reg.txt
grep -rhoE 'createLogger\(("|'"'"')[^("'"'"')]+("|'"'"')\)' src/main --include=*.ts | sed -E "s/createLogger\(.//;s/.\)//" | sort -u > /tmp/used.txt
comm -23 /tmp/used.txt /tmp/reg.txt | wc -l

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

Freshness rule: this document is `live` only while its counts match the commands above. If a change alters a tool count, an IPC channel count, a graph node count, the persistence engine or the accessibility backend, either update this file in the same pass or state in the change report that it is now stale. Cite `path` plus symbol, never `path:line`, and never re-copy a number from `overall-architecture.md`, `docs/desktop-agent.md` or `docs/desktop-agent-gap-analysis.md` — those files disagree with the code on the desktop tool count, the accessibility backend and the storage engine.
