# Architecture diagrams

> **Status**: live — every box was verified against the current checkout on the render date. Line-number citations rot on the next edit, so this file cites paths and symbol names instead (see `docs/AGENTS.md` rule 2); re-derive any count before trusting it. The `.mmd` files are the source of truth; the `.svg` files are renders. GitHub renders fenced `mermaid` natively and follows the viewer theme — embed a diagram by pasting its `.mmd` body into a ` ```mermaid ` block.

Three diagrams, drawn only from what the code does. Each arrow is labelled with its crossing mechanism (IPC channel, stdio JSON-RPC, HTTPS, FFI/DLL, COM, fs).

| File | Shows |
|---|---|
| `system-context.mmd` / `.svg` | Process topology + external boundaries: main / sandboxed preload / React renderer / tray, MCP stdio children, Playwright-driven Chromium, `es.exe`, LLM endpoint, DuckDuckGo/Tavily, `userData` stores, Win32/UIA/OCR, and the Alt+Space hook. |
| `ask-routing.mmd` / `.svg` | The 5-node AskGraph: `classify` → conditional → 3 subgraph branches → fan-in to `postProcessNode` → END, with the classifier fast-path, `MemorySaver`, and the six imperative handlers drawn as a **non-node** dispatch chain. |
| `desktop-hitl.mmd` / `.svg` | The desktop path: subgraph nodes + flat ReAct loop + `DANGER_POLICY` gate (29 safe / 2 reviewable / 1 dangerous) + `interrupt()` approve/deny + verify → recovery → memoryStore, and the tool→adapter→Win32/UIA/OCR layering. |

## Source-of-truth per box

Cited by path plus symbol. To re-check a box, open the file and find the named symbol.

| Element | Evidence |
|---|---|
| Sandbox + preload | `src/main/main.ts`, the module-scope `app.enableSandbox()` call; `src/main/windows.ts`, the `webPreferences` literal inside `createMainWindow` (`contextIsolation`, `nodeIntegration`, `sandbox`, and the `preload: '../preload/preload.cjs'` entry) |
| One window + tray + hook | `src/main/windows.ts`, `createMainWindow` (the `new BrowserWindow(options)` construction) and its `hookWindowMessage(WM_SYSCOMMAND)` handler that swallows `SC_KEYMENU`; `src/main/tray.ts`, `createTray`; `src/main/shortcuts.ts`, `setupWindowsGlobalHotkey` — the `SetWindowsHookExW(WH_KEYBOARD_LL, …)` install and the `messagePumpInterval` that keeps it alive |
| MCP stdio spawn | `src/main/services/mcp/client.ts`, `MCPService.initialize()` (the `new MultiServerMCPClient({ defaultToolTimeout: 30000, … })` construction); the Playwright server itself is declared in `mcp-config.json` at the repo root |
| `es.exe` / DuckDuckGo / Tavily | `src/main/utils/esRunner.ts`, `searchFiles`; `src/main/services/langgraph/tools.ts`, `searchTavily` (the `api.tavily.com` call) and `webSearchTool` (the `html.duckduckgo.com` scrape) |
| Win32/UIA/OCR | `src/main/services/desktop/input-simulation.ts`, `ensureLoaded` (the `koffi.load('user32.dll')` and `koffi.load('shell32.dll')` calls); `src/main/services/desktop/uia-native.ts`, the module-scope `require('node-winautomation')`; `src/main/services/desktop/windows-adapter.ts`, `ensureOcrWorker` (tesseract `createWorker`) |
| Persistence | `src/main/services/database/database-manager.ts`, the `initSqlJs`/`Database` imports from `sql.js` plus the `dbPath` assignment in the `DatabaseManager` constructor (`userData/desktop-agent.db`) — sql.js, not better-sqlite3 |
| AskGraph build + router | `src/main/services/langgraph/research-agent.ts`, `getAskGraph` (the `.addNode`/`.addEdge`/`.addConditionalEdges` chain and the `new MemorySaver()` checkpointer) and `routeAfterClassify` |
| Classifier fast-path | `src/main/services/langgraph/research-agent.ts`, `detectFastPath`, consumed at the top of `classifyNode`; the LLM path is the `routerModel.invoke` call inside `classifyNode` |
| Six NON-graph handlers | dispatched imperatively inside `browserSubgraphNode`; defined as `comparisonNode`, `formNode`, `chartNode`, `externalSearchNode`, `internalKnowledgeNode`, `generalChatNode` in `src/main/services/langgraph/research-agent.ts` — none is passed to `.addNode` |
| Desktop subgraph edges | `src/main/services/desktop/desktop-subgraph.ts`, the build chain ending in the exported `desktopSubgraph` compile; `executeSubtaskNode` drives the flat loop, `delegateToBrowserNode` is the cross-agent edge |
| Flat ReAct loop | `src/main/services/desktop/desktop-agent.ts`, `DesktopAgent.runReactLoop` |
| DANGER_POLICY + interrupt | `src/main/services/desktop/desktop-agent.ts`, the `DANGER_POLICY` const (29 safe / 2 reviewable / 1 dangerous); inside `runReactLoop`, the `file_operations` per-action override, the non-safe branch calling `interrupt()`, and its denial branch that pushes both a ToolMessage and a HumanMessage |
| HITL resume | `src/main/ipc/chat-handlers.ts`, the `chat:resumeGraph` handler registered inside `registerChatHandlers` (`new Command({ resume: … })`) |
| Verifier weights | `src/main/services/desktop/desktop-verifier.ts`, the `WEIGHT_WINDOW` / `WEIGHT_PIXEL_DIFF` / `WEIGHT_OCR` constants (0.4 / 0.4 / 0.2) and `HARD_REJECT_THRESHOLD` (<0.3) |

Re-derived counts (grep, and again in `docs/architecture.md`): Ask=5, browser=8, desktop=7, document=9 → **29 nodes / 4 compiled graphs**; **32** desktop tools; **60** `ipcMain.handle` channels (handlers 25, chat 12, mcp 10, browser 9, api-config 4). These match the brief.

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
