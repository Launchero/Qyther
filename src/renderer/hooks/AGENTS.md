# src/renderer/hooks — Hook contracts

Parent rail: `../AGENTS.md`. This doc owns the 20 files in `src/renderer/hooks/`. The bridge surface, provider order and dead-file list are the parent's; this doc controls hook-level contracts — re-entrancy, listener cleanup and `electronAPI` call discipline.

## Purpose

Hold every reusable behaviour the palette needs: global keyboard navigation, window-mode sync, search/filter, IPC-backed fetching, streaming chat state, focus routing. These are the only renderer modules that legitimately call `window.electronAPI` outside `App.tsx` and `utils/`.

## Ownership

| Hook | Owns |
|---|---|
| `useKeyboard.ts` (241 lines) | The global palette keymap: mode cycling, Emacs + Vim navigation, quick-execute, ask-about, help toggle, Escape-to-hide. Contract below |
| `useWindowMode.ts` (170 lines) | `WindowMode` union (`:5`), initial `window:getMode` (`:29-40`), `electron-window-mode-changed` listener (`:43-69`), `isCollapsing` flash, auto-expand threshold/debounce (`:12-13`). Consumed `App.tsx:82` |
| `useSearch.ts` | Fuzzy filter + relevance rank + slice of `allItems` (`:5-40`), and the `searchQuery`/`selectedIndex` pair. Consumed `App.tsx:73-79` |
| `useFileSearch.ts` (307 lines) | Debounced `file:search` IPC (`debounceMs` default 300, `:93`), `file:everything:status` probe (`:114-120`), mount-safe setState via `isMountedRef` (`:103-111`). Consumed `App.tsx:109-117` |
| `useCommandExecution.ts` | Dispatch of `SearchResult.action` to `app:quit` / `window:hide` / `url:open` / `file:open` (`:26-40`), plus the `executingId` in-flight marker. Consumed `App.tsx:84-90` |
| `useContextAttachments.ts` | `AttachedFile` list and the `dialog:openFile` / `dialog:openFolder` pickers. Consumed `App.tsx:99-106` |
| `useRecentFiles.ts` | `localStorage` key `recent-files` (`:9`), `StorageEvent` sync (`:37`), bounded to `maxFiles` (default 4). Consumed `App.tsx:83` |
| `useChatSession.ts` (608 lines) | Chat lifecycle: init, send/stream, sessions, HITL resume, and every `chat:*` push listener; the cleanup exemplar at `:124-386`. Consumed `AskModeExpanded.tsx:2` |
| `useMCP.ts` | `mcp:getStatus`/`getServers`/`getTools` and loading state (`:16-`). Consumed `MCPToolModal.tsx` |
| `useMCPKeyboardShortcuts.ts` | `Cmd/Ctrl+Shift+M`, `Cmd/Ctrl+T`, and the modal's Escape interception (`:38-42`). Consumed `AskModeExpanded.tsx:4` |
| `useBrowserState.ts` / `useDesktopState.ts` | **Not hooks.** Pure `browserReducer` (`:32`) / `desktopReducer` (`:34`) plus their initial states, driven by the consumer's `useReducer` (`AskModeExpanded.tsx:8-9`) |
| `useFocusManager.ts` | Input registry `Map<string, RefObject>` (`:10,21-27`) and focus routing by `(searchMode, windowMode)` (`:13-17`). Consumed `CommandPalette.tsx:80` |
| `useRotatingTips.ts` | Tip rotation keyed on `searchMode` + whether a query exists. Consumed `CommandPaletteFooter.tsx` |
| `useDragAndDrop.ts` / `useAutoResizeTextarea.ts` | Ask-mode input behaviours; both consumed by `ask-mode/UnifiedCommandBar.tsx` |
| `useToast.ts` | A pure re-export — `export const useToast = useToastContext` (`:24`) from `../contexts/ToastContext`. Import from here; do not add logic |
| `useActionPanel.ts`, `useDebounce.ts`, `useFocusTrap.ts` | Dead: zero importers repo-wide. Do not revive or extend |

## Local Contracts

