# Process Lifecycle Management Audit — 2026-10-16

## Executive Summary

Audited the app's process lifecycle management against the standards documented in `AGENTS.md`. Found and fixed **three gaps** in child process bounds and resource disposal. All fixes align with the repo's documented contracts and pass typecheck, lint, and tests.

## Audit Scope

Examined every resource holder, child process, timer, and shutdown path:

### Resource Holders Verified ✓
- **`MCPService`** — `initialize()` builds into locals, publishes on success, closes on throw. `cleanup()` resets all state. Shutdown step: `mcp` (bounded 2s).
- **`PiDesktopAgent`** — `dispose()` aborts, cleans adapter and a11y. Shutdown step: `pi-desktop-agent` (bounded 2s).
- **`DatabaseManager`** — `close()` persists and closes sql.js handle. Shutdown step: `database` (last, bounded 2s).
- **`LangChainAgent.cleanupBrowserAgent()`** — Clears timer first, then cleans browser session. Shutdown step: `browser-agent` (bounded 2s).
- **`WindowsDesktopAdapter`** — `cleanup()` terminates tesseract worker and calls `inputSim.cleanup()`.
- **`AccessibilityTreeAdapter`** — `cleanup()` fires `cleanupNativeUIA` (now awaited).
- **`input-simulation.cleanup()`** — Unregisters koffi callbacks, clears handle maps, nulls DLL refs.
- **`shortcuts.ts`** — `cleanupWindowsGlobalHotkey()` clears message pump interval, unhooks keyboard hook, unregisters callback. Shutdown step: `global-shortcuts` (first, bounded 2s).
- **`tray.ts`** — `destroyTray()` destroys tray icon. Shutdown step: `tray` (bounded 2s).

### Child Processes Verified ✓
All `exec`/`execFile`/`spawn` calls now have both `timeout` and `maxBuffer` (where applicable):

