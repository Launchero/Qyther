# Contributing to Qyther

Thank you for your interest in contributing. This document is the practical guide for working in this repository. It is short because most of the real rules live in the nested `AGENTS.md` files, which are binding work contracts, not optional reading.

Qyther is a Windows-first, frameless, always-on-top command palette (global hotkey Alt+Space) built with Electron 42, React 19, TypeScript 6.0, Vite 8, Tailwind v4 and Zod v4. It also ships an AI "Ask" mode running a LangGraph agent, including a Windows GUI automation agent that can drive your real desktop. Read `SECURITY.md` before changing anything on those paths.

## Before you open a file

The repository uses "DOX": nested `AGENTS.md` work contracts. The root `AGENTS.md` is the rail with repo-wide rules; each owned subtree has its own `AGENTS.md` with Purpose, Ownership, Local Contracts, Work Guidance, Verification and a Child DOX Index.

The rule for contributors, in two parts:

1. **Read before editing.** Walk from the repository root to every path you intend to touch and read every `AGENTS.md` on that route. The nearest doc is your local contract; parent docs hold the repo-wide rules. A closer doc may change local detail, but it can never weaken the root rail. Do not rely on memory — re-read the chain in the same session.
2. **Update after editing.** Every meaningful change requires an `AGENTS.md` pass before the work is done. Update the nearest owning doc when your change affects purpose, scope, ownership, structure, contracts, required inputs or outputs, behaviour, or workflows. Update parents when a parent-level structure or child index changes. Delete text that your change made stale or contradictory. Small edits that change no contract may leave docs untouched, but the pass still happens.

Start with these if your change touches them:

- `src/main/ipc/AGENTS.md` — the IPC surface, including `src/preload/`
- `src/main/AGENTS.md` — main-process boot ordering, window modes, tray, global hotkey, logging
- `src/main/services/AGENTS.md` and its children (`langgraph/`, `desktop/`, `browser/`, `document/`, `mcp/`, `database/`) — the agent runtime
- `src/renderer/AGENTS.md`, `src/renderer/hooks/AGENTS.md`, `src/renderer/components/ui/AGENTS.md`, `src/renderer/components/ask-mode/AGENTS.md`
- `src/renderer/styles/AGENTS.md` and `design-systems/SHADCN-DESIGN-SYSTEM.md` — the token system
- `docs/AGENTS.md` — which documents are live and which are historical

## Environment setup

Qyther is Windows-only. Packaging targets are Windows NSIS x64 only; there is no `build:mac` or `build:linux` script.

1. Install Node. Node 22 or newer is recommended; the maintainer develops on Node 24. There is no `engines` field in `package.json` yet, so no version range is formally supported.
2. `npm install`
3. Rebuild the native dependencies: `npx electron-rebuild`. Three native modules must stay in the build externals list in `electron.vite.config.ts`: `koffi`, `libwin32` and `node-winautomation`.
4. Copy `.env.example` to `.env` and fill in the required values: `API_KEY`, `BASE_URL` and `MODEL`. Optional: `FAST_MODEL`, and `TAVILY_API_KEY` / `BRAVE_API_KEY` / `JINA_API_KEY` for web search and the remote page reader. These are the only names the code reads — there is no `OPENAI_API_KEY` support and no `LLM_*` support. `BASE_URL` can point at any OpenAI-compatible endpoint; the model layer is `@langchain/openai`.
5. Optional, for browser automation: `npm run install-playwright` (installs Chromium for the Playwright MCP server).
6. File search needs the Everything CLI (`es.exe`). `src/main/utils/esDownloader.ts` will locate or download it on Windows.

`node_modules` is not committed, so `typecheck`, `lint` and `test` all require the install step first.

## Commands

```
npm run dev             # electron-vite dev server (the only runtime harness that exists)
npm run build           # production build
npm run preview         # preview the production build
npm run typecheck       # tsc --noEmit
npm run lint            # eslint "src/**/*.ts" "src/**/*.tsx"
npm run test            # vitest run
npm run test:watch
npm run test:coverage
npm run build:win       # electron-builder NSIS x64 installer
npm run build:win:dir   # unpacked directory build
npm run generate-icons  # node scripts/generate-icons.js
```

## The two sync rules that break silently

These are the manual couplings most often mishandled. Neither has a shared schema, codegen, or an automated test behind it.

### Every IPC channel is four hand-synced sites

A channel is only alive when all four exist:

