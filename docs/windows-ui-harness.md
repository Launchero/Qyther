# Driving Qyther like a Windows user — capture and interaction harness

> **Status**: live — describes the harness in `scripts/harness/` and the measured behaviour of this app on Windows. Re-derive the counts and file:line-free claims with the greps at the bottom before citing them.

## Why this exists

`npm run test` proves nothing about the running app: both test files import no production code, and `src/main/ipc/AGENTS.md` says so outright. The app is also unusual to test, because it is not a website in a frame — it is a native OS surface: a frameless, transparent, always-on-top, skip-taskbar palette opened by a global keyboard hook, with a tray icon and a window that hides instead of closing.

This harness exists so an agent (or a person) can see and operate that surface the way a user does: move the real cursor, send real keystrokes, grab the real composited screen, and assert against DOM ground truth.

## Research: what was considered and why it was rejected

| Approach | Verdict |
|---|---|
| **Playwright `_electron.launch`** | Rejected. It cannot attach to an already-running app — it only spawns its own main script, which bypasses this repo's real dev bootstrap, tray, global hook and single-window lifecycle. Electron's own testing docs pair it with launching the app yourself. |
| **Playwright MCP with `--cdp-endpoint`** | Kept, but **agent-side and observation-only**. `@playwright/mcp` officially supports connecting over CDP. Pointing it at the live palette gives aria snapshots and screenshots. Its `browser_click`/`browser_type` synthesise DOM events, which fails the fidelity rule below, and its `browser_evaluate` is a code-execution surface (see Security). |
| **CDP `Input.dispatchKeyEvent` / `Runtime.evaluate`** | Rejected for input. CDP input never traverses the Win32 window manager, so it skips focus, hit-testing, and the app's `WH_KEYBOARD_LL` hook — the Alt+Space path would be untested. Kept for **reads** only. |
| **OS UI Automation (`node-winautomation`, FlaUI, pywinauto, WinAppDriver/Appium)** | Rejected as the observation channel, and the CDP AX tree is why: it gives role + accessible name + box straight off the live renderer with no native addon. WinAppDriver's server has not been maintained since 2022 and Appium points at community replacements; FlaUI.WebDriver is explicitly experimental. None of them reaches a `WH_KEYBOARD_LL` hook in any case. |
| **Microsoft `winapp-cli --via send-input`** | The only surveyed tool with an explicit supported OS-input switch, and its docs draw the same line this harness already drew: `send-input` is genuinely real but goes to whatever holds the foreground and is UIPI-blocked, while `post-message` "cannot trigger `WH_KEYBOARD_LL` global hotkeys". Not adopted — it adds a toolchain to reach a process the harness already reaches, and would still need the CDP sidecar. |
| **`Page.startScreencast` as the animation instrument** | Rejected on measurement grounds. Ack-paced and throttled (no FPS parameter; ~5 fps headed reported in 2017), CPU-heavy on animating pages, and it observes compositor output rather than the DOM values the tween is asserted on. The in-page rAF sampler is the higher-resolution clock for a 180 ms tween, and the two research passes disagreed on whether ack-first pacing rescues the rate. |
| **CDP `Accessibility.getFullAXTree`** | **Kept, and it works.** This file previously recorded it as returning **0 nodes** with DOM queries as the only reliable tree. That was a measurement artefact: the tree is off until `Accessibility.enable` is called, which is what switches it on for a CDP-driven read. With `enable` → `getFullAXTree` → `disable`, the palette returns **101 nodes** — `textbox "Search for files, tools, actions..."`, `listbox "Search results"`, `option` rows with their computed accessible names, `button "Keyboard shortcuts"`. `ax_snapshot` is now built on the real tree, and `click_role` targets a control by role plus accessible name. `queryAXTree` is *not* usable for name/role filtering in this Chromium — it demands a nodeId/backendNodeId/objectId — so filter client-side. |
| **nut.js / robotjs** | Rejected as a dependency. `koffi` is already a declared native dependency and already drives `SendInput` in `src/main/services/desktop/input-simulation.ts`; robotjs is unmaintained. |
| **Third-party computer-use MCP servers (Windows-MCP, UI-TARS)** | Rejected. They duplicate capabilities this repo already ships, add a Python/.NET toolchain, and bring their own model dependency. |
| **Electron `desktopCapturer`** | Rejected for the harness: it needs the Electron runtime, which would force the driver to run inside the app and lose the standalone CLI. The product's own screenshot tool still uses it. |
| **`ffmpeg -f gdigrab`** | Third fallback only. Installed here, but the app passes `--disable-direct-composition`, and background-window grab reliability under GPU compositing is an inference, not a measurement. |

