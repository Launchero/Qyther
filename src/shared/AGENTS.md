# src/shared — cross-process boundary types

Parent rail: `../../AGENTS.md`. This folder is the only tree imported by `main`, `preload` and `renderer` at once. It exists because a payload shape declared three ways drifts, and one of those declarations (`src/renderer/types.d.ts`) wins at `tsc`.

## Purpose

Hold the value types and pure semantics that cross the IPC boundary. Not a place for logic that belongs to a process: no Electron APIs, no `fs`, no `ipcRenderer`, no React, no DOM.

## Ownership

| Path | Owns |
|---|---|
| `ipc/turn.ts` | `TurnEnvelope` (`{threadId?, sessionId?, seq?}`) and `isCurrentTurnEvent()`, the renderer's stale-event predicate |
| `ipc/sessions.ts` | `ChatSessionSummary` — one row of the list main pushes on `chat:sessions-changed`; types-only, imported by main, preload and the renderer, so the history list cannot be declared three ways |
| `ipc/turn.test.ts` | Asserts both directions of that predicate — dropping a superseded turn and accepting an unstamped one |

`ipc/hitl-decision.ts` (`HitlDecision`, `toHitlDecision`, `isApproved`) and its test were **deleted** with the approval gate. Nothing in `src/` imports a HITL type; `HitlDecision` must not be reintroduced as a shape, because there is no channel left to carry it.

## Local Contracts

- **Types-only by default.** A file here is `import type`-able so it is erased at build and adds nothing to the sandboxed preload CJS bundle or the renderer graph. A module that ships runtime code must stay pure: deterministic, no IO, no process globals, and small enough to import everywhere.
- **`TurnEnvelope` fields are all optional, and that is load-bearing, not convenience.** The one chat pump (`chat:sendStreamMessage`) stamps, so the only producer that can emit an unstamped event is main's pre-turn failure fallback — a terminal chunk sent when the turn never opened. `isCurrentTurnEvent` must therefore **accept** an event with no `threadId`: rejecting it would drop the only end-of-turn signal and strand the renderer's `isLoading` forever. The consumer logs a warning on the unstamped path so a newly-missed push site becomes visible instead of silently positional again.
- **Sequence is compared per channel, never globally.** `beginTurn` shares one counter across `chat:stream-chunk` / `chat:thinking-step` / `chat:agent-change`, but those are separate IPC channels and the renderer may receive them interleaved, so a shared high-water mark would reject a valid chunk that arrived after a higher-numbered step on another channel. `useChatSession` keeps a `lastSeqByChannel` map for exactly this reason.
- **Do not "helpfully" accept legacy shapes.** If a future channel ever carries a permission or decision, its normaliser must reject every unrecognised input rather than coercing it. The precedent is `toHitlDecision`, which is deleted but whose rule survives: fail closed, never open.
- **Adding a shared type does not reduce the four-site IPC rule.** Registration (`preload.ts` → `ipcMain.handle` → call site → `types/electron.d.ts`, plus `src/renderer/types.d.ts` when that file already names the channel) is still manual; this folder removes only the duplicate *definition*.

## Work Guidance

- Named exports only; keep one concept per file (`ipc/<thing>.ts`).
- Mirror `command-guard.ts`'s proven shape: pure, Electron-free, production-imported by its own test.
- Extend this folder only when a payload is currently declared in more than one of `preload.ts`, `src/renderer/types.d.ts`, `src/renderer/types/electron.d.ts`. One-off private shapes stay with their process.

## Verification

- `npm run typecheck` and `npm run test` both cover this tree: `ipc/turn.test.ts`, which asserts both directions of the renderer's stale-event predicate. There is no longer any decision parser here to test.
- `grep -rn "from 'electron'\|require('electron')\|ipcRenderer\|document\.\|window\.electronAPI" src/shared/ --include=*.ts` must stay empty. Scope it to code: this doc names the very strings it bans, so an unscoped grep always matches itself.

## Child DOX Index

Leaf doc — `src/shared/ipc/` owns no child docs.
