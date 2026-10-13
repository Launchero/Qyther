# src/main/services/browser — Playwright-MCP browser subgraph

Parent rail: `../AGENTS.md` (agent runtime); repo-wide rules in the root `AGENTS.md`. This doc is the binding contract for the `browser/` subtree. `skills/` has its own child doc.

## Purpose

Own browser automation as an 8-node LangGraph subgraph: retrieve past trajectories, route on-disk SKILL.md material, plan the task into verifiable subtasks, drive **Chromium through the Playwright MCP stdio server** to execute each subtask, verify postconditions, and recover on failure. Skills are read from disk at runtime and become prompt text.

## Ownership

| File | Lines | Owns |
|---|---|---|
| `browser-subgraph.ts` | 560 | 8-node `StateGraph`, `BrowserSubGraphState`, wrapper `executeBrowserSubgraph` |
| `stateful-browser-agent.ts` | 399 | ReAct executor, `browser_` tool resolution, streaming |
| `browser-skill-loader.ts` | 210 | two-pass SKILL.md catalog + load (rules in `skills/AGENTS.md`) |
| `browser-memory.ts` | 185 | sql.js trajectory store under `userData/browser-memory` |
| `browser-session-manager.ts` | 128 | single-session lifecycle, inactivity close |
| `browser-planner.ts` | 109 | LLM task→subtask planner |
| `browser-recovery.ts` | 101 | 5-strategy recovery |
| `browser-verifier.ts` | 90 | LLM postcondition verifier |
| `types.ts` | 64 | shared interfaces (`BrowserSubtask`, category enum, etc.) |
| `ui-detector.ts` | 127 | **DEAD** — payload detection, zero importers (see Contracts) |

## Local Contracts

