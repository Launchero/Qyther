# src/main/services/browser — Playwright-MCP browser family

Parent rail: `../AGENTS.md` (agent runtime); repo-wide rules in the root `AGENTS.md`. This doc is the binding contract for the `browser/` subtree. `skills/` has its own child doc.

## Purpose

Own browser automation as a Pi tool family. The shared `mcpService` connection exposes Playwright's `browser_*` tools; `pi/tools/browser-tools.ts` filters that connection by prefix and hands the matches to the one Ask agent. A second entry point — the direct-IPC `browser:executeTask` path — builds its own Pi `Agent` over the same tools. **There is no graph, no planner, no verifier and no recovery ladder here** — the model plans, and tool results are already visible to it.

## Ownership

| File | Lines | Owns |
|---|---|---|
| `stateful-browser-agent.ts` | 374 | The Pi `Agent` over `browser_*` tools, `executeTask`/`executeTaskStream`, session lifecycle, `drainPiRun` bridge |
| `browser-skill-loader.ts` | 230 | Two-pass `SKILL.md` catalog + load, `buildBrowserSkillSection(query)` |
| `browser-session-manager.ts` | 128 | Single-session lifecycle, inactivity close |
| `types.ts` | 64 | Shared interfaces (`BrowserAgentState`, `BrowserTaskProgress`, category enum) |

