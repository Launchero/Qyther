# src/main — Electron host shell

Parent rail: `../../AGENTS.md`. This doc owns the main-process shell only. The channel contract spanning `src/main/ipc/` and `src/preload/` is owned by `ipc/AGENTS.md`; agent runtime behaviour is owned by `services/AGENTS.md`.

## Purpose

Own the Electron main process: hard boot ordering, the single frameless always-on-top palette window, window-mode state, the system tray, the Alt+Space global hook, `preferences.json` persistence, the logging subsystem, and the Windows/file-search platform utilities. Initialise agent runtimes at boot and expose them through IPC — never implement agent behaviour here.

## Ownership

| File | Lines | Owns |
|---|---|---|
| `main.ts` | 209 | Boot sequence, process error handlers, app-level security hooks, teardown |
| `windows.ts` | 168 | `BrowserWindow` construction, show/hide/toggle, `SC_KEYMENU` intercept |
| `windowManager.ts` | 268 | `WindowMode` state machine, `MODE_CONFIGS`, resize animation, position math |
| `shortcuts.ts` | 215 | koffi low-level keyboard hook, `globalShortcut` registration, hook teardown |
| `tray.ts` | 77 | Tray icon, context menu, `destroyTray` |
| `preferences.ts` | 164 | `preferences.json` load/save/merge/reset |
| `utils/logger.ts` | 183 | `createLogger`, `withTiming`, `SUBSYSTEM_ENV_VARS` registry |
| `utils/platform.ts` | 142 | `isWindows`/`isMacOS`/`isLinux`, `getSystemInfo`, `logSystemInfo` |
| `utils/esRunner.ts` | 471 | Everything (`es.exe`) invocation, `searchFiles`, result formatting |
| `utils/esDownloader.ts` | 258 | `es.exe` presence/download, `initializeEs`, `getEsPath` |
| `utils/queryAnalyzer.ts` | 89 | `analyzeQueryComplexity`, `needsComplexProcessing` |
| `utils/desktop-tools-test.ts` | 709 | Dev-only smoke harness; see Verification |
| `types/document-loaders.d.ts` | — | Ambient module declarations for untyped loaders |
| `../preload/preload.ts` | 419 | Leaf. `contextBridge` surface — rules live in `ipc/AGENTS.md` |
| `services/utils/document-loader.ts` | — | Leaf. Extension→parser dispatch for attachment text extraction |

## Local Contracts

- **Boot order is a hard contract** (`main.ts:74-149`): `initializePreferences()` → database → `initializeEs()` (Windows only) → `mcpService.initializeWithRetry()` → `Menu.setApplicationMenu(null)` → `registerIPCHandlers()` → `registerApiConfigHandlers()` → `registerBrowserHandlers()` → `getAskGraph()` precompile → Playwright check → `registerGlobalShortcuts()` → `createTray()` → `createMainWindow()`. Window creation is last; IPC registration precedes it so the renderer never invokes an unbound channel.
- **ESM-only main process.** Keep the `globalThis.__filename`/`__dirname` polyfill (`main.ts:25-26`) and the post-build `import.meta.dirname` patch (`electron.vite.config.ts:11-29`); main builds as `formats: ['es']` (`:58`). Native modules must stay in `external` (`electron.vite.config.ts:61`). `main.ts:22` still comments "required by better-sqlite3" — that module is imported by nothing; the polyfill is required by the patch plugin and `bindings`, not by better-sqlite3.
- **Sandbox is on and non-negotiable**: `app.enableSandbox()` (`main.ts:40`) with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`windows.ts:62-64`); preload loads as compiled CJS `../preload/preload.cjs` (`windows.ts:65`, `electron.vite.config.ts:73`).
- **Window is frameless, transparent, always-on-top, skip-taskbar, non-resizable** (`windows.ts:40-59`); `resizable` is toggled on only by `setMode('expanded')` (`windowManager.ts:113`). Height is capped to the work area at spawn (`windows.ts:29-30`).
- **Dev relaxations are env-gated; never widen them.** CDP `remote-debugging-port 9222` + `remote-allow-origins *` only under `NODE_ENV=development` (`main.ts:52-55`); detached DevTools only under `ELECTRON_VITE_DEV_MODE` (`windows.ts:76`).
- **Navigation lockdown**: `setWindowOpenHandler` → deny (`main.ts:197`); `will-navigate` allowlist hard-codes `http://localhost:5173` and `file://` (`main.ts:204`). Any new dev port or origin must be added here or the window will not load.
- **Alt+Space requires two mechanisms on Windows.** A koffi `WH_KEYBOARD_LL` hook (`shortcuts.ts:104`) with 300 ms debounce (`shortcuts.ts:23,88`) and a 10 ms message pump that keeps it alive (`shortcuts.ts:139-145`), **plus** an in-window `WM_SYSCOMMAND`/`SC_KEYMENU` intercept (`windows.ts:93-101`) because Windows reserves the combo. `globalShortcut.register('Alt+Space')` is the macOS/Linux path only, never a Windows fallback (`shortcuts.ts:179-192`). `Alt+Shift+M` (`shortcuts.ts:195`) is the only cross-platform shortcut.
- **The window hides, it does not close.** `close` is `preventDefault`ed and turned into a hide (`windows.ts:104-111`); `hideMainWindow` does the same (`windows.ts:133-141`). Both emit `window:will-hide` **before** hiding (`windows.ts:108,138`) so the renderer can park focus; `showMainWindow` emits `window:shown` (`windows.ts:129`). There is no `requestSingleInstanceLock` and no blur-to-hide — do not add either without a request.
- **Mode state persists through preferences.** `WindowMode = 'compact' | 'expanded' | 'custom'` (`windowManager.ts:7`) with pixel defaults in `MODE_CONFIGS` (`:19-35`); `setMode` calls `savePreferences({ windowMode: mode })` (`windowManager.ts:102`) and broadcasts `window:modeChanged` (`:109`). `setMode('expanded')` on an already-expanded window is a no-op so user resizes survive (`:91-93`).
- **Teardown is ordered**: `will-quit` calls `unregisterGlobalShortcuts()` then `destroyTray()` (`main.ts:179-180`) before async MCP/browser cleanup (`:182-188`). The pump interval and hook must be released in `cleanupWindowsGlobalHotkey` (`shortcuts.ts:152-173`) or the process lingers.
- **Logger registration**: use `createLogger('<Subsystem>')` at module scope. An unregistered subsystem inherits `globalLevel` (`logger.ts:92-96`), which defaults to `error` in production (`logger.ts:41-49`), so its `info`/`debug` output silently never appears and no env switch can enable it. Add a `SUBSYSTEM_ENV_VARS` entry (`logger.ts:57-84`) for every new subsystem name.
- **Preferences merge is shallow spread** (`preferences.ts:118`): `savePreferences({ llm })` replaces the whole `llm` object, not its keys. `resetPreferences` (`preferences.ts:154`) is exported and called by nothing — do not cite it as a live path.

