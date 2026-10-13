# src/renderer — React palette shell

Parent rail: `../../AGENTS.md`. This doc owns the renderer root, the app-shell components, and the renderer leaf folders. The IPC channel contract is owned by `../main/ipc/AGENTS.md`; hooks, shadcn primitives, ask-mode UI and the token system are owned by their own child docs below and are not restated here.

## Purpose

Render the frameless Alt+Space palette window content and nothing else: a fuzzy command/file palette that expands into the Ask-mode streaming chat. Own provider order, the dual-mode selection rule, app-shell layout, and the single `window.electronAPI` accessor discipline. No business logic, no IO, no Node — every capability crosses the preload bridge.

## Ownership

| Path | Owns |
|---|---|
| `main.tsx:9-19` | The mount tree, in this order: `StrictMode` > `ErrorBoundary` > `ThemeProvider` > `TooltipProvider` > `App`. Fixed contract — do not reorder or add providers here without updating this line |
| `App.tsx:36-316` | The SOLE orchestrator. App loading `:43-65`, item merge `:68-70`, search `:73-79`, `searchMode` state `:81`, window mode `:82`, recent files `:83`, command execution `:84-90`, MCP count `:95-97`, attachments `:99-106`, file search `:109-117`, result merge `:120-131`, `handleAskAbout` `:145-154`, keyboard `:156-168`, theme shortcut `:171-185`, window-drag handle `:188-232`, resize handle render `:300-313`. It renders one content child: `<CommandPalette>` `:243-288`, plus the loading overlay `:292-296` and the resize handle `:300-313` |
| `index.html` | CSP meta (`:6`), `#root` (`:26`), module entry `./main.tsx` (`:27`). `connect-src` whitelists the Vite dev ports; any new origin is edited here, not elsewhere |
| `components/` (21 files, root level) | App shell: `CommandPalette`, `CommandPaletteHeader`, `CommandPaletteBody`, `CommandPaletteFooter`, `SearchBar`, `ModeTabs`, `ResultsList`, `ResultItem`, `SearchEmptyState`, `FooterTips`, `ShortcutsReference`, `ThemeToggle`, `ErrorBoundary`, `AskModeExpanded`, `ChatMessageBubble`, `ChatHistoryDropdown`, `MCPServerCard`, `MCPToolModal` + the three dead files listed under Dead code |
| `components/common/` | `ShortcutKeys.tsx` only — the single shared shortcut-display primitive (4 importers: `SearchBar`, `ShortcutsReference`, `ask-mode/UnifiedCommandBar`, and dead `ActionPanel`) |
| `lib/utils.ts:4` | `cn()` (clsx + tailwind-merge). The only class-merging helper |
| `utils/` | `debugLogger.ts` (the only logging surface), `shortcuts.ts` (OS modifier abstraction), `fuzzySearch.ts` (feeds `useSearch`), `fileActions.ts`, `fileUtils.ts`, `formatTime.ts`, `costCalculator.ts`, `errorClassifier.ts` |
| `types/` | `ask-types.ts:1` `AttachedFile` (the cross-boundary attachment shape), `commandPalette.ts:5` a thin re-export of `SearchMode`, `electron.d.ts:1-7` the live `Window.electronAPI` declaration. `search.ts` is dead |
| `context/` + `contexts/` | `context/ThemeProvider.tsx` (theme) and `contexts/ToastContext.tsx` (toasts). Both live — see Local Contracts |
| `data/` | `mockAskData.ts` only. Dead — see below |
| `types.d.ts` (renderer root) | STALE duplicate. Must never be extended; see the bridge contract |

## Local Contracts

