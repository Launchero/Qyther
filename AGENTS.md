# Qyther — DOX root rail

DOX is installed here. AGENTS.md files are binding work contracts for their subtree. This file is the rail: repo-wide rules, global preferences, and the Child DOX Index. Closer docs control local work details; no child doc may weaken DOX.

## Core Contract

**Read before editing**

1. Read this file.
2. List every file or folder you expect to touch.
3. Walk from the repository root to each target path and read every AGENTS.md on that route, following the Child DOX Index.
4. Nearest doc = local contract; parents = repo-wide rules. On conflict the closer doc wins local detail — never DOX itself.
5. Do not rely on memory. Re-read the applicable chain in the current session.

**Update after editing** — every meaningful change requires a DOX pass before the task is done. Update the nearest owning doc when the change affects purpose, scope, ownership, durable structure, contracts, workflows, required inputs/outputs/permissions/artifacts, quality standards, behaviour or communication preferences, or any AGENTS.md create/delete/move/rename. Update parents when parent-level structure, ownership or a child index changes; update children when a parent change alters local rules. Delete stale or contradictory text immediately. Small edits that change no contract may leave docs unchanged, but the pass still happens.

**Closeout** — re-check changed paths against the chain → update nearest owning docs and affected parents/children → refresh every affected Child DOX Index → remove stale text → run existing verification where runnable → report docs intentionally left unchanged and why.

**Child doc shape** — create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials or quality standards. Section order: Purpose, Ownership, Local Contracts, Work Guidance, Verification, Child DOX Index. Leave Work Guidance empty if no standards exist yet; leave Verification empty if no check exists yet.

**Style** — concise, current, operational. Document stable contracts, not diary entries. Broad rules in parents, concrete detail in children. Direct bullets with explicit names. Do not duplicate a rule across scopes unless each scope needs its own version. Delete stale notes instead of explaining history.

## Stack (verified against this checkout)

- Electron 42, React 19, TypeScript 6.0, Vite 8, Tailwind v4, Zod v4 (`package.json:124-160`)
- Global shortcut: Alt+Space. Performance target: <500ms cold start.
- Windows native: `koffi`, `libwin32`, `node-winautomation` — these are the only three native modules that must stay in the build externals list (`electron.vite.config.ts:61`)
- Persistence: `sql.js` (`src/main/services/database/database-manager.ts:8`). `better-sqlite3` is declared in `package.json` and imported by nothing — do not use it or cite it as the storage layer
- Also declared but imported by nothing: `openai`, `fuse.js`, `langsmith`, `clipboard-event`, `@langchain/community`. LLM access is `@langchain/openai`
- Document generation: `docx`, `pptxgenjs`, `xlsx`, `mammoth`, `pdf-parse`, `unzipper`; OCR: `tesseract.js`; UI: `radix-ui` barrel, `class-variance-authority`, `recharts`, `@phosphor-icons/react`

## Essential Commands

```bash
npm run dev            # electron-vite dev (the only runtime harness that exists)
npm run build          # production build
npm run preview        # preview production build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src/**/*.ts src/**/*.tsx
npm run test           # vitest run  — see Verification below before trusting this
npm run test:watch
npm run test:coverage
npm run build:win      # electron-builder NSIS x64 installer
npm run build:win:dir  # unpacked dir build
npm run generate-icons # node scripts/generate-icons.js
npm run install-playwright # npx playwright install chromium (needed by the Playwright MCP browser agent)
```

`node_modules` is not committed; `typecheck`, `lint` and `test` need `npm install` first. Native deps (`koffi`, `node-winautomation`, `sql.js`) require a rebuild step on a fresh Windows checkout — `npx electron-rebuild`.

## Repo-Wide Invariants

