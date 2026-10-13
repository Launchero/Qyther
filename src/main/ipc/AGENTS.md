# src/main/ipc — IPC surface contract

Parent rails: `../../../AGENTS.md` (repo) and `../AGENTS.md` (host shell). This doc owns the whole IPC surface **including `src/preload/`**, because a channel is only meaningful across both trees. `src/preload/` has no doc of its own; do not create one.

## Purpose

Own every `ipcMain.handle` ↔ `ipcRenderer.invoke`/`.on` bridge: channel naming, request validation, error shape, main→renderer push plumbing, and the registry maps a handler author must touch. Renderer business logic and main-process boot ordering are out of scope here.

## Ownership

| File | Lines | Channels registered | Owns |
|---|---|---|---|
| `handlers.ts` | 380 | 25 | `app:*`, `window:*`, `command:*`, `url:*`, `file:*`, `apps:list`, `dialog:*`, `debug:log`; calls the chat/MCP registrars (`:16-17`) |
| `chat-handlers.ts` | 869 | 12 | `chat:*`, streaming pump, `NODE_AGENT_MAP`, HITL resume |
| `mcp-handlers.ts` | 172 | 10 | `mcp:*` **plus two `browser:*` channels** (`:147`, `:162`) |
| `browser-handlers.ts` | 186 | 9 | `browser:*` session/task lifecycle + progress push |
| `api-config.ts` | 178 | 4 | `api-config:*` |
| `handlers.test.ts` | 113 | — | See Verification: tests a local copy, not this surface |
| `src/preload/preload.ts` | 419 | 56 invokes, 15 listeners | The single `electronAPI` bridge object |

## Local Contracts

- **Channel naming is `namespace:camelCaseVerb`.** Namespaces in use: `app`, `window`, `command`, `url`, `file`, `apps`, `dialog`, `debug`, `chat`, `mcp`, `browser`, `api-config`. Known three-segment exceptions: `file:everything:status` (`handlers.ts:313`), `desktop:screenshot:capture` (`preload.ts:64`). Do not add a third segment casually.
- **Every channel is four hand-synced sites**: channel string in `preload.ts` → `ipcMain.handle` in `src/main/ipc/*` → call site in the renderer → type at `src/renderer/types/electron.d.ts`, which is `typeof electronAPI` re-exported from `preload.ts:419`. There is no schema and no codegen; the compiler will not catch a missing site.
- **Registrars**: `registerIPCHandlers()` (`handlers.ts:15`) ← `main.ts:109`, and it calls `registerChatHandlers()` (`:16`, defined `chat-handlers.ts:186`) + `registerMCPHandlers()` (`:17`, defined `mcp-handlers.ts:7`). `registerApiConfigHandlers()` (`api-config.ts:134`) ← `main.ts:112` and `registerBrowserHandlers()` (`browser-handlers.ts:9`) ← `main.ts:115`. A new handler file needs its own `registerXxxHandlers()` wired into one of those three call sites — `ipcMain.handle` throws on duplicate registration, so registrars must stay idempotent.
- **Validation is split and asymmetric, and there are no shared validators.** `validateUrl`/`validatePath`/`isCommandSafe` exist **only** as local functions inside `handlers.test.ts:6,48,82`; production checks logic inline. Actual sites:

| Channel | Preload check | Main check |
|---|---|---|
| `command:execute` | blocklist `rm -rf`/`del /s`/`format`/`shutdown` (`preload.ts:188-193`) | none — raw `promisify(exec)` (`handlers.ts:128-141`) |
| `file:search` | metachar blocklist `&& \|\| ; \| & > < ^` (`preload.ts:231`), ≤500 chars (`:238`) | none (`handlers.ts:261`) |
| `url:open` | `startsWith('http')` (`preload.ts:201`) | `URL` parse + `http:`/`https:` allowlist (`handlers.ts:146-150`) |
| `file:open` | type only (`preload.ts:211`) | length ≤1000 + backslash pattern (`handlers.ts:162-168`) |
| `file:revealInFolder` | type only (`preload.ts:217`) | **none** — raw `shell.showItemInFolder` (`handlers.ts:182-184`) |

  `command:execute` is the most dangerous surface in the repo: its only guard runs in the renderer-reachable preload layer, so any direct `ipcRenderer.invoke` bypasses it. If you tighten validation, tighten both layers in the same change.