1. the channel string in `src/preload/preload.ts`
2. the matching `ipcMain.handle` in `src/main/ipc/`
3. the call site in the renderer (`window.electronAPI.…`)
4. the type at `src/renderer/types/electron.d.ts`

Site 4 is not a second declaration: `electron.d.ts` imports `ElectronAPI` from `src/preload/preload.ts`, which is `export type ElectronAPI = typeof electronAPI` (`preload.ts:416`). You normally change nothing there. Never add a channel type to `src/preload/types.d.ts` or `src/renderer/types.d.ts` — both are stale hand-maintained duplicates and extending one is the most common way to desync the bridge.

Channel names follow `namespace:camelCaseVerb`. The existing namespaces are `app`, `window`, `command`, `url`, `file`, `apps`, `dialog`, `debug`, `chat`, `mcp`, `browser`, `api-config`. The two three-segment exceptions (`file:everything:status`, `desktop:screenshot:capture`) are existing debt; do not add new ones casually. Validate in main, not only in preload — main is the only boundary the sandbox actually guarantees. `src/main/ipc/AGENTS.md` has the per-channel validation table and the current drift list.

### Adding one desktop tool is four coupled edits

The Windows automation registry has 32 tools, all TypeBox `AgentTool`s in `src/main/services/pi/toolbox.ts` (they were zod `tool()` factories in the now-deleted `desktop/desktop-tools.ts` until the Pi cutover). Adding a 33rd requires all four edits:

1. the `AgentTool` factory in `src/main/services/pi/toolbox.ts`, with its TypeBox `parameters` schema inline — that schema is the single source of truth for the `execute` signature, so never hand-duplicate a params type beside it
2. the name added to the frozen list in `src/main/services/pi/toolbox.test.ts` — the suite fails on a mismatch, which is the one step the compiler-equivalent enforces
3. a `details.status` on the result, chosen from `PiToolStatus`, so the renderer does not report "capturing" for that tool forever; plus `details.verifies: true` **only** if the tool should run the pixel verifier (`close_window` is the only one that does today)
4. a guidance line in the system prompt (`src/main/services/pi/prompt.ts`), or the model will not prefer the tool over a screenshot

There is **no** `DANGER_POLICY` row and **no** `inferStatusFromTool` branch any more — both died with `desktop-agent.ts`, and neither is replaced. Nothing pauses for approval: that gate was removed by decision, so every tool runs without asking. `details.verifies` is the only surviving opt-in, and it feeds one automatic pixel check.

## Styling law

Hardcoded pixel values and colors are not allowed in the renderer. Use the three-layer token system: `src/renderer/styles/tokens/*.css` (base) -> `src/renderer/styles/semantic/theme.css` (semantic) -> component. Never skip the semantic layer, and never put a color literal in JSX. OKLCH appears only inside `tokens/`. Dark mode is a `.dark` class with `@custom-variant dark (&:is(.dark *))` (`src/renderer/styles/globals.css:14`); to react to the theme, override the semantic variable in `semantic/theme.css`, do not scatter `dark:` utilities through feature components.

Run these three greps before you open a pull request (`src/renderer/styles/AGENTS.md` is the authority):

```
grep -rn "\-\[" src/renderer/components/            # census: every hit must be -[var(--token)] or a documented non-token value
grep -rn "oklch(" src/renderer/components/          # must be empty
grep -rn "@theme inline" src/                       # must return exactly one hit, src/renderer/styles/semantic/theme.css:18
```

The CI workflow enforces the second and third of these.

## Code style

- Named exports only: `export function X(…)` for components; `export class X` with `export const x = new X()` as the file's last line for service classes.
- Kebab-case filenames.
- Zod is for the LLM boundary only (tool input schemas, structured output). Put a `.describe()` on every field — the descriptions are the model's only schema documentation.
- No `console.*`. Main process: `createLogger('<Subsystem>')` at module scope. **A new subsystem name must be added to `SUBSYSTEM_ENV_VARS` in `src/main/utils/logger.ts:57-84`** or it inherits the global level, which defaults to `error` in production, so its `info` and `debug` lines are dropped and no environment switch can bring them back. Renderer: `logInfo`/`logWarn`/`logError`/`logDebug` from `src/renderer/utils/debugLogger.ts`.
- Maximum 50 lines per function. No abstractions for single use, no speculative configurability, no error handling for conditions that cannot occur.
- LangGraph nodes return `Partial<State>` and never mutate state; pick each new state field's reducer deliberately (see `src/main/services/langgraph/AGENTS.md`).
- The renderer never imports from `src/main`; it talks through `window.electronAPI`.
- There is no store library. `useState`/`useReducer` plus props, with context reserved for theme and toast.