- **Runtime target is Chromium via Playwright MCP**, not CDP, not Puppeteer, not the direct Playwright API, not an Electron webview. Server `npx @playwright/mcp` at repo-root `mcp-config.json:15-24`: flags `--headless --caps=vision`, env `PLAYWRIGHT_MCP_BROWSER=chromium`, `PLAYWRIGHT_MCP_TIMEOUT=60000`. Chromium binary installed by `npm run install-playwright` (`package.json:16`).
- **No browser tool is declared in this repo** — registration is a prefix filter `tool.name?.startsWith('browser_')` (`stateful-browser-agent.ts:60-62` shared path, `:77-79` fallback path); zero matches throws (`:84-86`). **Never write a tool count into code or docs.** Across the six SKILL.md files 14 distinct `browser_*` names appear (navigate, snapshot, click, fill, type, hover, drag, scroll, select_option, tabs, wait, evaluate, take_screenshot, mouse_click_xy); the live server may expose more or fewer.
- Individual tools are fetched by exact name via `getMcpTools()` (`stateful-browser-agent.ts:206-208`) — e.g. `browser_snapshot` (`browser-verifier.ts:36`), `browser_evaluate` (`stateful-browser-agent.ts:370`). The in-repo fallback client spins its own `npx @playwright/mcp@latest` stdio client and applies the same prefix filter (`stateful-browser-agent.ts:68-81`); note it omits the `--headless --caps=vision` flags that `mcp-config.json` passes.
- **Executor** is a LangChain `createReactAgent` with a `MemorySaver` checkpointer keyed `thread_id: sessionId` (`stateful-browser-agent.ts:108-112`; streamEvents `:153-156`, `:195-198`). `maxSteps = 10` (`:41`). The executor model runs `temperature 0.7` (`:104`).
- **`stepTimeout` is dead.** `stepTimeout = 30000` is declared at `stateful-browser-agent.ts:42` and `browser-session-manager.ts:24` and referenced only by the optional interface field `browser-session-manager.ts:18` — read nowhere. There is NO 30s per-step limit; the effective timeout is the MCP env `PLAYWRIGHT_MCP_TIMEOUT=60000`. Do not document or code against a per-step timeout.
- **Orchestration = 8-node subgraph** (`browser-subgraph.ts:477-518`): `memoryRetrieve → skillRouter → loadSkills → planner → executeSubtask ⇄ (verifier | recovery) → memoryStore`. Compiled `:518`, wrapper `executeBrowserSubgraph` `:525-560`. Routers are pure functions returning node-name strings wired in explicit conditional-edge maps (`:494-514`).
- **Entry points.** (1) AskGraph classify → browser node (`../langgraph/research-agent.ts:463`), which delegates to `executeBrowserSubgraph` only at its step-8 browser branch (`:536`) — the comparison/form/chart fast paths there are NOT this subtree. (2) direct IPC (`../../ipc/browser-handlers.ts:10-185`). (3) cross-agent delegation from desktop (`../desktop/desktop-subgraph.ts:296`) and document (`../document/document-delegation.ts:61`).
- **Result shape.** `executeBrowserSubgraph` returns `{finalResponse, actions, executionTrace, uiPayloads}` (`browser-subgraph.ts:525-560`). The `uiPayloads` state reducer (`:76-79`) is never populated by any browser node, so the field is always `[]`. `ui-detector.ts` (table/chart/comparison/form detection) has zero importers anywhere in `src/` — it is dead code and does NOT emit UI cards. Generative-UI cards on the browser path come from the AskGraph wrapper, not this subtree.
- **The direct IPC path bypasses the subgraph.** `browser:executeTask` calls `statefulBrowserAgent.executeTask()` (`../../ipc/browser-handlers.ts:63`), which runs the bare ReAct executor with no planner, no verifier, no recovery and **no skills** (`stateful-browser-agent.ts:128-159`). Only the subgraph's `executeSubtask` node uses `executeTaskStream` with the loaded `skillContext` (`browser-subgraph.ts:235`). Skills and the plan/verify loop therefore apply only to the graph/delegation entry points, not to `browser:executeTask`.
- Screenshots are **not returned as images**; a skill must describe them (`skills/visual-interaction/SKILL.md:52`). There is no URL allowlist anywhere in this subtree.
- **Streaming** uses this subtree's own channels `browser:chunk` / `browser:progress` / `browser:error`, pushed via `event.sender.send` (`../../ipc/browser-handlers.ts:57,69,88`) → `src/preload/preload.ts:358-377` (`onChunk`/`onProgress`/`onError`) → `src/renderer/hooks/useBrowserState.ts:32-56`. It does not use the parent `chat:*` streaming contract.
- **Memory** persists `trajectories` rows via sql.js to `userData/browser-memory/trajectories.db` (`browser-memory.ts:11-12`, schema `:41-52`); `retrieve()` returns only `success = 1` rows matched on task keywords (`:92-135`). **Session** keeps one session and auto-closes after 5 min inactivity (`browser-session-manager.ts:25`, checked `:56-60`). **Recovery** has 5 strategies — retry | alternative | replan | skip | abort (`types.ts:54`, `browser-recovery.ts:17`) and hard-aborts when `recoveryCount ≥ 3` (`browser-recovery.ts:30-36`). **Planner** stamps `maxRetries: 2` on every subtask (`browser-planner.ts:78`, `:104`); the prompt says "Maximum 10 subtasks" (`:56`) but `validatePlan` only rejects `>50` (`:86-91`).
- **BUILD/PACKAGING GAP.** The `skills/` directory is never shipped. `electron.vite.config.ts:11-49` copies only `sql-wasm.wasm` and `Automation.node` into `out/main`, and `package.json:39-42` packages only `out/**/*` + `package.json`. At runtime `SKILLS_DIR = dirname(bundle)/skills` (`browser-skill-loader.ts:10-11`) points at `out/main/skills`, which does not exist, so a production build hits the missing-dir branch (`browser-skill-loader.ts:29-32`) and silently runs with zero skills. Skills are only observable under `npm run dev`. Do not add a copy step without a request.

