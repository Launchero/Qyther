# src/main/services/desktop — DOX child contract

Parent: `../AGENTS.md` (agent-runtime rail); root `AGENTS.md` controls repo-wide rules. This folder is the repo's flagship capability and its densest native boundary. **The agent itself moved to `../pi/`.** What stays here is the native substrate it drives.

## Purpose

The Windows-native substrate under the desktop agent: every koffi/libwin32 Win32 call, the `node-winautomation` UIA facade, the tesseract-backed screen reader, screenshot capture, the pixel verifier, and the 32-tool adapter seam. The agent, the tools, and the plan→execute→verify→recover graph were deleted at the Pi cutover; see **Cutover** below for what replaced them.

## Ownership

| File | Lines | Owns |
|---|---|---|
| `input-simulation.ts` | 1294 | Every Win32 call: koffi FFI + libwin32. 44 exported functions + `WindowInfo` (`:465`) |
| `uia-native.ts` | 509 | `node-winautomation` COM (require `:3`), element handle table (`:36-48`), 12 exports |
| `accessibility-tree.ts` | 328 | `AccessibilityTreeAdapter` facade (`:32`) over `uia-native.ts` via lazy `await import` (`:45`); logs "native, no PowerShell" (`:39`) |
| `types.ts` | 239 | `DesktopAdapter` (`:46-70`, 18 methods), `DesktopToolName` (`:74-106`), `DangerLevel` (`:72`), `Subtask` |
| `windows-adapter.ts` | 162 | The only `DesktopAdapter` implementation; coordinate clamp (`:19-28`), tesseract OCR (`:5,14`, `getScreenText:77-90`) |
| `screenshot-capture.ts` | 148 | Electron `desktopCapturer` (`:26`) + PowerShell System.Drawing fallback (`:70`, script `:85-101`) |
| `verifier.ts` | 125 | `GroundTruthVerifier` (`:46`): in-loop pixel diff, thresholds `:8-9` |
| `index.ts` | 23 | Barrel: adapter, types, a11y facade, `verifier`, capture, `inputSim` |
| `ffi.test.ts` | 108 | Imports the production `input-simulation.ts` — a real gate on the koffi binding surface |
| `ocr.test.ts` | 40 | Re-implements its subject against `pngjs`, so it proves nothing about shipped OCR code |

`ui-detector.ts` (127) and `uia-wrapper.ts` (189) were dead and are **deleted**; `verifyBrowserDelegation` went with `desktop-verifier.ts`. Do not reintroduce any of them.

## Cutover — what moved where

| Was | Is now |
|---|---|
| `desktop-agent.ts` (786) — hand-rolled ReAct loop, `DANGER_POLICY`, HITL | `../pi/agent.ts` — one Pi `Agent`; `../pi/toolbox.ts` — the 32 tools as TypeBox `AgentTool`s |
| `desktop-subgraph.ts` (747) — 7-node plan→execute→verify→recover graph | **gone.** The Pi agent is a single loop; there is no graph. The AskGraph node is now `desktopAgent` (`../langgraph/research-agent.ts:241`) |
| `desktop-planner.ts` (304), `desktop-verifier.ts` (912), `desktop-recovery.ts` (241) | **gone.** The NL-postcondition verifier and the retry/replan ladder had no Pi equivalent |
| `desktop-memory.ts` (165) | **gone.** The sql.js trajectory/failure tables still exist and still have owners (`../database/AGENTS.md`); nothing writes to them now |
| `desktop-tools.ts` (1036) — 32 zod tools | `../pi/toolbox.ts` — 32 TypeBox tools, frozen by `../pi/toolbox.test.ts` |
| `src/main/utils/desktop-tools-test.ts` (710) + its `main.ts:136` hook | **gone.** Its subject is gone. There is no dev-mode desktop smoke harness any more |

The deleted `SUBSYSTEM_ENV_VARS` rows went with them: `DesktopAgent`, `DesktopTools`, `DesktopVerifier`, `DesktopPlanner`, `DesktopMemory`, `DesktopRecovery`, `DesktopSubgraph`, `DesktopToolsTest`. `logger.test.ts` fails if one lingers or if a live one is missing.

`desktop-agent.db` on disk is the database file's **name**, not a reference to a module — do not rename it, that would orphan every existing user's trajectory history.

## Local Contracts