- **Every IPC channel is four hand-synced sites.** Channel string in `src/preload/preload.ts` → `ipcMain.handle` in `src/main/ipc/*` → call site in renderer → type in `src/renderer/types/electron.d.ts`. There is no shared schema and no codegen. Contract detail lives in `src/main/ipc/AGENTS.md`.
- **There are no shared IPC validators.** The names `validateUrl`, `validatePath` and `isCommandSafe` exist only as local functions inside `src/main/ipc/handlers.test.ts:6,48,82` — production handlers validate inline, and the test file tests its own copies. Validation is split asymmetrically between the two layers: `url:open` and `file:open` check in main, `command:execute` and `file:search` check ONLY in `src/preload/preload.ts` (`command:execute`'s blocklist at `preload.ts:188-193`, raw `promisify(exec)` at `handlers.ts:128-141`), and `file:revealInFolder` has no check anywhere. Because the preload layer is renderer-reachable, a direct `ipcRenderer.invoke` bypasses those guards. Full per-channel table in `src/main/ipc/AGENTS.md`.
- **Renderer never imports from main.** It talks through `window.electronAPI`; the type comes from `src/renderer/types/electron.d.ts`, which re-exports `typeof electronAPI`. `src/renderer/types.d.ts` and `src/preload/types.d.ts` are stale hand-maintained duplicates — do not extend them.
- **Sandbox is on**: `app.enableSandbox()` (`main.ts:40`) with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`windows.ts:62-64`). Preload compiles to CJS and is loaded as `../preload/preload.cjs`. Dev-only relaxations: remote-debugging port 9222 (`main.ts:53`).
- **No `requestSingleInstanceLock` and no blur-to-hide exist in this codebase.** Window hide happens on `close` (`windows.ts:104-111`) and `window:hide` (`handlers.ts:49`). Do not document either as current behaviour.
- **New logger subsystems need a registry entry.** An unregistered name in `createLogger('<Subsystem>')` inherits `globalLevel`, which defaults to `error` in production (`src/main/utils/logger.ts:41-49,92-96`), so its `info`/`debug` lines never appear and no env switch can enable them. Add a `SUBSYSTEM_ENV_VARS` entry (`logger.ts:57-84`) — none of the `Document*` logger names and most `Browser*` names are registered today. Same coupling for LangGraph node labels: `NODE_AGENT_MAP` (`src/main/ipc/chat-handlers.ts:32-38`) and the token-emitting `responseNodes` whitelist (`chat-handlers.ts:400-403`, duplicated at `:720-723`) — a new node missing either streams nothing, with no error.
- **Non-code runtime resources are not packaged by default.** `electron.vite.config.ts:11-49` copies only `sql-wasm.wasm` and `Automation.node` into `out/main`, and `package.json:39-42` ships `out/**/*` plus `package.json`. Anything else read from disk at runtime — notably `src/main/services/browser/skills/` — silently disappears in a production build. Adding a copy step requires an explicit request.
- **`.cursor/` does not exist** (gitignored at `.gitignore:82`). Never add `@design-tokens-enforcement`, `.cursor/rules/*` or `.cursor/skills/*` references — every such reference in this repo's older docs is dangling.
- **No browser tool is declared in this repo.** The browser agent drives Chromium through the Playwright MCP server (`mcp-config.json:15-24`) and selects tools by name prefix at runtime. Never hard-code a browser tool count.
- **Desktop automation is the only in-repo tool registry**: 32 tools (`src/main/services/desktop/desktop-tools.ts`), each requiring six coupled edits documented in `src/main/services/desktop/AGENTS.md`. Docs citing 26 or 28 tools are stale.

## Documentation Authority

Authoritative: this file, `overall-architecture.md` (correct "28 tools" to 32 before citing), `design-systems/SHADCN-DESIGN-SYSTEM.md`, `docs/desktop-agent-gap-analysis.md` (roadmap, not inventory).

Quarantined — stale enough to mislead; do not cite as authority and do not repair casually: `README.md` (wrong Electron/TS/Vite versions, advertises MIT while `LICENSE:1` is a commercial EULA, documents `USE_CUSTOM_LLM_PROVIDER`/`LLM_BASE_URL`/`LLM_PROVIDER_TYPE` env vars that exist nowhere in `src/`, lists `build:mac`/`build:linux` scripts that do not exist), `MCP-CONFIG.md` (`USE_MCP=true` is read by nothing), `COMPLETE-TEST-SUMMARY.md` and `config/opencode.json` (orphaned by `8b4b22e` which removed the OpenCode integration), `REFACTORING-SAFETY.md` (freezes a removed `electronAPI.opencode` surface), `docs/WEB-TOOLS-GUIDE.md` (documents Cursor, not Qyther), `UI-FIXES-SUMMARY.md` and `VISUAL-TESTING-REPORT.md` (point-in-time diaries that also celebrate the exact token violations the design system forbids), `docs/desktop-agent.md` (tool count stale). Empty tracked stubs: `browser-agent.md`, `desktop-agent.md`, `test-extract/es.zip`.

## Global Preferences

Karpathy operating principles: think in features not lines; treat instruction files as tunable code; context quality dominates output; simplicity bias — no speculative code, no abstractions for single-use, no unrequested configurability; bounded autonomy; instruction-first development. Maximum 50 lines per function. Every changed line must trace to the user's request.

Bounded autonomy defaults: 1–3 files per agent, 300s per experiment, one unambiguous metric, `git reset` on failure.

### Skill Navigation