- **Three error idioms coexist; pick deliberately.** (a) Result envelope `{ success, output?, error? }` with the throw swallowed into `log.error` — `command:execute` (`handlers.ts:128`), `url:open` (`:144`), `file:open` (`:160`); (b) re-thrown across IPC — `window:setMode` (`handlers.ts:61`), `file:search` (`:308`), `browser:executeTask` (`browser-handlers.ts:45`); (c) swallowed with a fallback value — `window:getMode`/`toggleMode` return `'compact'` (`handlers.ts:71,80`), `window:getHeight` returns `600` (`:120,123`). Narrow with `err instanceof Error ? err.message : err`.
- **Push plumbing**: main uses `webContents.send`, preload subscribes once at module scope and re-dispatches a DOM `CustomEvent` — `window:shown` → `electron-window-shown` (`preload.ts:47-51`), `window:will-hide` → `electron-window-will-hide` (`:54-56`), `window:modeChanged` → `electron-window-mode-changed` (`:59-61`). Streaming channels bind inside `electronAPI` closures instead. Every `onXxx(cb)` **must** return an `ipcRenderer.removeListener` unsubscribe (`preload.ts:280-345`); the renderer relies on it for cleanup.
- **MUST-REGISTER maps for a handler author touching chat streaming**: new graph node label → `NODE_AGENT_MAP` (`chat-handlers.ts:32-38`); new emitting node → the `responseNodes` whitelist (`chat-handlers.ts:400-403`) **and its duplicate** (`:720-723`) — miss either and the node streams nothing at all, with no error.
- **Cross-namespace registration is a live landmine**: `browser:initializeAgent` (`mcp-handlers.ts:147`) and `browser:getStatus` (`:162`) are registered by `registerMCPHandlers`, not by `registerBrowserHandlers`. Grep `ipcMain.handle` across all five files before assuming where a `browser:*` channel lives.
- **`src/preload/types.d.ts` is a stale hand-maintained duplicate** — never extend it. The single bridge is `export const electronAPI` (`preload.ts:161`) exposed via `contextBridge.exposeInMainWorld('electronAPI', electronAPI)` (`:411`). Preload runs sandboxed as compiled CJS and cannot import from `src/main`; `WindowMode` is re-declared locally (`preload.ts:44`).
- The `// #region agent log` block (`preload.ts:3-39`) is debug scaffolding: `logToServer` is inert unless `LOG_PRELOAD=true` and refuses any endpoint that is not `127.0.0.1`/`localhost` (`:15-17`). Do not extend it into a feature.

## Work Guidance

- Add a channel in one pass across all four sites; name it `namespace:camelCaseVerb`; return either a plain value or `{ success, error? }` — never a bare `throw` for a channel the renderer does not wrap.
- Keep handlers thin and under 50 lines (root rail); delegate to `src/main/services/*`.
- Validate in main, not only in preload — main is the only boundary the sandbox actually guarantees.
- Do not add a `browser:*` handler to `mcp-handlers.ts`; consolidate new ones in `browser-handlers.ts` and treat the two existing stragglers as debt to move deliberately.

## Verification

`node_modules` is absent in this checkout, so `npm run typecheck` (`package.json:11`), `npm run lint` (`:12`) and `npm run test` (`:13`) need `npm install` first. **`handlers.test.ts` verifies a copy, not the shipped surface**: it imports only `describe/it/expect` from vitest, imports nothing from production code, and re-declares `validateUrl`/`validatePath`/`isCommandSafe` inline (`:6,48,82`) — functions that do not exist in `handlers.ts` or `preload.ts`. A green `npm run test` proves nothing about IPC. All 60 handlers are untested.

Real gate: `npm run typecheck`, then `npm run dev` and exercise the touched channel from the renderer (Alt+Space → palette → run the feature). Re-run the drift greps below after any channel add/remove/rename; they are the only automated check this layer has.

```bash
grep -rhoE "ipcMain\.handle\(\s*['\"][^'\"]+" src/main | sed -E "s/.*\(\s*['\"]//" | sort -u
grep -rhoE "ipcRenderer\.invoke\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//" | sort -u
grep -rhoE "ipcRenderer\.on\(\s*['\"][^'\"]+" src/preload | sed -E "s/.*\(\s*['\"]//" | sort -u
grep -rhoE "\.send\(\s*['\"][^'\"]+" src/main | sed -E "s/.*\(\s*['\"]//" | sort -u
```

`comm` the sets. Current counts: 60 handlers, 56 invokes, 15 listeners, 10 senders. Every invoke has a handler.

**Drift list (broken bridges, not absent features — do not delete these handlers/listeners as dead code; they are half-wired and need a counterpart):**

- Handlers registered, unreachable from the renderer: `browser:initialize` (`browser-handlers.ts:10`), `browser:executeTask` (`:42`), `browser:cleanup` (`:152`), `mcp:initialize` (`mcp-handlers.ts:8`). Note `preload.ts:350` invokes `browser:initializeAgent`, a *different* channel, so `browser:initialize` is shadowed by it.
- Preload listeners with no sender in main: `chat:stream-replace`, `chat:ui-payload-started`, `chat:ui-payload-progress`, `chat:ui-payload-reset`, `desktop:screenshot:capture`.
- Preload sends with no `ipcMain.on` receiver anywhere: `desktop:screenshot:result` (`preload.ts:77`), `desktop:screenshot:error` (`:79`). The screenshot round-trip is dead at both ends.
- Senders with no listener: none. Invokes with no handler: none.

## Child DOX Index

Leaf doc — `src/main/ipc/` and `src/preload/` own no child docs. Related contracts live in the parents: `../AGENTS.md` (host shell, boot ordering, window modes) and `../services/AGENTS.md` (streaming contract and `NODE_AGENT_MAP` semantics).