- **`DesktopAdapter` (`types.ts:46-70`, 18 methods) is the seam between the tools and Win32.** Adding a method means three coupled edits: the interface, `WindowsDesktopAdapter`, and the `input-simulation` function behind it — then a tool in `../pi/toolbox.ts`, only if it is LLM-facing. Tools receive the adapter as a constructor argument (`createClickTool(adapter)`) or nothing when they shell out (`createLaunchAppTool()`).
- **Three native backend families — do not add a fourth mechanism.** (1) koffi FFI: `input-simulation.ts` loads `user32.dll` (`:167`) and `shell32.dll` (`:177`), binds SendInput/SetCursorPos/GetForegroundWindow/GetWindowTextW/GetWindowRect/EnumWindows/SetForegroundWindow/SetWindowPos/ShowWindow/PostMessageW/SendMessageW/IsIconic/IsWindowVisible at `:170-197`, plus BlockInput/GetKeyState/IsProcessDPIAware/GetDpiForWindow/GetSystemMetrics/SystemParametersInfoW/MonitorFromPoint/GetMonitorInfoW at `:984-1005`. (2) libwin32: `GetWindowThreadProcessId` (`:958`) and token elevation (`:959`) only — DPI/input-blocking are explicitly noted as koffi-only (`:961`). (3) `node-winautomation` COM for UIA (`uia-native.ts:3`), facade `accessibility-tree.ts:32`. Capture is Electron `desktopCapturer` (`screenshot-capture.ts:26`); OCR is `tesseract.js` (`windows-adapter.ts:5,14`).
- **The shipped accessibility path is native COM, not PowerShell UIA.** `docs/desktop-agent.md`/`-gap-analysis.md` and `overall-architecture.md:128` claim PowerShell UIA; they are wrong. The PowerShell path was `uia-wrapper.ts` and it is deleted.
- **`execute_command` has no allowlist and no prompt.** It runs arbitrary strings through `exec` with `shell: 'powershell.exe'` and a 30 s default timeout (`../pi/toolbox.ts`). The `DANGEROUS_COMMAND_PATTERNS` blocklist in `../../ipc/command-guard.ts` covers the `command:execute` IPC channel and does **not** apply. This was already true in practice — the approval gate it depended on was non-functional in production. Dropping the tool from the LLM set is safer than filtering it.
- **Coordinates are clamped to the primary `workArea`, not to the screen** (`windows-adapter.ts:19-28`), applied at `:49,59-60,73,129,134,139`. `input-simulation` also exposes `clampToPhysicalScreen`/DPI helpers — the adapter clamp is the authoritative one for tools.
- **`GroundTruthVerifier` is now the only verifier.** The 912-line NL-postcondition `desktop-verifier.ts` is gone. What remains (`verifier.ts`, 125 lines) runs from `../pi/agent.ts` when a tool sets `details.verifies` — which only `close_window` does. It captures a baseline on first use and feeds its verdict back with `agent.steer()`.
- **Two handle tables are the agent's only memory — both are process-local integers.** Window handles: `hWndMap` / `hWndCounter` (`input-simulation.ts:160-162`) mint `"1"`, `"2"`, … which `get_window_list` renders as `[N] "title"` and every window tool re-resolves through `resolveHwnd` (`:763`); stale handles fail with the "may be invalid or the window may no longer exist" strings. UIA element handles: `elementHandleMap` / `elementHandleCounter` (`uia-native.ts:35-42`), resolved by `resolveElement` (`:44-47`), cleared wholesale by `clearElementHandles` (`:49`). Consequence: the model must re-list windows or re-search elements after any UI change; never cache a handle across subtasks.
- **Screenshots are Electron-native first, PowerShell second.** `captureAllScreens` uses `desktopCapturer.getSources` (`:26`), throws when it returns zero sources (`:33-34`), and on any failure falls to `fallbackPowerShellCapture` (`:70`, invoked `:57`) which runs a System.Drawing script (`:85-101`) through `powershell.exe`, once plus one retry (`MAX_FALLBACK_ATTEMPTS = 1`, `:10`, loop `:71`, final give-up `:141`). The path is base64-encoded before embedding (`:75`).
- **DPI, blocking and elevation guards exist and must be respected** (`input-simulation.ts`): `blockInput:1013` + `withInputBlocked:1276` (BlockInput needs admin, failures ignored `:1281`), `isProcessDpiAware:1066`, `getDpiForWindow:1081`, `getDpiScaleFactor:1124`, `physicalToLogical:1137` / `logicalToPhysical:1149` / `clampToPhysicalScreen:1161`, `isWindowElevated:1174` (`OpenProcess`+`GetTokenInformation`, `:1172`), `isWindowProtected:1198`, `getMonitorInfoForPoint:1222`. Elevated/protected targets are why window tools fail with the sandbox wording — do not convert those into retries.
- **`screenshot-capture.ts`'s PowerShell child is bounded but leaves a temp file on failure.** The `spawn` at `:100-110` carries `timeout: 5000`, so the child is killed rather than lingering. The `unlink` at `:116-120`, however, is on the **success path only** — if `spawn` rejects or `readFile` throws, the capture PNG stays in `tmpdir()` for every retry. That is a disk artefact, not a process, so it is out of this folder's lifecycle contract, but a failing capture is where it accumulates.
- **Lifecycle, and who owns it.** `WindowsDesktopAdapter.cleanup()` (`windows-adapter.ts:116`) terminates the tesseract worker and calls `inputSim.cleanup()`; `accessibility-tree.ts:320-327` fires `cleanupNativeUIA` (`uia-native.ts:500`). Both are reached by `PiDesktopAgent.dispose()` → `closePiDesktopAgent()`, the `pi-desktop-agent` step of `buildShutdownSteps()` in `src/main/main.ts`, which `will-quit` runs under `event.preventDefault()` before `app.exit(0)`. Each step is bounded (`SHUTDOWN_STEP_DEADLINE_MS`, 2 s) and a failure is recorded rather than thrown, so a wedged native handle cannot strand the steps behind it or block the quit — that bound is the reason `dispose()` may keep catching and logging rather than propagating. `DesktopAdapter` declares `cleanup?()` as an **optional** member (`types.ts`) for exactly this — it is the interface's only non-tool method, so a stub adapter implements 17 members, not 18. Adding a second native resource to the agent means adding a disposal path here **and** a step in `main.ts` in the same change; `dispose()` catches and logs rather than throwing, because teardown must never block quit. Note the dynamic import in that step is **not** cold-start protection (the build reports `INEFFECTIVE_DYNAMIC_IMPORT`; `ipc/chat-handlers.ts:6` already imports `agent.ts` statically) — it is kept because it doubles as the check for whether anything was ever constructed.
- **Preserve the lazy `await import()` calls** inside handlers and the lazy `child_process`/`fs` imports — module-load-time FFI is what makes this subtree survivable on non-Windows and in the Vite graph.