## Measured facts about this app

These are the constraints the harness is built around. All were observed on this machine (Windows 10.0.29683, 3440×1440 @ 125 %, Electron 42 / Chrome 148).

1. **Injected input reaches the low-level hook.** The Alt+Space toggle is a koffi `WH_KEYBOARD_LL` hook in `src/main/shortcuts.ts` that gates on `GetAsyncKeyState(VK_MENU)` and returns 1 to block the combo for every other app. `SendInput` updates the async key state exactly as hardware does, and the hook never inspects `LLKHF_INJECTED`, so a synthesized Alt+Space really does toggle the palette. **The Alt must be held while Space is injected** — Space alone is swallowed.
2. **Injected input reaches `globalShortcut` too.** `Alt+Shift+M` (registered via Electron `globalShortcut`) toggles window mode from `SendInput`. Measured: 603 → 103 CSS px in one press.
3. **OS keystrokes go to the foreground window, and this window is not alt-tab-reachable.** `skipTaskbar: true` plus a frameless window means pressing Escape while another app holds focus does nothing to Qyther. The harness therefore clicks the palette (a real click) to take focus before any key — measured: after that, Escape hides it.
4. **A hidden window renders no frames.** `Runtime.evaluate` still answers while hidden, but `Page.captureScreenshot` **hangs until timeout** (measured: 20 s). The harness checks visibility first and refuses fast.
5. **The window title lags the page title.** The `BrowserWindow` is constructed with `title: ''` (`src/main/windows.ts`) and only picks up `Qyther` from `src/renderer/index.html` after load. A title-only window filter silently misses the palette during launch; the harness identifies it by Win32 class `Chrome_WidgetWin_1` **plus the pid that owns the CDP port**.
6. **DPI awareness decides what the numbers mean.** Same window, three spaces: 800×603 CSS, 1000×754 device px, 1000×753 Win32 px at 125 %. An unaware process reports the desktop as 2752×1152; a per-monitor-aware one reports 3440×1440. The harness calls `SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE)` before reading any coordinate and derives `scale = GetWindowRect.width / innerWidth`, asserting it against `devicePixelRatio`.
7. **A live result list fights mode changes.** Results auto-grow the window, so a mode request never settles. `capture-ui.mjs` clears the input first; the harness does the same with real keys (`Ctrl+A`, `Delete`).
8. **Closing a hidden palette quits the app.** `src/main/windows.ts` only `preventDefault`s the close while visible, and `src/main/main.ts` quits on `window-all-closed`. So the harness exposes **no close and no quit verb at all**.
9. **There is no `window:show` IPC handler.** Showing is reachable only through Alt+Space, the in-window `SC_KEYMENU` intercept, or a tray click — which is why the reveal path is a real keystroke rather than an API call.
10. **File search leaks personal paths.** Everything indexes every drive: the query `desktop` returned 49 rows, most of them under `C:\Users\…` and `C:\Windows\WinSxS`. Every frame write goes through the privacy gate inherited from `capture-ui.mjs`.
11. **Two dev instances cannot coexist by launching twice.** `windows.ts` hardcodes `http://localhost:5173`, and a second `npm run dev` rebuilds the shared `out/` tree under the first one; observed to fail with `ENOENT` on a hashed chunk in the `dirname-fix-and-wasm` plugin. Multi-instance is a real hazard (there is no `requestSingleInstanceLock`), but it cannot be reproduced by simply starting twice.
12. **The accessibility tree is live over CDP.** `Accessibility.enable` → `getFullAXTree` → `disable` returns **101 nodes** with role, Chromium-computed accessible name and box per node. Earlier notes in this file and in `scripts/harness/AGENTS.md` said this returned 0 nodes; both were taken without `Accessibility.enable` and were wrong. `queryAXTree` cannot filter by name/role in this Chromium (it demands a nodeId/backendNodeId/objectId), so the harness filters client-side.
13. **`SetCursorPos` is not input.** It repositions the cursor without inserting anything into the input stream, so no `WM_MOUSEMOVE` reaches the app. Movement is now a real `MOUSEEVENTF_MOVE | ABSOLUTE | VIRTUALDESK` event normalised from the virtual-desktop origin; every target across this 3440×1440 desktop lands within 1 px. Without `VIRTUALDESK` the normalisation is against the primary monitor and the origin is ignored, so a window on a second screen is clicked in the wrong place while every DOM read still looks healthy.
14. **The page's rAF is a measured 59.9 Hz** (median 16.7 ms, min 16.6, max 16.8), so a 180 ms tween cannot legitimately span more than ~11 frames. An impossible ramp is evidence about the *sampler*, not the tween — see the recorder-retirement note below.
15. **File search is case-sensitive.** The query `qyther` returns 47 rows; `Qyther` returns 0. Anything deriving a probe query from a path must lower-case it.
16. **A recorder left installed in a long-running page cannot be replaced by its successor.** Each sampler owns a rAF loop that reads the *shared* arm deadline, which the live recorder keeps extending, so an old loop never retires on its own: two live samplers gave the frame buffer three frames per frame (gaps of `0,0,17 ms`) and a 584 ms hole where the tween should have been. The recorder is now versioned, a superseded loop retires on its next frame, and a new install cancels the previous handle — but loops predating both still need one app restart.