| Situation | Use This Skill |
|---|---|
| **Executing approved plan (DEFAULT)** | `plan-executor-orchestrator` |
| Sequential subagent handoff & verification | `agent-handoff-verification` (rule) |
| Electron main process / architecture | `electron-core` |
| Electron + React integration | `electron-react-core` |
| IPC patterns (main <-> renderer) | `electron-react-ipc` |
| Security best practices | `electron-react-security` |
| Performance optimization | `electron-react-performance` |
| Component design patterns | `electron-react-components` |
| Electron-vite build config | `electron-react-build` |
| React 19 state patterns | `electron-react-state` |
| Testing patterns | `electron-react-testing` |
| LangGraph StateGraph / research agent | `langgraph-agent-patterns` |
| MCP server integration (tool calling) | `mcp-server-integration` |
| Structured LLM output to React components | `generative-ui-components` |
| Electron data persistence (SQLite, better-sqlite3) | `electron-data` |
| Electron performance profiling | `electron-performance` |
| TypeScript type patterns | `typescript-core` |
| TypeScript performance optimization | `typescript-performance` |
| TypeScript security patterns | `typescript-security` |
| TypeScript UI patterns | `typescript-ui` |
| Raw SQLite patterns (hooks state) | `sqlite-patterns` |
| Windows-specific hook development | `cursor-hooks-windows-dev` |

Tooling: use WebSearch for current info, WebFetch for docs URLs, Context7 MCP for library APIs, and a real browser for frontend testing.

## UI & Design System

Token-driven architecture is mandatory: never hardcode pixel values or OKLCH colours — use `var(--token-name)` or the Tailwind utilities generated from `@theme` / `@theme inline`. Dark mode is `.dark` + `@custom-variant dark (&:is(.dark *))` (`src/renderer/styles/globals.css:14`). Folder split is `components/ui/` pristine shadcn primitives, `components/common/` domain wrappers, `components/ask-mode/` ask-mode domain, `components/` app shell. Full contracts live in `src/renderer/styles/AGENTS.md`, `src/renderer/components/ui/AGENTS.md` and `src/renderer/components/ask-mode/AGENTS.md`; the token authority is `design-systems/SHADCN-DESIGN-SYSTEM.md`.

## Child DOX Index

| Doc | Owns |
|---|---|
| `src/main/AGENTS.md` | Electron host shell: bootstrap order, window/mode lifecycle, tray, Alt+Space hook, preferences, logging, platform utils |
| `src/main/ipc/AGENTS.md` | The IPC surface across `src/main/ipc/*` and `src/preload/`: channel naming, validation, push/pull plumbing, known bridge drift |
| `src/main/services/AGENTS.md` | Agent-runtime parent: graph entry, cross-process streaming contract, `langchain/agent.ts` model bootstrap, child routing |
| `src/main/services/langgraph/AGENTS.md` | AskGraph build, `AskState` annotations and reducers, node/edge recipe, in-graph tools |
| `src/main/services/mcp/AGENTS.md` | MCP **client** only: config-file-driven server/tool addition, intent/keyword prefix maps |
| `src/main/services/database/AGENTS.md` | sql.js persistence: migration recipe, trajectory/failure tables |
| `src/main/services/desktop/AGENTS.md` | Windows GUI automation agent: the 6-step tool registration, DANGER_POLICY/HITL, verifier-recovery, koffi/libwin32/UIA backends |
| `src/main/services/document/AGENTS.md` | docx/pptx/xlsx generation subgraph, `~/Documents` write sandbox, desktop delegation |
| `src/main/services/browser/AGENTS.md` | Playwright-MCP browser subgraph: prefix tool resolution, skills loading, session lifecycle, packaging gap |
| `src/main/services/browser/skills/AGENTS.md` | `SKILL.md` runtime prompt material: front matter contract, routing-by-description, references/scripts layout |
| `src/renderer/AGENTS.md` | Renderer composition: provider order, dual-mode selection, `window.electronAPI` accessor, app-shell components, proven-dead files |
| `src/renderer/hooks/AGENTS.md` | Hook contracts: `useKeyboard` re-entrancy and Escape ordering, listener cleanup, `electronAPI` callers |
| `src/renderer/components/ui/AGENTS.md` | shadcn primitives: pristine-for-update rule, CVA recipe, `data-slot`, add/diff workflow |
| `src/renderer/components/ask-mode/AGENTS.md` | Ask-mode UI incl. `GenerativeUI/` payload registry and `Transparency/`: props, a11y, dual styling model |
| `src/renderer/styles/AGENTS.md` | Three-layer token system: `tokens/` → `semantic/theme.css` → component, naming, dark mode, drift grep |
| `docs/AGENTS.md` | Documentation boundary: which files are live vs diary, changelog convention, freshness classification rule |

Leaf folders with no doc of their own (rules live in the nearest parent above): `src/preload/`, `src/main/utils/`, `src/main/types/`, `src/main/services/utils/`, `src/main/services/langchain/`, `src/renderer/lib/`, `src/renderer/utils/`, `src/renderer/types/`, `src/renderer/context/`, `src/renderer/contexts/`, `src/renderer/data/`, `src/renderer/components/common/`, `public/`, `assets/`, `scripts/`, `config/`, `design-systems/`.