**Deleted, and do not restore:** `browser-subgraph.ts` (8-node `StateGraph`), `browser-planner.ts` and `browser-recovery.ts` (each built a `ChatOpenAI` and called `withStructuredOutput`), `browser-verifier.ts` (LLM postcondition grader; every tool result is already visible to the model, so an external grader cost a round trip and added no information), `browser-memory.ts` (trajectory store whose only writer was the graph's `memoryStore` node), `ui-detector.ts`. The `browser-memory` shutdown step is gone with the file.

## Local Contracts

- **Runtime target is Chromium via Playwright MCP**, not CDP, not Puppeteer, not the direct Playwright API, not an Electron webview. Server `npx @playwright/mcp` at repo-root `mcp-config.json`: flags `--headless --caps=vision`, env `PLAYWRIGHT_MCP_BROWSER=chromium`, `PLAYWRIGHT_MCP_TIMEOUT=60000`. Chromium binary installed by `npm run install-playwright`.
- **No browser tool is declared in this repo** — registration is a prefix filter `tool.name.startsWith('browser_')` (`pi/tools/browser-tools.ts`). Zero matches is a valid state (empty family, not a throw). **Never write a tool count into code or docs.** Across the six `SKILL.md` files 14 distinct `browser_*` names appear (navigate, snapshot, click, fill, type, hover, drag, scroll, select_option, tabs, wait, evaluate, take_screenshot, mouse_click_xy); the live server may expose more or fewer.
- **The toolbox is a filter, not a wrapper.** `pi/tools/browser-tools.ts` returns the `browser_*` subset of `mcpService.getTools()` unchanged — the Pi tools `mcp/client.ts` already built. A second wrapper layer would re-implement the never-throw contract and add a second place for it to drift. `browser-tools.test.ts` asserts the identity.
- **The single-connection rule is load-bearing.** `mcpService` owns the Playwright stdio child; a second adapter is a second child process. `stateful-browser-agent.ts` reads `this.browserTools` from `getBrowserToolbox()` and does not open its own connection.
- **Executor** is a Pi `Agent` (`stateful-browser-agent.ts:156`) with `toolExecution: 'sequential'` (same reason as the Ask loop — the renderer folds a completion onto the open step by matching the tool name). The model is Pi's (`getPiModel()`), not a local `ChatOpenAI`.
- **`stepTimeout` is declared and never read.** `browser-session-manager.ts` takes it as an option (`:18`) and stores it as a field with a 30 s default (`:24`), and nothing in `src/` ever reads the field — `grep -rn "stepTimeout" src/` returns those two lines and no usage. There is NO per-step limit; the effective timeout is the MCP env `PLAYWRIGHT_MCP_TIMEOUT=60000`. Do not document or code against a per-step timeout, and do not "wire up" the existing field as a side effect — that would create a limit the subtree has never had.
- **Entry points.** (1) The Ask loop — `pi/tools/browser-tools.ts` binds the family, and the model calls `browser_*` tools mid-turn. (2) Direct IPC — `browser:executeTask` calls `statefulBrowserAgent.executeTask()` (`../../ipc/browser-handlers.ts`), which runs the bare Pi agent with no planner, no verifier, no recovery. Skills are only loaded on the `executeTaskStream` path, which takes a `skillContext` string.
- **Skills are loaded at the prompt level, not the tool level.** `buildBrowserSkillSection(query)` returns matched `SKILL.md` text for the query, and `ask-prompt.ts` appends it to the system prompt when the `browser` family is bound. The old `skillRouter`/`loadSkills` pair in the deleted subgraph did the same thing as graph state before the planner ran — same material, read at the point it is useful.
- Screenshots are **not returned as images**; a skill must describe them (`skills/visual-interaction/SKILL.md`). There is no URL allowlist anywhere in this subtree.
- **The progress vocabulary on this path is mirrored, not declared — and that is the defect the Ask loop already fixed.** `stateful-browser-agent.ts` builds each `BrowserTaskProgress.status` through a private `inferStatusFromTool(toolName)` (`:280`, called at `:270`) that substring-matches the tool name onto `navigating` / `clicking` / `typing` / `executing`. The desktop side deleted exactly this shape at the Pi cutover and now ships `details.status` from the tool itself, so the two agent paths disagree about who owns the label: the Ask timeline is derived from declarations and survives a renamed tool, this one is a name table that silently reports `executing` for anything it does not recognise. It is live and reachable (`browser:executeTask` → `executeTask`), so it is not stale code — fixing it means the tools carrying their own status, not adding rows to the map.
- **Streaming** uses this subtree's own channels `browser:chunk` / `browser:progress` / `browser:error`, pushed via `event.sender.send` (`../../ipc/browser-handlers.ts`) → `src/preload/preload.ts` (`onChunk`/`onProgress`/`onError`) → `src/renderer/hooks/useBrowserState.ts`. It does not use the parent `chat:*` streaming contract.
- **Session** keeps one session and auto-closes after 5 min inactivity (`browser-session-manager.ts`), checked at the top of each task.
- **BUILD/PACKAGING GAP.** The `skills/` directory is never shipped. `electron.vite.config.ts` copies only `sql-wasm.wasm` and `Automation.node` into `out/main`, and `package.json` packages only `out/**/*` + `package.json`. At runtime `SKILLS_DIR = dirname(bundle)/skills` points at `out/main/skills`, which does not exist, so a production build hits the missing-dir branch and silently runs with zero skills. Skills are only observable under `npm run dev`. Do not add a copy step without a request.

## Work Guidance

- File shape: interfaces → class → `export const <camelCase> = new …` as the last line. Filenames kebab: `browser-<role>.ts`. Max 50 lines per function (root rail).
- Logger: `const log = createLogger("<PascalCaseKey>")` at module scope. The surviving `Browser*` names (`BrowserAgent`, `BrowserSessionMgr`, `BrowserSkillLoader`) are registered under `LOG_BROWSER` (`../../utils/logger.ts`); the deleted ones (`BrowserSubgraph`, `BrowserPlanner`, `BrowserVerifier`, `BrowserRecovery`, `BrowserMemory`) are removed from that registry. `logger.test.ts` gates that.
- Adding a skill: layout and front matter are in `skills/AGENTS.md`. The skill loader matches by description against the query; no planner hint is needed because there is no planner.
- Session teardown is split and partly outside this subtree: `browser:closeSession` delegates to `langChainAgent.closeBrowserSession()` (`../../ipc/browser-handlers.ts`), NOT to `statefulBrowserAgent.closeSession`; `browser:cleanup` calls both `statefulBrowserAgent.cleanup()` and `browserSessionManager.closeSession()`. Do not assume a single close path.
- **Quitting does not reach this subtree directly.** `main.ts`'s shutdown list has `browser-agent` (not `browser`), which calls `langChainAgent.cleanupBrowserAgent()`, which calls `statefulBrowserAgent.cleanup()` plus `browserSessionManager.closeSession()` itself. One owner, one call — do not add a second release path. Note what `browser:cleanup` does **not** do: it does not touch `mcpService`, so on the shared (config-driven) path the Playwright child survives it by design and is released by the `mcp` step at quit.

## Verification

- **The subtree itself is untested.** No test imports `stateful-browser-agent.ts` or `browser-session-manager.ts` directly. The `browser-tools.test.ts` file in `../pi/tools/` asserts the filter and the stateful agent's public surface, but does not construct an `Agent` or drive a live Playwright session.
- Real gates: `npm run typecheck`, `npm run lint` and `npm run test` all run in this checkout — `node_modules` is installed. Then `npm run dev` with Chromium installed (`npm run install-playwright`) and confirm the Playwright MCP server boots.
- Runtime signal, not a test: the logs print resolved counts — `[SkillLoader] Loading skill catalog from:` and `Loaded N skills from catalog` and `Loaded N browser tools`. A `Skills directory not found` warn means the packaging gap above bit.
- Do NOT cite `docs/WEB-TOOLS-GUIDE.md` for this subtree — it documents Cursor and calls the browser a "Browser-use MCP … fallback", contradicting the Playwright MCP reality; the root rail quarantines it.

## Child DOX Index

| Doc | Owns |
|---|---|
| `skills/AGENTS.md` | `SKILL.md` runtime prompt material: front-matter contract, routing by description, references/scripts layout |
