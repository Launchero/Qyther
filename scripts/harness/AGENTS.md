# scripts/harness — DOX child contract

Parent rail: `../../AGENTS.md`. Research record and rationale live in `docs/windows-ui-harness.md`; this doc owns the rules for editing the harness itself.

## Purpose

Let an agent or a human capture and operate the running app the way a Windows user does — real cursor, real keystrokes, real composited pixels — and assert against DOM ground truth. Exposed twice from one core: a CLI for operators, an MCP stdio server for agents.

## Ownership

| File | Owns |
|---|---|
| `native.mjs` | Every Win32 call: `SendInput` mouse/keyboard, cursor, `EnumWindows` with class + pid + per-window DPI, monitors, GDI desktop grab, process DPI awareness. Re-declared koffi bindings; must never import Electron. |
| `cdp.mjs` | Endpoint discovery and pid attribution, target selection by window title, the closed registry of DOM reads (`READS`), page capture, the lifecycle event recorder. |
| `driver.mjs` | The verbs, and the single place the input-vs-observation boundary is decided. Owns the coordinate pipeline, the focus rule, the privacy gate and artifact pruning. |
| `cli.mjs` | argv → verb → JSON, plus `selftest` and the DOM-input guard. |
| `mcp-server.mjs` | The whitelisted tool table. The only file in the repo that may import an MCP **server**. |

## Local Contracts

- **All input is OS-level.** State changes go through `native.mjs` `SendInput`/`SetCursorPos`. Never synthesize input in the page: no `HTMLInputElement` native setter, no `el.click()`, no `dispatchEvent`, no `new Event`/`new PointerEvent`, no `window.electronAPI` call. CDP is for reading and for the palette's own pixels only. `selftest` fails if this is violated.
- **No verb may close, quit, launch or navigate the app.** A hidden palette that gets closed takes the whole app down (`src/main/windows.ts` only preventDefaults the close while visible; `src/main/main.ts` quits on `window-all-closed`), and starting the app is the operator's job.
- **No caller-supplied code, anywhere near the MCP surface.** Reads are named entries in `cdp.mjs` `READS`. Do not add an `evaluate`/`expression`/`script`/`ipc_invoke` argument: the app's `command:execute` bridge makes any `Runtime.evaluate` into OS command execution.
- **Identify the palette by class + owning pid, never by title alone.** The `BrowserWindow` starts with `title: ''` and gains `Qyther` only after the renderer loads; a title filter misses it during launch. `preflight` resolves the CDP port's `OwningProcess` and requires the window to belong to that pid.
- **Pin DPI awareness before reading coordinates.** `makePerMonitorAware()` must run first; unaware and aware processes see different numbers for the same window, and mixing them yields clicks in the wrong place. Derive `scale = GetWindowRect.width / innerWidth` and assert it against `devicePixelRatio`; never hardcode a scale.
- **`preflight` is allowed to be a hard refusal, and must stay able to say no.** It refuses on multi-instance, on pid/endpoint mismatch, on scale drift, and on a full artifact drive. A preflight that always passes is a broken preflight.
- **Keyboard verbs take focus first, by clicking.** OS keystrokes reach the foreground window and this window is `skipTaskbar`, so `ensureFocused` performs a real click before Escape/arrows/typing.
- **Screenshots refuse fast when hidden**, because `Page.captureScreenshot` hangs to its timeout against a hidden window while `Runtime.evaluate` keeps answering.
- **Every frame write passes the privacy gate.** Everything indexes every drive, so result rows carry personal paths; refuse unless all visible rows are inside the repo.
- **Artifacts go to `tmp/harness/` on the repo drive only**, capped at 40 frames / 150 MB, pruned oldest-first. Never `os.tmpdir()` — that is `C:`, which runs near-full on this box.
- **The server lives in `scripts/`, never in `src/`.** `src/main/services/mcp/AGENTS.md` requires `grep -rn "McpServer|StdioServerTransport" src/ --include="*.ts" --include="*.tsx"` to stay empty. Scope that grep to code; run against all files it matches the docs that ban the strings.
- **Do not import `src/main/services/desktop/input-simulation.ts`.** It imports `screen` from Electron at module scope, so it cannot load under plain `node`; re-declare the handful of bindings needed instead. Its `clampToPhysicalScreen`, `getDpiScaleFactor` and `WindowsDesktopAdapter.clampToScreen` are also wrong for this use (primary-monitor-only, or physical-vs-DIP mixing).

## Work Guidance

- Adding a verb: implement it in `driver.mjs` as one flat `async (opts) => plain object` under 50 lines, add it to `cli.mjs` `VERBS`, and add it to `mcp-server.mjs` `TOOLS` + `HANDLERS` **only if it is safe for an untrusted caller**. Input verbs must route through `native.mjs`.
- Adding a read: add a key to `cdp.mjs` `READS`. It takes no arguments. If a value needs a parameter, it is not a read — reconsider.
- Prefer reporting two truths over one convenient one: palette and desktop capture disagree on purpose (content vs compositor), and `selftest` asserts both.
- Keep `native.mjs` free of policy. Coordinates, clamping and the rect-inside-window check belong to `driver.mjs`.

## Verification

```bash
npm run harness:preflight        # must refuse, with a named reason, on a dirty machine
npm run harness:selftest         # 14 steps; exit 0 only when all pass
npm run typecheck                # harness is .mjs, so this must be unaffected
grep -rn "McpServer\|StdioServerTransport" src/    # empty
```

`selftest` needs a running app (`npm run dev`, started by a person) and drives the real UI: it hides and reveals the palette, changes window mode, types a query and writes a frame. Expect the visible window and the user's focus to move while it runs.

The DOM-input guard skips comment lines and skips `cli.mjs`, which holds the pattern list; the behavioural assertions are the load-bearing proof.

## Child DOX Index

Leaf doc — this folder owns no child docs.
