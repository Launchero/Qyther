# Desktop Agent Architecture

> **Status**: live for "Current Architecture" below, re-derived from this checkout on 2026-10-16; the "Changelog" entry is history and names deleted files. Deeper reference: `docs/architecture.md` and `src/main/services/desktop/AGENTS.md` / `src/main/services/pi/AGENTS.md`. See `docs/AGENTS.md` rule 1.

## Current Architecture

There is no desktop agent subsystem any more. A desktop task is an ordinary Ask turn: one Pi `Agent` (`runAskTurn()` in `src/main/services/pi/ask-turn.ts`) holds the 32 desktop tools alongside the web, ui, document, browser and mcp families and routes by choosing a tool. There is no planner that decomposes a task into subtasks, no separate verifier pass, no recovery ladder and no cross-agent delegation — the model plans, and every tool result is already visible to it.

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Desktop tools | `src/main/services/pi/toolbox.ts` | The 32 Windows tools as TypeBox `AgentTool`s (click, type, screenshot, window management, UIA element inspection, clipboard, launch, `execute_command`). Frozen by name in `src/main/services/pi/toolbox.test.ts`; tools never throw — a failure comes back as readable text with `isError` set, and each result carries its own `details.status` |
| Family assembly | `src/main/services/pi/ask-tools.ts`, `src/main/services/pi/families.ts` | `buildAskToolboxes()` binds each family's toolbox; `buildFamilyIndex()` maps tool name → family → agent label → display label and throws on a duplicate name |
| Unused agent wrapper | `src/main/services/pi/agent.ts` | Holds `getDesktopToolbox()` (the live seam: the memoised runtime plus the tool list) **and** `PiDesktopAgent` with `runPiDesktopTask()` / `getPiDesktopAgent()` / `abortPiDesktopRun()` — which have **zero production callers**. Only `closePiDesktopAgent()` is reached, from `main.ts`'s `pi-desktop-agent` shutdown step. Consequence: the initial-screenshot decision, the `details.verifies` opt-in and the `agent.steer()` verifier feedback loop are not on the shipped path |
| Adapter seam | `src/main/services/desktop/types.ts` | `DesktopAdapter` — the interface between the tools and Win32. `DangerLevel` in the same file is vestigial: re-exported by the barrel, consumed by nothing, because the policy table and the approval gate died with `desktop-agent.ts` |
| Windows adapter | `src/main/services/desktop/windows-adapter.ts` | The only `DesktopAdapter` implementation: clamps coordinates to the primary work area and owns the tesseract OCR worker |
| Input simulation | `src/main/services/desktop/input-simulation.ts` | Every Win32 call — koffi FFI plus libwin32: `SendInput`, cursor, window enumeration and geometry, foreground/activation, DPI and elevation reads |
| Accessibility | `src/main/services/desktop/uia-native.ts`, `accessibility-tree.ts` | UI Automation through native `node-winautomation` COM, behind the `AccessibilityTreeAdapter` facade. This is **not** PowerShell UIA — the PowerShell wrapper (`uia-wrapper.ts`) was dead and is deleted, and the facade logs "native, no PowerShell" |
| Screenshot capture | `src/main/services/desktop/screenshot-capture.ts` | Electron `desktopCapturer` first, one bounded PowerShell System.Drawing fallback |
| Change detector | `src/main/services/desktop/verifier.ts` | `GroundTruthVerifier`: a pixel diff against `PIXEL_DIFF_THRESHOLD` (0.01), an `action_effect` signal for `click`/`double_click` under `ACTION_EFFECT_MIN_DIFF` (0.02), plus a window-title signal. It is a change detector, not a postcondition grader, and there is no weighted score. Constructed by `getDesktopRuntime()` but consulted only by the un-called `PiDesktopAgent` |

There is no `desktop-agent.ts`, `desktop-subgraph.ts`, `desktop-planner.ts`, `desktop-verifier.ts`, `desktop-recovery.ts`, `desktop-memory.ts`, `desktop-tools.ts`, `ui-detector.ts` or `uia-wrapper.ts` in this checkout — all were deleted at the Pi cutover. The old 912-line NL-postcondition verifier and the retry/alternative/replan/skip/abort ladder have no Pi equivalent.

### Verification and human approval

Neither exists on the shipped path. There is no approval gate, no `interrupt()`, no `desktop:confirmation-request` and no `chat:resumeGraph`; `src/shared/ipc/hitl-decision.ts` is deleted with them. Every tool runs without asking, and `execute_command` in particular runs an arbitrary string through a PowerShell `exec` (`shell: 'powershell.exe'`) with a 30 s **default** timeout the model may override — the `DANGEROUS_COMMAND_PATTERNS` blocklist in `src/main/ipc/command-guard.ts` guards the `command:execute` IPC channel and does **not** apply to that tool. The only automatic check left is the pixel change detector above, and the tool that opts into it (`close_window`, the only one setting `details.verifies`) has no consumer in the shipped loop.

### Trajectories

`pi/turn-record.ts` builds one `TrajectoryRecord` per completed Ask turn and the chat pump writes it through `saveTrajectory()` into the sql.js file at `userData/desktop-agent.db` (`desktop_trajectories` plus `desktop_trajectory_steps`). That is the whole story: **the rows are written and read by nothing** — no retrieval feeds a future prompt, and `recordFailure()` has zero callers, so `desktop_failures` stays empty by construction. The store is evaluation substrate, not memory. The old `desktop-memory.ts` retrieval node and the cross-agent delegation metadata it used to record are gone with the graph.

## Changelog

This entry is dated history. Every path it names (`desktop-planner.ts`, `desktop-verifier.ts`, `desktop-agent.ts`) was deleted at the Pi cutover, so none of it describes current code.

### [2026-05-12] optimize-window-interaction: Eliminate 30s planner timeout and 11s verifier overhead for simple window tasks
- **What**: Three optimizations for window management tasks (minimize, maximize, restore, close, focus):
  1. **Planner shortcut**: `isSimpleWindowTask()` regex detects window management tasks and skips LLM entirely, falling back to single-subtask plan instantly (saves ~30s timeout).
  2. **Verifier shortcut**: `verifyDeterministicWindowAction()` performs lightweight window-state verification without expensive screenshots, pixel diff, or Tesseract OCR (saves ~11s).
  3. **Agent shortcut**: Skips initial screenshot capture (~1s) for simple window tasks, reducing first-LLM-call context size.
- **Files**:
  - `src/main/services/desktop/desktop-planner.ts` — added `isSimpleWindowTask()` with regex keywords; planner now detects and skips LLM for window management tasks
  - `src/main/services/desktop/desktop-verifier.ts` — added `isDeterministicWindowAction()` and `verifyDeterministicWindowAction()` with per-action verification helpers
  - `src/main/services/desktop/desktop-agent.ts` — skips initial screenshot for simple window tasks
- **Impact**: ~42s saved (70% reduction) for simple window management tasks. Expected latency: ~18s -> ~6s for "minimize window" type requests.
- **Details**: Before: 60s total (30s planner timeout + 18s ReAct loop + 11s verifier + 1s init). After: ~18s estimated (0s planner skip + 7s ReAct loop + 0s verifier + 0s screenshot skip). The verifier uses direct `listWindows()` API call instead of screenshot diff, completing in <100ms.