- **Two orthogonal "modes" — never conflate them.** `windowMode` `'compact' | 'expanded' | 'custom'` (`hooks/useWindowMode.ts:5`) is the window geometry, driven from main over IPC (`:29-69`). `searchMode` `'file' | 'ai'` (`components/ModeTabs.tsx:7`, state held at `App.tsx:81`) is the palette tab. They intersect at exactly one place: `components/CommandPaletteBody.tsx:66` — `searchMode === 'ai' && windowMode === 'expanded'` renders `AskModeExpanded`, otherwise `ResultsList`/`SearchEmptyState`. `CommandPalette.tsx:94-96` hides results and footer in compact.
- **`CommandPalette` must work both controlled and standalone.** `:71-73` fall back to local state when `searchMode`/`onSearchModeChange` are absent; `:84-85` do the same for `showShortcuts`. Keep the fallback — the palette is mounted without props in isolation harnesses.
- **Result merge is one memo, in one place** (`App.tsx:120-131`): query + `searchMode === 'ai'` → only `baseResults`; query in file mode → `fileResults` prepended to `baseResults`; no query → `baseResults`. `useFileSearch` is disabled outright in AI mode (`App.tsx:114`). Change ordering in that memo only, never inside `ResultsList`.
- **`handleAskAbout` is the file→AI handoff** (`App.tsx:145-154`): attaches the selected result, seeds the query text, flips `searchMode` to `'ai'`. Fired from `useKeyboard.ts:80-84` and passed down at `App.tsx:284`. It only reaches chat when `windowMode === 'expanded'` (`CommandPaletteBody.tsx:66`) — compact mode is a no-op by design.
- **The window drag/resize handle lives at App level, outside the rounded container** (`App.tsx:187-232`, rendered only in expanded at `:300-313`) because `CommandPalette`'s `overflow-hidden` would clip it. Keep pointer-drag logic here, not in a shell component.
- **`ErrorBoundary.tsx:11` is the only class component in the renderer** (`getDerivedStateFromError` `:19`, `componentDidCatch` `:23`, optional `fallback` prop `:4`). It wraps the whole tree (`main.tsx:11`) and owns the single sanctioned non-logger `console.error` (`:24`).
- **No code splitting exists here.** Zero `React.lazy` or dynamic `import()` in live renderer code — the only hit is dead `data/mockAskData.ts:124`. The <500ms budget is met by keeping the tree small; do not document lazy loading as current behaviour.
- **One preload, four hand-synced sites.** `src/preload/preload.ts:161` exports `electronAPI` → `:411` `contextBridge.exposeInMainWorld('electronAPI', …)` → `:419` `export type ElectronAPI = typeof electronAPI` → `types/electron.d.ts:1-7` declares the global. Renderer code only ever reaches main through `window.electronAPI`; it never imports from `src/main`.
- **Do not extend the stale bridge duplicates.** `types.d.ts:71-219` hand-maintains a second `ElectronAPI` interface plus its own `declare global` (`:215`), and `src/preload/types.d.ts:1-3` re-exports from it. Both are drift magnets: adding a channel type there is the single most common way an editor here desyncs the bridge. Types flow from `typeof electronAPI`, not from these files.
- **Channel namespaces available to the renderer** (`preload.ts:163-406`): `app:*` (version/platform/systemInfo/quit), `window:hide|setMode|getMode|toggleMode|setCustomDimensions|resizeHeight|getHeight`, `command:execute`, `url:open`, `file:open|revealInFolder|search|everything:status`, `apps:list`, `debug:log`, `chat:*` (11 invokes + `resumeGraph`), `browser:*`, `mcp:*`, `dialog:openFile|openFolder`, `api-config:save|load|delete|test`.
- **Push listeners**: `window:shown|will-hide|modeChanged` (`preload.ts:47,54,59`), `desktop:screenshot:capture` (`:64`), `chat:*`, `browser:*`. Every `on*` returns an unsubscribe function and the subscriber MUST store and call it — `hooks/useChatSession.ts:124-386` is the exemplar.
- **Every `electronAPI` promise is rejected-handled at the call site** — `.catch()` (`App.tsx:214,271`) or `try/catch` (`hooks/useWindowMode.ts:31-37`). A rejected IPC call must never reach the console.
- **`context/` and `contexts/` are BOTH live; the collision is the defect, not a candidate for deletion.** `context/ThemeProvider.tsx` is mounted at `main.tsx:4` and consumed at `App.tsx:13`; `contexts/ToastContext.tsx` is consumed at `components/AskModeExpanded.tsx:5` and `hooks/useToast.ts:1`. Document which is which in any new import; merge them only as a deliberate, all-importers-at-once change.
- **State management is React-only.** No store library, no redux, no zustand. `useState`/`useReducer` plus props; context is reserved for theme and toast. `useReducer` is used where IPC events drive a state machine — `browserReducer`/`desktopReducer` from `hooks/useBrowserState.ts:32` and `hooks/useDesktopState.ts:34`, consumed at `AskModeExpanded.tsx:8-9`.
- **Styling: pointer only.** Tokens belong to `styles/AGENTS.md`. The sanctioned forms at this level are `@theme`/`@theme inline` utilities and `var(--token)`; the drift check is `grep -rn "\-\[" src/renderer/components/` and any hit is reviewed against that doc, not fixed ad hoc.
- **Dead code — proven zero importers repo-wide.** `components/ApiKeySetup.tsx`, `components/ContextUsageIndicator.tsx`, `components/ActionPanel.tsx` (the component is imported nowhere; only its prop plumbing survives as `onOpenActionPanel` in `hooks/useKeyboard.ts:18,31,42,52,102`, which `App.tsx:156-168` never passes), `hooks/useDebounce.ts`, `hooks/useFocusTrap.ts`, `utils/citationFormatter.ts`, `types/search.ts`, and all of `data/` (`data/mockAskData.ts`). Do not import, extend, or wire them up; do not document them as live. Deletion needs an explicit request.