## Architecture

```
scripts/harness/
  native.mjs      Win32: SendInput (keys, and a real normalised virtual-desktop
                  mouse-move), cursor, EnumWindows(+class/pid/DPI), monitors,
                  GDI screen grab, process DPI awareness. No Electron.
  cdp.mjs         CDP: endpoint discovery + pid attribution, target by title,
                  closed registry of DOM reads, page capture, versioned event +
                  per-frame recorder, the accessibility tree, trace selection.
  driver.mjs      The verbs. Only file that chooses input vs observation. Owns
                  the coordinate pipeline, the focus rule, the privacy predicate.
  cli.mjs         Operator surface + `selftest` + the DOM-input guard. Flags or
                  a JSON blob; per-verb exit-code predicates.
  mcp-server.mjs  The same verbs as MCP tools, whitelisted, no code-bearing args.
  run-verify.mjs  Ad-hoc REPL poking; `cli.mjs` is the supported entrypoint.
```

**The fidelity rule.** Anything that changes app state goes through `native.mjs` (`SendInput`, and a real move event rather than `SetCursorPos`). CDP is used only to read DOM truth, to read the accessibility tree, and to capture the palette's own pixels. `selftest` enforces this by scanning the harness's own executable lines for DOM-input patterns — the list covers `el.click()`, `dispatchEvent`, `electronAPI.`, the pointer/window constructors, and CDP's `Input.dispatch*` and `Emulation.setDeviceMetricsOverride`, since those make the page believe it was driven by a user when nothing crossed the OS input queue — and independently by asserting that a click produced a real focus change and a real cursor within 1 px of the computed point, and that typing produced a real input value.

**Two capture scopes, deliberately both available.** `palette` is CDP page capture: true alpha, exact resolution, blind to z-order. `desktop` is a GDI `BitBlt` of the real composited region: true occlusion and rounding. GDI runs inside the harness process precisely because that process is per-monitor-aware — an unaware PowerShell `CopyFromScreen` returns the whole desktop resampled to 2752×1152 here. Both refuse when the window is hidden: page capture hangs outright, and a desktop grab of a hidden window's rect is not empty, it is *the desktop behind the palette* — another app's window, reported as a successful capture and written to disk. Both return pixel statistics, because a capture that returns bytes is not a capture that shows the app.

**Why the Win32 bindings are re-declared.** `input-simulation.ts` imports `screen` from Electron at module scope, so it cannot load under plain `node`; `scripts/desktop-ffi-test.ts` re-declares for the same reason. Three of its helpers are also wrong for this use: `clampToPhysicalScreen` and `getDpiScaleFactor` are primary-monitor-only, and `WindowsDesktopAdapter.clampToScreen` compares physical coordinates against a DIP-sized work area.

## Using it

```bash
npm run dev                      # a person starts the app; the harness never does
npm run harness:preflight        # gate: refuses rather than drive one app and read another
npm run harness:selftest         # 18-step proof that OS input reaches the shipped UI
node scripts/harness/cli.mjs reveal
node scripts/harness/cli.mjs click_element --selector "#search-input"
node scripts/harness/cli.mjs click_role --role textbox --name "Search for files"
node scripts/harness/cli.mjs type --text "qyther"
node scripts/harness/cli.mjs save_frame --id my-frame --scope desktop
npm run harness:mcp              # same verbs as an MCP stdio server
```