## Work Guidance

- File shape: interfaces → class → `export const <camelCase> = new …` as the last line (`browser-planner.ts:109`, `browser-verifier.ts:90`, `browser-recovery.ts:101`, `browser-skill-loader.ts:210`, `browser-memory.ts:185`, `stateful-browser-agent.ts:399`). Filenames kebab: `browser-<role>.ts`. Max 50 lines per function (root rail).
- Logger: `const log = createLogger("<PascalCaseKey>")` at module scope. Only `BrowserHandlers`, `BrowserAgent`, `BrowserSessionMgr` are registered for the `LOG_BROWSER` gate (`../../utils/logger.ts:67-69`); `BrowserSubgraph`, `BrowserSkillLoader`, `BrowserPlanner`, `BrowserVerifier`, `BrowserRecovery`, `BrowserMemory` are NOT, so they inherit `globalLevel` and their `info`/`debug` lines are suppressed in production. Add a `SUBSYSTEM_ENV_VARS` entry when a subsystem must be individually gated.
- Structured-output nodes use `withStructuredOutput(zodSchema, { method: "jsonMode" })` with a deterministic fallback on throw and `temperature ≤ 0.2`: planner (`browser-planner.ts:36-39`, temp 0.2), verifier (`browser-verifier.ts:47-50`, temp 0.1), recovery (`browser-recovery.ts:56-59`, temp 0.1).
- Node shape: `async function xNode(state: any) { return traceNode("x", inputSummary, async () => { … })(state) }` returning a `Partial` state; `traceNode` (`browser-subgraph.ts:84-125`) records the `executionTrace`. New node = `.addNode` + wire edges (`:477-516`) + register the router map; never mutate state.
- Adding a skill: layout and front matter are in `skills/AGENTS.md`. A new skill MUST also be added to the planner's SKILL ASSIGNMENT HINTS (`browser-planner.ts:58-64`) or the planner never assigns it.
- Session teardown is split and partly outside this subtree: `browser:closeSession` delegates to `langChainAgent.closeBrowserSession()` (`../../ipc/browser-handlers.ts:102`), NOT to `statefulBrowserAgent.closeSession` (`stateful-browser-agent.ts:309-328`); `browser:cleanup` calls both `statefulBrowserAgent.cleanup()` (`:330-346`, closes the fallback MCP client) and `browserSessionManager.closeSession()` (`browser-session-manager.ts:81-89`). Do not assume a single close path.

## Verification

- **The whole subtree and the skill loader are untested.** No test imports any browser module. The only two test files, `../../ipc/handlers.test.ts` and `../langgraph/research-agent.test.ts`, do not exercise this code — the latter only carries `browserSessionId: ''` in a state fixture (`research-agent.test.ts:42`).
- Real gates: `npm run typecheck` and `npm run lint` (`node_modules` is absent in this checkout — `npm install` first, `npx electron-rebuild`). Then `npm run dev` with Chromium installed (`npm run install-playwright`) and confirm the Playwright MCP server boots.
- Runtime signal, not a test: the logs print resolved counts — `[SkillLoader] Loading skill catalog from:` and `Loaded N skills from catalog` (`browser-skill-loader.ts:27,51`) and `Loaded N browser tools` (`stateful-browser-agent.ts:88`). A `Skills directory not found` warn (`browser-skill-loader.ts:29-32`) means the packaging gap above bit.
- Do NOT cite `docs/WEB-TOOLS-GUIDE.md` for this subtree — it documents Cursor and calls the browser a "Browser-use MCP … fallback", contradicting the Playwright MCP reality; the root rail quarantines it. The tracked root `browser-agent.md` is a 0-byte stub superseded by this doc.

## Child DOX Index

| Doc | Owns |
|---|---|
| `skills/AGENTS.md` | `SKILL.md` runtime prompt material: front-matter contract, routing by description, references/scripts layout |