## Work Guidance

- New renderer state goes in `App.tsx` only if it is cross-cutting orchestration; otherwise it belongs in a hook under `hooks/` and arrives as props.
- Data flows one way: `App` owns palette state, shell components are presentational. The single exception is `AskModeExpanded`, which calls `hooks/useChatSession` itself rather than receiving chat state as props — the session surface is too large to prop-drill. Do not create a third pattern.
- Add a component: named function export only (`export function X`), PascalCase, props interface exported from the same file next to the component (`CommandPalette.tsx:13`, `ModeTabs.tsx:9`). Type ownership: `SearchResult` is owned by `ResultsList.tsx:7`, `SearchMode` by `ModeTabs.tsx:7`; `types/commandPalette.ts:5` is a re-export, not a second definition.
- Class strings go through `cn()` (`lib/utils.ts:4`) as a multi-line array with one mockup-line comment per token group — copy the shape at `CommandPalette.tsx:176-193`.
- Import alias `@/` → `src/renderer` (`tsconfig.json:18`, `vitest.config.ts:23`). Relative paths are legacy; new code prefers `@/`.
- Never call `console.*`. Use `logInfo`/`logWarn`/`logError`/`logDebug`, gated by `VITE_LOG_LEVEL` (`utils/debugLogger.ts:16-27`). `utils/fileActions.ts:18,49` still uses `.catch(console.error)` — that is existing debt, not a pattern to copy.
- Keep functions under 50 lines (root rail). `App.tsx` is already at the ceiling: extract into a hook rather than adding another effect block.
- New IPC channel = four edits (preload method, `ipcMain.handle`, renderer call site, nothing in the stale `.d.ts` files) — full recipe in `../main/ipc/AGENTS.md`.

## Verification

- **Zero renderer tests exist**: no `*.test.tsx` anywhere in the repo, and the two `*.test.ts` files (`src/main/ipc/handlers.test.ts`, `src/main/services/langgraph/research-agent.test.ts`) are main-process. Vitest is renderer-ready (`vitest.config.ts:8` jsdom, `:23` `@/` alias), so the first renderer test needs no config work — just add it to `src/**/*.test.{ts,tsx}`.
- Real gate: `npm run lint`. `eslint.config.js:40-42` sets `react-hooks/rules-of-hooks` to **error** and `react-hooks/exhaustive-deps` + `@typescript-eslint/no-explicit-any` to **warn** — which is why `ChatMessageBubble.tsx:1` carries a file-wide `eslint-disable` for `no-explicit-any` and still passes. Warnings do not block; review hook deps by eye.
- Then `npm run dev` and exercise the palette by hand (keyboard smoke steps are in `hooks/AGENTS.md`).
- `npm run typecheck` **cannot run in this checkout**: `node_modules` is absent, and `tsconfig.json:16` still sets `baseUrl`, an option TypeScript 6.0 rejects (TS5102). Remove `baseUrl` only when explicitly asked; until then, do not chase phantom type errors.

## Child DOX Index

| Doc | Owns |
|---|---|
| `hooks/AGENTS.md` | Hook contracts: `useKeyboard` re-entrancy and Escape ordering, listener cleanup, `electronAPI` callers |
| `components/ui/AGENTS.md` | shadcn primitives: pristine-for-update rule, CVA recipe, `data-slot`, add/diff workflow |
| `components/ask-mode/AGENTS.md` | Ask-mode UI incl. `GenerativeUI/` and `Transparency/`: props, a11y, dual styling model |
| `styles/AGENTS.md` | Three-layer token system: `tokens/` → `semantic/theme.css` → component, naming, dark mode, drift grep |

Leaf folders with no doc of their own (rules live here): `lib/`, `utils/`, `types/`, `context/`, `contexts/`, `data/`, `components/common/`.