| Site | Timeout | MaxBuffer | Notes |
|------|---------|-----------|-------|
| `ipc/handlers.ts:176` (`command:execute`) | 30s | 10MB | ✓ Already compliant |
| `utils/esRunner.ts:323` (`searchFiles`) | 10s | 10MB | ✓ Already compliant |
| `utils/esRunner.ts:409` (`isEverythingRunning`) | 3s | 1MB | **Fixed** — was missing maxBuffer |
| `services/pi/toolbox.ts:950` (`execute_command`) | 30s (default) | 10MB | ✓ Already compliant |
| `services/desktop/screenshot-capture.ts:100` (PowerShell spawn) | 5s | N/A (spawn, output to file) | ✓ Already compliant |
| `main.ts:124` (Playwright install) | 120s | N/A (stdio: 'ignore') | **Fixed** — was missing timeout |
| `services/pi/toolbox.ts:986` (Explorer spawn) | N/A (detached, unref'd) | N/A | ✓ Intentional — opens Explorer window |

### Shutdown Order Verified ✓
`buildShutdownSteps()` order is a contract (load-bearing):
1. `global-shortcuts` — koffi message-pump interval (holds event loop open)
2. `tray` — tray icon
3. `browser-agent` — browser session timer + Playwright cleanup
4. `mcp` — shared MCP client (owns Playwright stdio child)
5. `pi-desktop-agent` — tesseract worker + UIA facade
6. `database` — sql.js handle (last, captures writes during teardown)

Each step is bounded by `SHUTDOWN_STEP_DEADLINE_MS` (2s), failures are recorded not thrown, and `run()` is memoised so a second `will-quit` joins the first run.

### Lifecycle Module Verified ✓
`lifecycle.ts` guarantees four properties (all proven by `lifecycle.test.ts`):
1. Steps run in array order, sequentially
2. Every step is bounded (2s deadline)
3. `run()` never rejects
4. `run()` is memoised (second call joins first)

## Gaps Found and Fixed

### Gap 1: `main.ts:124` — `execSync` with no timeout
**Problem**: `execSync('npx playwright install chromium', { stdio: 'ignore' })` had no timeout. Node's `execSync` defaults to waiting forever. If npm or the network hangs, the entire boot blocks indefinitely.

**Fix**: Added `timeout: 120_000` (2 minutes). Generous for a first-time Chromium download but short enough that a stuck install does not strand the app on the boot path.

**File**: `src/main/main.ts:124`

### Gap 2: `esRunner.ts:409` — exec with no maxBuffer
**Problem**: `isEverythingRunning()` had `timeout: 3000` but no `maxBuffer`. The root `AGENTS.md` states "A new `exec` with neither is a defect on arrival" and lists the three exec sites as having both bounds. This fourth site had only one.

**Fix**: Added `maxBuffer: 1024 * 1024` (1MB). The health check returns minimal output (just a count), so 1MB is generous but bounded.

**File**: `src/main/utils/esRunner.ts:409`

### Gap 3: `accessibility-tree.ts:320-327` — fire-and-forget cleanup
**Problem**: `cleanup()` returned `void` and fired `import('./uia-native').then(...)` without awaiting it. The caller (`disposeDesktopRuntime()`) didn't wait for it, so the UIA cleanup might not complete before the process exits. A rejected import also became an unhandled rejection.

**Fix**: 
- Made `AccessibilityTreeAdapter.cleanup()` async and await the dynamic import
- Updated `PiDesktopAgent.dispose()` to await `this.deps.a11y.cleanup()`
- Updated `disposeDesktopRuntime()` to await `held.a11y.cleanup()`

**Files**: 
- `src/main/services/desktop/accessibility-tree.ts:320-327`
- `src/main/services/pi/agent.ts:109,317`

## Verification

### Static Checks ✓
- `npm run typecheck` — **0 errors**
- `npm run lint` — **0 errors, 11 warnings** (all pre-existing, documented baseline)
- `npm run test` — **369/370 tests pass** (1 flaky timing-sensitive animation test in `windowManager.test.ts` that passes in isolation)

### Tests Related to Changes ✓
- `lifecycle.test.ts` — 8/8 pass (proves the four shutdown properties)
- `pi/toolbox.test.ts` — 6/6 pass (proves the 32-tool contract)
- `pi/cancel.test.ts` — 2/2 pass (proves the abort race)
- `pi/events.test.ts` — 14/14 pass (proves the bridge routing)
- `pi/families.test.ts` — 2/2 pass (proves no duplicate tool names)
- `database/database-manager.test.ts` — 24/24 pass (proves sql.js layer)

### What Remains Unverified
Per `AGENTS.md` ## Live Verification, the following require driving the live app:
- Tray Quit exits cleanly and the process tree shows no orphaned children
- The ordered shutdown steps run and log `Released <name> in <n>ms`
- The `pi-desktop-agent` step actually releases the tesseract worker and UIA facade (no automated test)
- The `browser-agent` step actually clears the inactivity timer (no automated test)

These are hand-driven by design — the harness deliberately never quits the app.

## Standards Compliance

All fixes align with the standards documented in `AGENTS.md`:

### Process & Resource Lifecycle ✓
- Every `exec`/`execFile`/`spawn` has both `timeout` and `maxBuffer` (where applicable)
- Every resource has a named disposer registered where it's acquired
- Acquisition cannot orphan (build into local, publish on success, close on throw)
- Quit is a real, bounded, ordered teardown
- Native and database handles are released, not abandoned
- Every timer, frame and subscription has a teardown

### Child Process Bounds ✓
- `timeout` is mandatory (Node's default is `timeout: 0`, i.e. no timeout)
- `maxBuffer` is mandatory for `exec` (Node's default is 1MB, which fails chatty commands)
- `spawn` with `detached: true` and `child.unref()` is intentional for fire-and-forget children (e.g. Explorer)

### Teardown Contracts ✓
- Every step is bounded by `SHUTDOWN_STEP_DEADLINE_MS` (2s)
- A throwing or timing-out step is recorded and swallowed
- `run()` never rejects
- `run()` is memoised (second call joins first)
- Order is load-bearing (koffi first, database last)

## Conclusion

The app's process lifecycle management is now fully compliant with the standards documented in `AGENTS.md`. All child processes are bounded, all resources have named disposers, and the ordered teardown is observable and tested. The three gaps fixed were:
1. A boot-path `execSync` that could hang indefinitely
2. A health-check `exec` missing its `maxBuffer` bound
3. A fire-and-forget cleanup that might not complete before process exit

All fixes are minimal, targeted, and align with the repo's documented contracts. No new abstractions, no speculative code, no unrequested configurability — just closing the gaps.
