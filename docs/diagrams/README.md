# Architecture diagrams

> **Status**: live — every box was verified against the current checkout on the render date. Line-number citations rot on the next edit, so this file cites paths and symbol names instead (see `docs/AGENTS.md` rule 2); re-derive any count before trusting it. The `.mmd` files are the source of truth; the `.svg` files are renders. GitHub renders fenced `mermaid` natively and follows the viewer theme — embed a diagram by pasting its `.mmd` body into a ` ```mermaid ` block.

Three diagrams, drawn only from what the code does. Each arrow is labelled with its crossing mechanism (IPC channel, stdio JSON-RPC, HTTPS, FFI/DLL, COM, fs).

| File | Shows |
|---|---|
| `system-context.mmd` / `.svg` | Process topology + external boundaries: main / sandboxed preload / React renderer / tray, MCP stdio children, Playwright-driven Chromium, `es.exe`, LLM endpoint, DuckDuckGo/Tavily, `userData` stores, Win32/UIA/OCR, and the Alt+Space hook. |
| `ask-routing.mmd` / `.svg` | The 5-node AskGraph: `classify` → conditional → 3 subgraph branches → fan-in to `postProcessNode` → END, with the classifier fast-path, `MemorySaver`, and the six imperative handlers drawn as a **non-node** dispatch chain. |
| `desktop-hitl.mmd` / `.svg` | The desktop path: the AskGraph's `desktopAgent` node calling one Pi `Agent` loop over 32 TypeBox tools, the `AgentEvent`→bridge translation, the `details.verifies` opt-in driving the automatic pixel check, the turn-abort path, and the tool→adapter→Win32/UIA/OCR layering. (The filename is historical: there is no HITL path any more.) |

## Source-of-truth per box

Cited by path plus symbol. To re-check a box, open the file and find the named symbol.

| Element | Evidence |
|---|---|
| Sandbox + preload | `src/main/main.ts`, the module-scope `app.enableSandbox()` call; `src/main/windows.ts`, the `webPreferences` literal inside `createMainWindow` (`contextIsolation`, `nodeIntegration`, `sandbox`, and the `preload: '../preload/preload.cjs'` entry) |
| One window + tray + hook | `src/main/windows.ts`, `createMainWindow` (the `new BrowserWindow(options)` construction) and its `hookWindowMessage(WM_SYSCOMMAND)` handler that swallows `SC_KEYMENU`; `src/main/tray.ts`, `createTray`; `src/main/shortcuts.ts`, `setupWindowsGlobalHotkey` — the `SetWindowsHookExW(WH_KEYBOARD_LL, …)` install and the `messagePumpInterval` that keeps it alive |
| MCP stdio spawn | `src/main/services/mcp/client.ts`, `MCPService.initialize()` (the `new MCPAdapter({ prefixToolNameWithServerName: false, defaultToolTimeout: 30000, … })` construction — 2.x renamed `MultiServerMCPClient` to `MCPAdapter`); the Playwright server itself is declared in `mcp-config.json` at the repo root |
| `es.exe` / web search / page fetch | `src/main/utils/esRunner.ts`, `searchFiles`; `src/main/services/web/search/exa.ts` and `search/parallel.ts` (the two keyless `tools/call` POSTs the chain relies on first), `search/searxng.ts` (`INSTANCE_POOL`, the rotating public-instance list) and `search/marginalia.ts`, `search/duckduckgo.ts` (the `html.duckduckgo.com` scrape), `search/tavily.ts` (the `api.tavily.com` call), `search/registry.ts` (`SEARCH_PROVIDERS`, whose array order *is* the chain order), and `fetch/page.ts`, `loadPage` (the only outbound transport: UA rotation, `Accept-Encoding: identity`, 50 MiB streaming cap) |
| Win32/UIA/OCR | `src/main/services/desktop/input-simulation.ts`, `ensureLoaded` (the `koffi.load('user32.dll')` and `koffi.load('shell32.dll')` calls); `src/main/services/desktop/uia-native.ts`, the module-scope `require('node-winautomation')`; `src/main/services/desktop/windows-adapter.ts`, `ensureOcrWorker` (tesseract `createWorker`) |
| Persistence | `src/main/services/database/database-manager.ts`, the `initSqlJs`/`Database` imports from `sql.js` plus the `dbPath` assignment in the `DatabaseManager` constructor (`userData/desktop-agent.db`) — sql.js, not better-sqlite3 |
| AskGraph build + router | `src/main/services/langgraph/research-agent.ts`, `getAskGraph` (the `.addNode`/`.addEdge`/`.addConditionalEdges` chain and the `new MemorySaver()` checkpointer) and `routeAfterClassify` |
| Classifier fast-path | `src/main/services/langgraph/research-agent.ts`, `detectFastPath`, consumed at the top of `classifyNode`; the LLM path is the `routerModel.invoke` call inside `classifyNode` |
| Six NON-graph handlers | dispatched imperatively inside `browserSubgraphNode`; defined as `comparisonNode`, `formNode`, `chartNode`, `externalSearchNode`, `internalKnowledgeNode`, `generalChatNode` in `src/main/services/langgraph/research-agent.ts` — none is passed to `.addNode` |
| Desktop path (no subgraph) | `src/main/services/langgraph/research-agent.ts`, `desktopAgentNode` — one call to `runPiDesktopTask`; the subgraph, planner, NL-postcondition verifier, recovery ladder and trajectory memory it replaced were deleted at the Pi cutover |
| Pi agent loop | `src/main/services/pi/agent.ts`, the `new Agent({...})` construction inside `PiDesktopAgent.run` and the `abort.ts` `withAbort` race around `agent.prompt()` |
| Event bridge | `src/main/services/pi/events.ts`, `dispatchAgentEvent` — an exhaustive switch over Pi's `AgentEvent` union, so a new arm is a type error rather than a silent drop |
| Toolbox (32 TypeBox tools) | `src/main/services/pi/toolbox.ts`, `createPiDesktopToolbox`; the name list is frozen by `src/main/services/pi/toolbox.test.ts` |
| Verifier opt-in (`details.verifies`, not a policy table) | `src/main/services/pi/toolbox.ts`, the `close_window` tool's `details.verifies: true`; there is **no** `DANGER_POLICY` and no `interrupt()` or denial branch any more |
| Turn abort | `src/main/ipc/chat-handlers.ts`, the `finally` that calls `abortPiDesktopRun()` on every exit path, plus `abortPiDesktopRun` / `withAbort` in `src/main/services/pi/` |
| Removed HITL resume | `chat:resumeGraph` and `desktop:confirmation-request` no longer exist; `src/main/ipc/chat-handlers.ts` has no resume path |
| Verifier thresholds | `src/main/services/desktop/verifier.ts`, the `PIXEL_DIFF_THRESHOLD` / `ACTION_EFFECT_MIN_DIFF` constants (0.01 / 0.02); the 0.4/0.4/0.2 weighted scorer belonged to `desktop-verifier.ts`, which is deleted |

Re-derived counts (grep, and again in `docs/architecture.md`): Ask=5, browser=8, document=9 → **22 nodes / 3 compiled graphs** (there is no desktop subgraph); **32** desktop tools; **59** `ipcMain.handle` channels (handlers 25, chat 11, mcp 10, browser 9, api-config 4). These match the brief.

## Re-render the SVGs

```bash
npx -y @mermaid-js/mermaid-cli -i docs/diagrams/system-context.mmd -o docs/diagrams/system-context.svg
# repeat for ask-routing and desktop-hitl
```

mermaid-cli drives headless Chromium via puppeteer. On a box where puppeteer's own Chrome download fails (as here), point it at an installed Chromium with a `puppeteer` config file: `... -c cfg.json` where `cfg.json` is `{"executablePath":"<path>/chrome.exe","headless":"true","args":["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]}`. The Playwright-installed Chromium under `%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/chrome.exe` works; the standalone `chrome-headless-shell` did not (crash 0xC000013B). Every `.svg` here is a real render of its `.mmd`, not hand-authored.

## What these diagrams deliberately do NOT show

- Not the browser (8-node) or document (9-node) subgraphs internally — only the top AskGraph references them as single boxes; see their `AGENTS.md`.
- Not the document subtree's two known defects — the `read` action dead-ending at the no-subtask guard in `executeActionNode` (`src/main/services/document/document-subgraph.ts`), and `uniqueFilePath` (`src/main/services/document/document-executor.ts`) overwriting an existing file instead of appending a counter — too much for these canvases.
- Not the IPC four-site sync surface, validation drift, or the push-channel list; that is `docs/architecture.md`.
- Not the `browser:executeTask` direct-IPC path that bypasses the browser subgraph.
- Not any worker threads, a second window, single-instance lock, or blur-to-hide — none of those exist in this codebase.
