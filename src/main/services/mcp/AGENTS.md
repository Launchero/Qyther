# src/main/services/mcp — DOX child contract

Parent: `../AGENTS.md` (agent-runtime rail).

## Purpose

The MCP **client** layer: spawns/connects to external stdio/http MCP servers, exposes their tools to the LangGraph nodes and the ReAct agent, and filters which tools reach which intent.

## Ownership

- `client.ts` (199 lines) — `MCPService` class, config interfaces (`:12-21`), and the `mcpService` singleton (`:199`).
- `tool-router.ts` (80 lines) — prefix-based tool filtering maps.
- `mcp-config.json` at repo root — the server inventory (config, not code). **Untracked local file**: `.gitignore` ignores it, the live copy is machine-local, and a fresh clone creates it by copying the tracked `mcp-config.example.json` (whose `filesystem` example path is the placeholder `C:\Path\To\Your\Project`, not a real home directory).
- Read-only cross-boundary input: `prefs.mcp` from `src/main/preferences.ts` (enable/disable store, owned outside this folder).
- The IPC control surface (`src/main/ipc/mcp-handlers.ts`) is NOT owned here; its channel rules live in `src/main/ipc/AGENTS.md`.

## Local Contracts

- **Config file shape** is `MCPServerConfig` (`:12-17`): `command`, `args`, optional `disabled` (`:15`), optional `env`. A parse failure or missing `mcp-config.json` degrades to `{}` with a warn log (`:135-149`) — "no servers" is never a crash, so check the warn line before assuming the file loaded.
- **Client-only, verified**: `McpServer` / `StdioServerTransport` have zero hits in `src/` **code**. This repo's `src/` hosts NO MCP server; never write server code here. The one server in the repository is the UI harness at `scripts/harness/mcp-server.mjs`, which is outside this subtree and outside `src/`. **Dependency truth**: `@langchain/mcp-adapters` is the only MCP package `src/` imports (`client.ts:1`, and the browser subtree's own fallback client). `@modelcontextprotocol/sdk` is now a declared `devDependency` — for `scripts/harness/mcp-server.mjs` only, never for `src/`. `langsmith` is gone.
- **Init gate**: `initialize()` (`:37-133`) is gated on `prefs.mcp.enabled` (`:43`) — disabled preferences mean zero tools and a silent no-op, not an error. It is idempotent via `isInitializedFlag` (`:33`). If the merge yields no servers — including the common fresh-clone case where the untracked `mcp-config.json` is absent — init logs `No MCP servers enabled` and returns with `isInitialized()` still false (`:100-103`); the graph then runs without MCP tools silently (`research-agent.ts:195-197`). A missing config degrades to "no servers" with a warn (`loadFromConfigFile`, `:136-139`), never a crash.
- **Config merge precedence** (`:49-98`), in order:
  - `mcp-config.json` entries load via `loadFromConfigFile` (`:135`), whose path is built from `MCP_CONFIG_PATH = join(PROJECT_ROOT, "mcp-config.json")` (`:28`). `PROJECT_ROOT` (`:27`) is derived from `import.meta.url` as `join(dirname(fileURLToPath(import.meta.url)), '../..')` — **not** bare `__dirname`, which is undefined at this module's scope because `main.ts` installs its global polyfill only after this module is evaluated (in-code comment `:23-26`). The main bundle is emitted as a single `out/main/main.js`, so `../..` from the bundle resolves to the **repository root in dev** and the **app root in a packaged build**; `electron-builder` does not ship `mcp-config.json` (it is outside `build.files` and gitignored), so a packaged build falls into the missing-config branch and loads zero config-file servers.
  - A config server is dropped if `disabled: true` in the JSON **or** if preferences enable other servers but not it (`:64-66`).
  - Preferences may additionally contribute stdio/http servers absent from the config file (`:79-97`); http is the only non-stdio transport supported.