## Work Guidance

- New boot step: insert inside `app.whenReady()` (`main.ts:60-166`), keep the ordering contract above, and log through `createLogger('App')`. Anything on the critical path to first paint goes after `createMainWindow()` or is deferred.
- Non-fatal init only: DB, Elasticsearch, MCP and LangGraph precompile each wrap in `try/catch` and degrade to `log.warn` (`main.ts:82-84,92,102-104,121`). Never `throw` from an init step — `uncaughtException` (`main.ts:31`) will swallow it and leave the app half-initialised.
- Cold start budget is <500 ms. Do not add synchronous `execSync` or blocking IO before `createMainWindow()`; `execSync('npx playwright install chromium')` (`main.ts:125`) is already the largest offender and sits after IPC registration.
- New window mode: add a `MODE_CONFIGS` entry, extend the `WindowMode` union (`windowManager.ts:7`), and keep `MODE_CONFIGS` pixel values mirrored into `src/renderer/styles/` tokens — do not add a fourth magic size.
- `windowManager` is a singleton (`windowManager.ts:268`); do not construct a second instance.
- Platform-branch every Windows-only path through `isWindows()` from `utils/platform.ts`; never test `process.platform` inline in this tree.

## Verification

`node_modules` is absent in this checkout, so `npm run typecheck` (`package.json:11`), `npm run lint` (`:12`) and `npm run test` (`:13`) are **not runnable as-is** — `npm install` then `npx electron-rebuild` for `koffi`/`node-winautomation`/`sql.js` first. There is no automated test covering this shell.

Real gate after any change here: `npm run typecheck`, then `npm run dev` and walk the checklist —
1. Alt+Space shows the palette; Alt+Space again hides it (both the hook and the `SC_KEYMENU` path must fire).
2. Close the window while visible → app stays alive in the tray; tray click and double-click both re-show it (`tray.ts:60-67`).
3. `Alt+Shift+M` toggles mode; switch to `expanded`, quit, relaunch — mode must come back from `preferences.json`.
4. Tray Quit exits cleanly with no orphaned process (hook teardown).
5. Window must not be reachable from the taskbar/alt-tab and must stay above other apps.

Dev-only harness: set `TEST_DESKTOP_TOOLS=1` on Windows to auto-run `utils/desktop-tools-test.ts` (`runDesktopToolsTest`) from `main.ts:136-141` after shortcuts register. It is a smoke harness, not a test suite — it is not wired to `vitest` and does not gate anything.

## Child DOX Index

| Doc | Owns |
|---|---|
| `ipc/AGENTS.md` | The IPC surface across `src/main/ipc/*` and `src/preload/`: channel naming, validation, push/pull plumbing, known bridge drift |
| `services/AGENTS.md` | Agent-runtime parent: graph entry, streaming contract, model bootstrap, child routing |

Leaf folders with no doc of their own (rules live here): `src/main/utils/`, `src/main/types/`, `src/main/services/utils/`, `src/preload/` (its contract is in `ipc/AGENTS.md`).