## Testing

Be careful reading the test situation correctly, because the honest answer is uncomfortable.

`npm run test` runs `vitest run` with `include: ['src/**/*.test.{ts,tsx}']` (`vitest.config.ts:8`). That collects 38 files / 305 tests (measured 2026-10-15). 35 of them import production code; three do not:

- `src/main/ipc/handlers.test.ts` re-declares its own `validateUrl`/`validatePath`/`isCommandSafe`.
- `src/main/services/desktop/ocr.test.ts` re-implements its subject against `pngjs`.
- `src/main/services/mcp/client-contract.test.ts` imports only the MCP adapter library (it drives the repo's own stdio MCP server, so it is a dependency-behaviour contract, not coverage of this repo).

A green run therefore under-proves the handler surface. The 32 desktop tools (`pi/toolbox.test.ts`), the Pi event bridge (`pi/events.test.ts`), the Pi cancellation path (`pi/cancel.test.ts`), the window singleton, the graph-node registry and the quit-time teardown policy (`src/main/lifecycle.test.ts`) all do have real gates. Still uncovered: the `will-quit` wiring in `main.ts` itself (it imports `electron` and `koffi` at module scope, so it cannot be imported under vitest — which is why the teardown *policy* was split into an Electron-free module to be testable at all), the graph node bodies, the token-stream pump, the desktop agent loop itself, and the browser subtree. `npm run harness:selftest` is the only gate that exercises the shipped window.

One test is known to flake under machine load: `useWindowTween.test.tsx` awaits real `setTimeout` and asserts a count of real jsdom rAF callbacks inside 100 ms, so a busy CPU can starve it. It has passed in isolation every time it has failed in a full run. Do not loosen its assertion to make it quiet — that bound is what distinguishes a working frame pump from a broken one.

What this means for you:

- A green `npm run test` is not evidence that your change works. Use `npm run typecheck`, `npm run lint`, and `npm run dev` as the real gates.
- When you fix a bug, add a test that imports the production module and fails without your fix. That is the single most valuable contribution you can make right now.
- When you touch an untested surface, state in the pull request exactly what you verified by hand and what you could not verify.
- Vitest is already renderer-ready (`environment: 'jsdom'`, `@/` alias to `src/renderer`), so the first renderer or hook test needs no config work. `src/renderer/hooks/useSearch.ts` is pure filter and rank logic and is the cheapest useful test to write.

## Pull requests

1. Keep the change to one coherent thing. If you notice unrelated problems, report them instead of folding a drive-by fix into the branch.
2. Every changed line must trace back to the request you are addressing.
3. Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` and the three style greps above.
4. Do your `AGENTS.md` pass in the same branch as the code change, not after the fact.
5. Do not add a dependency without explaining why the existing stack cannot do the job. Several declared packages (`openai`, `fuse.js`, `langsmith`, `clipboard-event`, `@langchain/community`, `better-sqlite3`) are imported by nothing — their presence is not precedent for adding another.
6. Use the pull request template in `.github/pull_request_template.md` and fill in the "what you could not verify" section.

Before pushing, check that you have not committed secrets: `.env`, `*.pem` and `*.key` are gitignored and must stay local. `mcp-config.json` **is** tracked, and its per-server `env` blocks (`src/main/services/mcp/client.ts:70` passes `cfg.env` straight to the spawned process) are committed too, so never put a real credential in that file or in a pull request. (`README.md` currently claims MIT; that is not accurate — `LICENSE` controls.)

## Licensing and contribution terms

Qyther is **not** MIT licensed. `LICENSE` is the proprietary "QYTHER COMMERCIAL SOFTWARE LICENSE" (`LICENSE:1`) and `package.json` declares `"license": "SEE LICENSE IN LICENSE"`. The source is available to read, and the license terms in `LICENSE` govern what you may do with it, including that commercial use requires the grant described there.

By submitting a pull request you agree that your contribution is licensed to the project under the same terms as the rest of the repository, and that you have the right to offer it. There is no separate Contributor License Agreement; do not sign anything or expect one.

Maintainers may decline a contribution for any reason, including licensing or scope. Nothing in this document grants rights beyond `LICENSE`.