- **`useKeyboard` is mounted exactly once.** `App.tsx:156` is its only call site (`App.tsx:3` its only import). A second instance registers a second `document` `keydown` listener and double-executes Enter and `1`–`9`. Never call it from a component.
- **Props are mirrored into refs, so the listener registers once.** All nine values/callbacks are copied every render (`useKeyboard.ts:34-52`); `handleKeyDown` reads only refs and depends solely on `setSelectedIndex` (`:232`), so the `document` listener attaches a single time (`:234-241`). Consequence: the `setSelectedIndex` you pass must be stable — the plain `useState` setter from `useSearch` is; a wrapper lambda re-registers the listener on every render. Never read closure state in the handler.
- **IME bail comes first.** `event.isComposing` returns at `:57` before any branch — mandatory for CJK input on Windows. No new key branch may be placed above it.
- **Ordering is load-bearing.** Tab mode-cycle (`:69`), `Cmd/Ctrl+Shift+Enter` ask-about (`:80`) and the `Cmd/Ctrl+N|P|K|/` block (`:87-112`) run deliberately **before** the blanket `if (hasModifier) return` guard at `:115`. Hoisting that guard kills all four shortcuts.
- **Textarea navigates only at list boundaries** (`:130-147`): `ArrowUp` only when `selectionStart === 0`, `ArrowDown` only at `value.length`; otherwise caret movement wins. `j`/`k` are skipped entirely inside any text input (`:125`), and plain text inputs only intercept Enter (`:180-187`).
- **Every index change is wrapped in `startTransition`** (`:90-204`) so typing stays responsive while the result list is large. New navigation branches follow the same wrapper.
- **Escape hides the window.** `:220-226` awaits `onClose`, which is `window.electronAPI.window.hide()` (`App.tsx:161-163`). ANY child handling Escape (modal, overlay, picker, dialog) must call `e.preventDefault()` and `e.stopPropagation()` first — live exemplar `useMCPKeyboardShortcuts.ts:38-42`. The in-file note at `:222-224` names `RegionSelector.tsx` and `useMCPKeyboardShortcuts.ts`; that first file no longer exists, so follow the second and ignore the stale reference.
- **OS modifier comes from `utils/shortcuts.ts` only.** `usesMetaKey()` (`:30`) picks `metaKey` vs `ctrlKey` (`useKeyboard.ts:65`); `getAriaKeyshortcuts()` (`:43`) renders the display string through `components/common/ShortcutKeys.tsx`. Never branch on `navigator.platform` inside a hook.
- **`on*` listeners return an unsubscribe; store and return it.** Pattern at `useChatSession.ts:124-386`: `const cleanup = window.electronAPI.chat.onStreamChunk(…)` then `return cleanup`. A `useEffect` that subscribes without returning the cleanup leaks one listener per StrictMode double-mount.
- **Async IPC needs two guards**: a rejection handler on the call (`App.tsx:214`, `useWindowMode.ts:31-37`) and a mounted/latest check before `setState` (`useFileSearch.ts:103-111,114-120`). Unhandled rejections here surface as a dead palette with no error UI.
- **Debounce lives in the hook, not the component.** `useFileSearch` owns its timer ref and clears it on unmount; `useDebounce.ts` is dead — do not "share" it back in.
- **`useBrowserState`/`useDesktopState` hold no state.** Keep their reducers pure and let the consumer own the `useReducer`; never add a `useState` to them.

## Work Guidance

- Shape: `export function useX(…)` named export only; an options bag once a hook takes more than three arguments (`useWindowMode.ts:19`, `useCommandExecution.ts:9`).
- Call `window.electronAPI` and map the wire shape into a renderer type at the hook boundary (see `useMCP`, `App.tsx:48-55`) so components never receive a payload straight off IPC.
- Log through `utils/debugLogger` with a `[useX]` prefix; never `console.*`.
- Import view types from their owners: `SearchResult` from `../components/ResultsList`, `SearchMode` from `../components/ModeTabs` (`useKeyboard.ts:3-4`). `../types/commandPalette.ts:5` is a re-export, not a second home.
- Put a hook here when behaviour is shared by two or more components or encapsulates one IPC channel; single-use behaviour stays in the consuming component.
- Root caps apply: 50 lines per function. `useKeyboard`'s handler is at the limit — extend it by extracting a branch into a named helper above `handleKeyDown`, not by nesting more conditions.

## Verification

- No automated test covers any hook: `src/renderer/hooks/` contains zero `*.test.ts`. Vitest is renderer-ready (`vitest.config.ts:8` jsdom, `:23` `@/` alias); `useSearch` is pure filter/rank and is the cheapest first test to write.
- `npm run lint` is the only automated gate that matters here: `react-hooks/rules-of-hooks` is **error**, `react-hooks/exhaustive-deps` is only **warn** (`eslint.config.js:40-41`), so a missing ref-mirror or a stale dependency will not fail the run — check the deps array by eye.
- Manual smoke after any change here (`npm run dev`, Alt+Space to show/hide):
  1. Up/Down wrap the list; Home/End jump ends; PageUp/PageDown step 5.
  2. `Ctrl+N`/`Ctrl+P` navigate with the caret untouched; `Ctrl+K` does nothing visible (its only consumer, `onOpenActionPanel`, is never passed); `Ctrl+/` toggles the shortcuts overlay.
  3. `j`/`k` navigate only when focus is outside an input; typing `j` in the search bar inserts the letter.
  4. In the Ask textarea, `ArrowUp` with the caret on the first line leaves the list alone; `ArrowDown` mid-text keeps the caret.
  5. `Shift+Tab` cycles file→ai→file; `Ctrl/Cmd+Shift+Enter` on a selected file switches to AI mode with that file attached.
  6. `1`–`9` execute the matching row; Enter executes the selected row; both must fire exactly once.
  7. Escape hides the window; with `MCPToolModal` open, Escape closes only the modal.
  8. Relaunch in `expanded` mode and type one character — the window must not flap modes (`useWindowMode` debounce).
- `npm run typecheck` is blocked in this checkout (`node_modules` absent; `tsconfig.json:16` `baseUrl` → TS5102 under TypeScript 6.0).

## Child DOX Index

Leaf doc — `src/renderer/hooks/` has no subdirectories and owns no child docs.