**Use flags, not the JSON blob.** Windows PowerShell 5.1 strips the double quotes out of a single-quoted argument before the native process sees it, so the form this file used to show — `cli.mjs type '{"text":"qyther"}'` — died with a raw Node `SyntaxError` on the default Windows shell. `--flag value` carries no quotes to lose, and a value becomes a number only when it round-trips exactly through `Number`, so `--text 007` stays the string `"007"`. The JSON blob still works and is what the MCP surface speaks.

**Every verb's exit code is its verdict.** Only `preflight` and `wait` ever returned an `ok` key, so the old exit rule (`out.ok === false`) reported success for a `hide` the app ignored, a `reveal` the hotkey dropped, a `set_mode` that never settled and a `clear_input` that left the text. Each verb now declares what success means for itself; argument errors exit 2, verb failures exit 1.

Artifacts land in `tmp/harness/` (gitignored, on the repo drive), capped at 40 frames / 150 MB and pruned oldest-first. The system temp directory is on `C:`, which on this box sits at 97 % full.

### Packaged builds

The dev CDP port is opened only under `NODE_ENV=development` (`src/main/main.ts`). For a packaged build, pass the switch at launch — no code change, nothing shipped that opens a port:

```
release\win-unpacked\Qyther.exe --remote-debugging-port=0 --remote-debugging-address=127.0.0.1
```

The port is then read from `%APPDATA%\qyther\DevToolsActivePort` and confirmed by matching the listener's owning pid to the palette window's pid. **Never** add `--remote-allow-origins=*`.

**Status: unverified.** `npm run build:win:dir` currently fails on this machine because `node-gyp` cannot rebuild `node-winautomation` without the Visual Studio "Desktop development with C++" workload, so no `Qyther.exe` exists to drive. The packaged path is designed and documented, not proven. `npm run build` itself succeeds (`out/renderer/index.html` is produced).

### Playwright MCP for the live app

Register a **second, agent-side** server rather than editing `mcp-config.json`:

```
npx @playwright/mcp@latest --cdp-endpoint http://127.0.0.1:9222 --caps=vision
```

The `playwright` entry in `mcp-config.json` is not agent tooling — it is the product's own browser-agent supply line (`src/main/services/browser/AGENTS.md`, and `stateful-browser-agent.ts` filters MCP tools by the `browser_` prefix). Repointing it would make the app's browser agent drive Qyther itself, would fail whenever the app is down, and would put two servers with identical `browser_*` tool names into one client. It is also gitignored, so such an edit would not survive a clone.

**Not yet registered:** no `qodercli` was on `PATH` in the shell used to build this, so the agent-side entry is still operator work. Run the equivalent of:

```
qodercli mcp add playwright-qyther -- npx @playwright/mcp@latest \
  --cdp-endpoint http://127.0.0.1:9222 --caps=vision
```