- **Warm-up**: `initializeWithRetry` (`:151`, 3 attempts, linear backoff) is called from `src/main/main.ts:100` during startup; failure there is logged as a warning, not fatal (`main.ts:102-104`) — the deferred path is the IPC one below.
- **IPC re-init/teardown**: `src/main/ipc/mcp-handlers.ts` calls `mcpService.initialize()` at `:10,54,111,140` and `cleanup()` at `:110`; `main.ts:182` calls `cleanup()` on `will-quit`. `initialize()` is idempotent via `isInitializedFlag` (`:33`) — re-init after `cleanup()` is the supported restart route.
- **Client mechanics**: built on `MultiServerMCPClient` from `@langchain/mcp-adapters` (`:1`), constructed with `defaultToolTimeout: 30000` (`:105-108`). `cleanup()` (`:186-196`) closes the client and resets all state — call it on shutdown, not between turns.
- **Tool attribution**: `serverToolCounts` (`:115-126`) counts tools per server by `"<server>-"` name prefix, with a fallback that credits all tools to the single server when prefix matching finds none (`:123-125`). Prefix-naming matters for stats reporting (`getServerToolCounts()`, `:182`).
- **Consumers**: tools reach the model via `getMCPModelForIntent` (`langgraph/research-agent.ts:194-221`) and the ReAct agent in `langchain/agent.ts`; this folder only exposes `getTools()` (`:166`) and `getToolsByPrefix()` (`:170`).
- **Two-map rule (`tool-router.ts`)**: tools are selected by name prefix with TWO maps that MUST both be edited for a new server — `INTENT_TOOL_MAP` (`:13-19`) and `KEYWORD_TOOL_MAP` (`:24-43`). Matching tolerates `_`/`-` variants (`:55-60`, mirrored in `research-agent.ts:204-209`). Editing only one = server loads but never reaches the model on keyword (or intent) paths.
- **Adding a tool = editing `mcp-config.json`, not code.** Code changes are only needed to add a new *server prefix* to the router maps.
- **Stale doc**: `MCP-CONFIG.md:34-38` claims a `USE_MCP=true` env flag gates MCP — it is read nowhere in `src/`. Do not cite or honour it; the gate is `prefs.mcp.enabled`.

## Work Guidance

- Add an MCP server, full recipe: ⓪ on a fresh clone `cp mcp-config.example.json mcp-config.json` first — the live file is untracked and does not exist in the repo ① entry in `mcp-config.json` (`command`/`args`/`env`, optional `disabled`) ② ensure it is enabled in preferences ③ add its tool-name prefix to BOTH `INTENT_TOOL_MAP` and `KEYWORD_TOOL_MAP` ④ restart dev and confirm the `Initialized with N tools across M servers` line (`client.ts:128`) and `getServerToolCounts()` (`:182`).
- `INTENT_TOOL_MAP` keys are the exact intent strings `classifyNode` can emit (`research`, `general`, `browser`, `desktop`, `document`) — a map entry under any other key is dead code, and a new intent needs entries in both systems.
- Server tools missing at runtime: check the `disabled`/`prefEnabledNames` gate (`:64-66`) before suspecting the spawn.
- Do not add per-server custom connection code — stdio and http are the only transports (`:70-97`).
- Tool names follow `<serverPrefix>_<tool>`; both router maps and `serverToolCounts` depend on that prefix convention — a server whose tools lack its prefix is invisible to routing and mis-attributed in stats.
- After any config change, restart via the IPC path (`mcp-handlers.ts` re-`initialize()`s, `:110` cleans up first); there is no file watcher.
- Temporarily disable a server with `disabled: true` in its (untracked) `mcp-config.json` entry (`client.ts:15`) rather than deleting it; the preferences enabled-set (`client.ts:56-60`) is a second, independent switch — a server loads only when both allow it.
- Invariant to preserve: `grep -rn "McpServer\|StdioServerTransport" src/ --include="*.ts" --include="*.tsx"` must stay empty (client-only contract). Scope it to code — this doc and `src/main/ipc/AGENTS.md` name the strings while banning them, so an unscoped grep always matches itself.
- Per-server secrets go in the entry's `env` block (`client.ts:74` passes `cfg.env` to the spawned process) — not in the app's top-level env, so each server keeps its own override. Since the live `mcp-config.json` is untracked, secrets in it stay machine-local and out of git.
- This folder exposes no channel strings; every renderer-facing `mcp:*` channel and its validation lives in `src/main/ipc/mcp-handlers.ts` under the `ipc/AGENTS.md` four-site rule.

## Verification

- Nothing in `mcp/` is tested. Gates: `npm run typecheck`, then `npm run dev` and read the MCP log line at `client.ts:128` (tool/server counts). `node_modules` may be absent — `npm install` first.
- On a fresh clone, `mcp-config.json` does not exist (untracked): expect the `MCP config not found at …` warn (`client.ts:137`) and zero config-file servers until you `cp mcp-config.example.json mcp-config.json`.
- Negative check worth running manually: point one config entry at a bogus `command` and confirm `initializeWithRetry` retries 3× (`:151-164`) and startup still succeeds (`main.ts:102-104`), proving the failure path is non-fatal.

## Child DOX Index

No child docs. Browser-tool serving happens through the external Playwright MCP server; its usage contract lives in `../browser/AGENTS.md`.
