# src/main/services/mcp — DOX child contract

Parent: `../AGENTS.md` (agent-runtime rail).

## Purpose

The MCP **client** layer: spawns/connects to external stdio/http MCP servers, exposes their tools to the LangGraph nodes and the ReAct agent, and filters which tools reach which intent.

## Ownership

- `client.ts` (195 lines) — `MCPService` class, config interfaces (`:11-20`), and the `mcpService` singleton (`:195`).
- `tool-router.ts` (80 lines) — prefix-based tool filtering maps.
- `mcp-config.json` at repo root — the server inventory (config, not code).
- Read-only cross-boundary input: `prefs.mcp` from `src/main/preferences.ts` (enable/disable store, owned outside this folder).
- The IPC control surface (`src/main/ipc/mcp-handlers.ts`) is NOT owned here; its channel rules live in `src/main/ipc/AGENTS.md`.

## Local Contracts

- **Config file shape** is `MCPServerConfig` (`:11-16`): `command`, `args`, optional `disabled`, optional `env`. A parse failure or missing `mcp-config.json` degrades to `{}` with a warn log (`:132-144`) — "no servers" is never a crash, so check the warn line before assuming the file loaded.
- **Client-only, verified**: `McpServer` / `StdioServerTransport` have zero hits in `src/`. This repo hosts NO MCP server. Never write server code here.
- **Init gate**: `initialize()` (`:33-129`) is gated on `prefs.mcp.enabled` (`:39`) — disabled preferences mean zero tools and a silent no-op, not an error. It is idempotent via `isInitializedFlag` (`:34`). If the merge yields no servers, init logs `No MCP servers enabled` and returns with `isInitialized()` still false (`:96-99`); the graph then runs without MCP tools silently (`research-agent.ts:195-197`).
- **Config merge precedence** (`:44-94`), in order:
  - `mcp-config.json` entries load via `loadFromConfigFile` (`:131`), resolved from `PROJECT_ROOT` (`:23-24`) — repo root, not cwd.
  - A config server is dropped if `disabled: true` in the JSON **or** if preferences enable other servers but not it (`:60-62`).
  - Preferences may additionally contribute stdio/http servers absent from the config file (`:75-93`); http is the only non-stdio transport supported.
- **Warm-up**: `initializeWithRetry` (`:147`, 3 attempts, linear backoff) is called from `src/main/main.ts:100` during startup; failure there is logged as a warning, not fatal (`main.ts:102-104`) — the deferred path is the IPC one below.
- **IPC re-init/teardown**: `src/main/ipc/mcp-handlers.ts` calls `mcpService.initialize()` at `:10,54,111,140` and `cleanup()` at `:110`; `main.ts:182` calls `cleanup()` on `will-quit`. `initialize()` is idempotent via `isInitializedFlag` (`:34`) — re-init after `cleanup()` is the supported restart route.
- **Client mechanics**: built on `MultiServerMCPClient` from `@langchain/mcp-adapters` (`:1`), constructed with `defaultToolTimeout: 30000` (`:101-104`). `cleanup()` (`:182-192`) closes the client and resets all state — call it on shutdown, not between turns.
- **Tool attribution**: `serverToolCounts` (`:110-122`) counts tools per server by `"<server>-"` name prefix, with a fallback that credits all tools to the single server when prefix matching finds none (`:119-121`). Prefix-naming matters for stats reporting (`getServerToolCounts()`, `:178`).
- **Consumers**: tools reach the model via `getMCPModelForIntent` (`langgraph/research-agent.ts:194-221`) and the ReAct agent in `langchain/agent.ts`; this folder only exposes `getTools()` (`:162`) and `getToolsByPrefix()` (`:166`).
- **Two-map rule (`tool-router.ts`)**: tools are selected by name prefix with TWO maps that MUST both be edited for a new server — `INTENT_TOOL_MAP` (`:13-19`) and `KEYWORD_TOOL_MAP` (`:24-43`). Matching tolerates `_`/`-` variants (`:55-60`, mirrored in `research-agent.ts:204-209`). Editing only one = server loads but never reaches the model on keyword (or intent) paths.
- **Adding a tool = editing `mcp-config.json`, not code.** Code changes are only needed to add a new *server prefix* to the router maps.
- **Stale doc**: `MCP-CONFIG.md:34-38` claims a `USE_MCP=true` env flag gates MCP — it is read nowhere in `src/`. Do not cite or honour it; the gate is `prefs.mcp.enabled`.

## Work Guidance

- Add an MCP server, full recipe: ① entry in `mcp-config.json` (`command`/`args`/`env`, optional `disabled`) ② ensure it is enabled in preferences ③ add its tool-name prefix to BOTH `INTENT_TOOL_MAP` and `KEYWORD_TOOL_MAP` ④ restart dev and confirm the `Initialized with N tools across M servers` line (`client.ts:124`) and `getServerToolCounts()` (`:178`).
- `INTENT_TOOL_MAP` keys are the exact intent strings `classifyNode` can emit (`research`, `general`, `browser`, `desktop`, `document`) — a map entry under any other key is dead code, and a new intent needs entries in both systems.
- Server tools missing at runtime: check the `disabled`/`prefEnabledNames` gate (`:60-62`) before suspecting the spawn.
- Do not add per-server custom connection code — stdio and http are the only transports (`:66-93`).
- Tool names follow `<serverPrefix>_<tool>`; both router maps and `serverToolCounts` depend on that prefix convention — a server whose tools lack its prefix is invisible to routing and mis-attributed in stats.
- After any config change, restart via the IPC path (`mcp-handlers.ts` re-`initialize()`s, `:110` cleans up first); there is no file watcher.
- Temporarily disable a server with `disabled: true` in the config entry (`:14`) rather than deleting it; the preferences enabled-set (`:52-56`) is a second, independent switch — a server loads only when both allow it.
- Invariant to preserve: `grep -rn "McpServer\|StdioServerTransport" src/` must stay empty (client-only contract).
- Per-server secrets go in the entry's `env` block (`client.ts:70` passes `cfg.env` to the spawned process) — not in the app's top-level env, so each server keeps its own override.
- This folder exposes no channel strings; every renderer-facing `mcp:*` channel and its validation lives in `src/main/ipc/mcp-handlers.ts` under the `ipc/AGENTS.md` four-site rule.

## Verification

- Nothing in `mcp/` is tested. Gates: `npm run typecheck`, then `npm run dev` and read the MCP log line at `client.ts:124` (tool/server counts). `node_modules` may be absent — `npm install` first.
- Negative check worth running manually: point one config entry at a bogus `command` and confirm `initializeWithRetry` retries 3× (`:147-160`) and startup still succeeds (`main.ts:102-104`), proving the failure path is non-fatal.

## Child DOX Index

No child docs. Browser-tool serving happens through the external Playwright MCP server; its usage contract lives in `../browser/AGENTS.md`.