## What is verified on this machine

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run test` | **41 files / 321 tests pass** (re-measured 2026-10-15; this file previously said 81, and `src/main/AGENTS.md` said 305/38 — all stale) |
| `npm run harness:preflight` | passes against one dev instance; **exits 1** with a named reason when the CDP port is owned by a pid that has no palette window |
| `npm run harness:selftest` | **18 / 18 pass**, twice in a row, against `npm run dev` on a fresh renderer |
| Harness MCP server | completes the `initialize` → `tools/list` → `tools/call` handshake over stdio, and the real `MCPAdapter` contract test drives it (`client-contract.test.ts`, which freezes the tool count at 18) |
| Frame written | `tmp/harness/selftest-frame.png`, privacy-gated, pixel-checked |
| `npm run build:win:dir` | **fails** — `node-gyp` cannot rebuild `node-winautomation` (no VS C++ workload). `npm run build` itself succeeds and emits `out/renderer`. Packaged driving is therefore designed but unproven. |

The self-test's own evidence that input is real: a `SendInput` click at the computed point left `GetCursorPos` within 1 px of it (the 16-bit normalised absolute move is off by a pixel or two by construction) **and** moved `document.activeElement` to `search-input`; per-character `KEYEVENTF_UNICODE` typing produced `inputValue: "qyther"` and 47 result rows; `ArrowDown` moved the highlighted row from `qyther C:\Users\kanis\AppData\Roaming\qyther\Folder` to `Qyther D:\test_electron\Qyther\Folder`; and `click_role` reached the same input by role and accessible name rather than by CSS selector.

## Security

`command:execute` runs raw `promisify(exec)` in the main process (`src/main/ipc/handlers.ts`). Its only blocklist lived in the renderer-reachable preload layer, so **any holder of a DevTools `Runtime.evaluate` could bypass it** — and a CDP endpoint is reachable by every local process. That is arbitrary code execution as the logged-in user, and it is now true of both the dev port and any packaged launch that passes the flag.

Three responses:

1. `src/main/ipc/command-guard.ts` enforces the same four patterns in main, so the bypass is closed at the layer the sandbox actually guarantees. `src/main/ipc/command-guard.test.ts` is the repo's first test that imports production code.
2. The harness MCP server carries **no caller-supplied code**: no `evaluate`, no `expression`, no `ipc_invoke`, no `navigate`, no `close`. Reads are a closed registry of named DOM expressions inside `cdp.mjs`.
3. `playwright-qyther` is treated as observation-only, because it does expose `browser_evaluate`.

Being precise about what the guard does *not* do: a four-string blocklist is not a security boundary. `Remove-Item -Recurse -Force`, aliases, and encoded commands all pass it. The real control is that no harness surface accepts JavaScript.

## Defects found and deliberately not fixed

Reported here rather than silently repaired, since each is outside this work's scope:

- **UIA is dead in this checkout.** `node_modules/node-winautomation/build/Release` does not exist, `out/main` carries no `Automation.node`, and `require('node-winautomation')` throws "Could not locate the bindings file". Six of the 32 desktop tools (`get_element_info`, `click_element`, `search_elements`, `invoke_element`, `set_element_value`, `get_element_text`) therefore cannot work here, and the `electron.vite.config.ts` copy step for `Automation.node` is wrapped in a silent `catch {}`, so packaged builds inherit the same dead path. **This no longer constrains the harness**: it reads the CDP accessibility tree instead, which needs no addon. It still constrains the product's desktop agent.
- **`WindowsDesktopAdapter.clampToScreen` mixes coordinate spaces** (physical against DIP), which on a 125 % panel makes the shipped desktop agent unable to address the rightmost ~689 px and bottom ~289 px of the screen.
- **Nothing in the product enables Chromium accessibility**, so OS UIA clients (and the product's own accessibility tools) see a lazily built tree; combined with the point above, the accessibility-based *product* tools have no working path here. The harness is unaffected — `Accessibility.enable` switches the tree on for its own CDP reads.
- **The browser agent's tools are gated off by local preferences.** `client.ts` drops a config server when preferences enable other servers but not it; with only `filesystem` enabled, `playwright` contributes zero tools and `stateful-browser-agent` throws "No browser tools found from Playwright MCP server". Independent of this harness.
- **`mcp-config.json` is untracked**, so any configuration conclusion drawn from it is machine-local.

## Verification

```bash
npm run typecheck
npm run lint
npm run test                                                   # 41 files / 321 tests
node scripts/harness/cli.mjs selftest                          # 18 steps, exit 0 only if all pass
grep -rn "McpServer\|StdioServerTransport" src/ --include="*.ts" --include="*.tsx"   # must be empty (scope it to code: the docs that ban these strings otherwise match themselves)
npx vitest run src/main/services/pi/toolbox.test.ts                # the frozen 32-name list
npx vitest run src/main/services/mcp/client-contract.test.ts      # the frozen harness tool count
```

Re-derive the claims in "Measured facts" with: `node scripts/harness/cli.mjs who` (scale, DPI, rect, mode), `... state` (rows, focus), `... list_windows` (classes and titles of every top-level), and by reading `src/main/shortcuts.ts`, `src/main/windows.ts`, `src/main/windowManager.ts`, `src/renderer/hooks/useKeyboard.ts`.

Known limitation of the self-test's own guard: the DOM-input scan skips comment lines and skips `cli.mjs` (which holds the pattern list), so a forbidden call written inside a string literal in another file would be missed. The behavioural assertions — real cursor position matching the computed point, `document.activeElement` changing, `input.value` matching typed text — are the load-bearing proof.