## Work Guidance

- Adding a tool now means editing `../pi/toolbox.ts`, not this folder: write the `AgentTool` with a TypeBox `parameters` schema, return `{content, details}` with a `details.status` from `PiToolStatus`, and add the name to the frozen list in `../pi/toolbox.test.ts`. A tool that should run the pixel verifier sets `details.verifies`. There is **no** `DANGER_POLICY` row and **no** `inferStatusFromTool` branch to update — both died with `desktop-agent.ts`.
- `createLogger('PascalName')` at module scope; never `console`. The names this subtree still uses — `AccessibilityTree|GroundTruthVerifier|InputSimulator|ScreenshotCapture|UIANative|WindowsDesktopAdapter` — are all registered under `LOG_DESKTOP` (`src/main/utils/logger.ts`), so `LOG_DESKTOP=true` turns the substrate on. `logger.test.ts` fails the build if a `createLogger('<Name>')` lacks an entry, or if an entry has no call site — deleting a file that owned a logger name requires deleting its `SUBSYSTEM_ENV_VARS` row in the same change.
- Keep functions under 50 lines (root rail); extract helpers rather than growing them.

## Verification

- `ffi.test.ts` imports the production `input-simulation.ts`, so the koffi binding surface has a real gate. `ocr.test.ts` re-implements its subject against `pngjs` and proves nothing about shipped OCR code. Nothing else in this folder is covered.
- **The desktop agent itself still has no test.** `../pi/toolbox.test.ts` drives all 32 tools against stub adapters, `../pi/events.test.ts` covers the bridge and `../pi/cancel.test.ts` covers the abort race — but nothing constructs a `PiDesktopAgent` and runs a real loop. That is the gap this cutover opened, and it is why `npm run dev` on a real desktop task is the only proof the path works.
- Untested, deliberately on the record: all 32 tools against real Win32, the UIA facade, the pixel verifier's scoring and `steer()` loop, screenshot fallback, DPI clamping, and `dispose()` actually releasing the tesseract worker and UIA facade.
- Untested, deliberately on the record: all 32 tools against real Win32, the UIA facade, the pixel verifier's scoring, screenshot fallback, DPI clamping, and the `details.verifies` steering loop.
- Real gate: `npm run typecheck` (`node_modules` is installed here; `npx electron-rebuild` only when the `node-winautomation` addon must match Electron's ABI), then `LOG_DESKTOP=debug npm run dev` and walk: Alt+Space → ask a desktop task → confirm the tool ran, the progress status string matches, and for a `close_window` task the verifier still reports a score.

## Child DOX Index

Leaf doc — this folder has no subdirectories and owns no child docs. The agent and tools are documented in `../pi/AGENTS.md`; the graph node that reaches it is `../langgraph/AGENTS.md`.
