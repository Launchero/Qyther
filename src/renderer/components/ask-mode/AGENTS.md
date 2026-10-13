# src/renderer/components/ask-mode — DOX child contract (Ask-mode UI)

Parent: `src/renderer/AGENTS.md` (`../../AGENTS.md`) and the root `AGENTS.md` rail (`../../../../AGENTS.md`). Token/layer rules belong to `../../styles/AGENTS.md`; primitive internals belong to `../ui/AGENTS.md`. This doc owns Ask-mode presentation only.

## Purpose

Render the Ask-mode conversation: transcript, welcome state, streaming input bar, browser-agent progress panels, structured generative-UI results and task-metrics transparency. Purely presentational — props in, callbacks out.

## Ownership

| File | Lines | Role |
|---|---|---|
| `ThinkingSteps.tsx` | 253 | reasoning-step timeline, per-node loading copy |
| `UnifiedCommandBar.tsx` | 251 | streaming input bar, attachments, model/MCP chips |
| `BrowserProgressPanel.tsx` | 240 | browser-agent step/progress/controls |
| `ChatMessagesList.tsx` | 164 | transcript scroller and per-turn state wiring |
| `ChatWelcomeState.tsx` | 157 | empty-state logo, subtitle, suggestion cards |
| `Transparency/TaskMetrics.tsx` | 123 | `<details>` token/cost/duration breakdown |
| `DesktopConfirmationDialog.tsx` | 73 | HITL confirm/deny card (token-value styling exemplar) |
| `CodeBlock.tsx` | 70 | fenced code with copy + language header |
| `ChatErrorBanner.tsx` | 66 | assertive error surface |
| `ChatMessageActions.tsx` | 65 | copy / regenerate / code actions |
| `RecentChatsInline.tsx` | 57 | inline recent-session list |
| `ConfidenceBadge.tsx` | 49 | answer-confidence badge |
| `fileTypeIcons.tsx` | 46 | extension → Phosphor icon map |
| `AgentIndicator.tsx` | 41 | active-agent pill (the only `React.memo`) |
| `SourcesPanel.tsx` | 40 | citation source list |
| `RelatedQuestions.tsx` | 33 | follow-up suggestion row |
| `CitationBracket.tsx` | 28 | inline `[n]` citation |
| `SearchWebToggle.tsx` | 24 | search/web mode toggle |
| `useInputIcon.ts` | 7 | send-icon selection helper |

`GenerativeUI/` (7 files: `index.tsx` 101, `ChartView.tsx` 221, `DataTable.tsx` 183, `ComparisonTable.tsx` 183, `FormPreview.tsx` 128, `GenerativeUISkeleton.tsx` 97, `GenerativeUIProgress.tsx` 52) and `Transparency/` (1 file) are folded into this doc as the sections below — deliberately, because each carries exactly one rule worth documenting. Consumers live one level up: `../ChatMessageBubble.tsx` renders `GenerativeUI` (`:303`) and `TaskMetricsDisplay` (`:360`); `../AskModeExpanded.tsx` composes the transcript, panels and command bar.

## Local Contracts

- **Props convention**: `export interface XProps` when the parent imports the type (`UnifiedCommandBar.tsx:14`); a plain local `interface XProps` otherwise (`BrowserProgressPanel.tsx:16`, `GenerativeUI/DataTable.tsx:15`, `Transparency/TaskMetrics.tsx:5`). Shared *data* shapes are always exported (`BrowserProgress` `BrowserProgressPanel.tsx:8`, `InlineChatSession` `RecentChatsInline.tsx:5`, `ProgressStage` `GenerativeUI/GenerativeUIProgress.tsx:4`).
- **Declaration form**: `export function X({ a, b = def }: XProps)` — never `React.FC` (`TaskMetrics.tsx:10`, `ChartView.tsx:179` show the destructured-with-defaults shape). Sole `React.FC` occurrence is a map-value type, not a component (`GenerativeUISkeleton.tsx:79`); do not add others.
- **Ordering**: module-level const maps and helper functions sit ABOVE the component. Exemplar `ThinkingSteps.tsx`: `LOADING_MESSAGES` `:11-52`, `getLoadingMessage` `:54`, `getStepBadge` `:58`, `aggregateSteps` ending `:132`, `StepIcon` `:134-193`, component `:195`.
- **Memoisation is the exception**: only `AgentIndicator.tsx:19` uses `React.memo`. `useMemo`/`useCallback` only where computation is real — `ComparisonTable.tsx:37-105`, `ChartView.tsx:180-183`, `UnifiedCommandBar.tsx:83`. Everything else re-renders freely.
- **No IPC here**: zero `window.electronAPI` references in this folder. Chat/session state arrives as props from `../AskModeExpanded.tsx` (the only owner of `../../hooks/useChatSession.ts`, `AskModeExpanded.tsx:2,62`) and `../ChatMessageBubble.tsx`; this folder emits callbacks only. Two narrow exemptions are the current shape, not a pattern to widen: UI-local hooks (`UnifiedCommandBar.tsx:9-10` call `useDragAndDrop` / `useAutoResizeTextarea`) and a type-only import from the hook (`ThinkingSteps.tsx:3` imports `ThinkingStep`).
- **ui/ primitives are composed, never patched**: `@/components/ui/button` + `badge` (`DesktopConfirmationDialog.tsx:2-3`), `progress` + `badge` + `button` (`BrowserProgressPanel.tsx:3-5`). Keep it through the alias.
- **DUAL STYLING MODEL — the fork every editor must know.** `ui/` is Tailwind utilities. This folder additionally carries semantic **BEM classes defined in CSS**: `.generative-ui-container` (`../../styles/globals.css:306`), `.generative-ui-title` `:307`, `.generative-ui-fallback` `:387-389`, `.generative-list*` `:392-395`, `.generative-ui-skeleton` `:402`, `.generative-ui-progress` `:471-517`, `.skeleton-table` `:433`, `.shimmer` `:454`; and in `../../styles/ask-mode-perplexity.css`: `.command-bar` `:25`, `.welcome-state` `:428`, `.welcome-logo` `:449`, `.answer` `:613`, `.answer-content` `:1623`, `.error-banner` `:1443`, `.task-metrics-*` `:2134-2209`, `.typing-dot` `:2807`. A new ask-mode component adds its class in **one of those two files** (560 and 2924 lines respectively), never inline, never a new stylesheet. Tailwind utilities and BEM classes are combined in the same `className` — see `DesktopConfirmationDialog.tsx:21-38`.
- **Token consumption**: prefer the semantic utility (`text-primary`, `bg-secondary/50`), fall back to a primitive-backed arbitrary value (`text-[var(--color-green-500)]` — `BrowserProgressPanel.tsx:64,66,79,81`, `ThinkingSteps.tsx:136`; those tokens are real, defined at `../../styles/tokens/colors.css:58,60`), and never a raw literal. Exemplar files: `DesktopConfirmationDialog.tsx:21-65` and `ChatMessagesList.tsx:130-150` mix BEM hooks with `mx-[var(--spacing-6)]`, `rounded-[var(--radius-md)]`, `p-[var(--spacing-4)]`. `ask-mode` is currently clean of pixel literals — the one numeric arbitrary value in the whole folder is `max-w-[100%]` (`ChatMessagesList.tsx:150`), which should be `max-w-full`.
- **Orphan BEM hooks (real debt; re-verify before trusting)**: `chat-error-banner|content|icon|body|title|message|actions`, `desktop-confirmation-dialog`, `desktop-confirmation-container`, `confirmation-header|body|actions`, `action-preview`, `action-type`, `legend-label` appear in JSX and in **no** stylesheet — 15 classes, `ChatErrorBanner.tsx:41-56`, `DesktopConfirmationDialog.tsx:21-65`, `TaskMetrics.tsx:82,86`. Either define them in `ask-mode-perplexity.css` or drop them; do not assume they are styled.
- **Accessibility is mandatory and expressive — this is the pattern set**: `role="status"` + `aria-live="polite"` + `aria-atomic` + descriptive `aria-label` (`BrowserProgressPanel.tsx:93-96`); `role="log"` + `aria-live="polite"` + `aria-relevant="additions"` (`ChatMessagesList.tsx:111-114`); `role="alert"` + `aria-live="assertive"` (`ChatErrorBanner.tsx:41`, `ChatMessagesList.tsx:132,150`); `role="progressbar"` with `aria-valuenow/min/max` (`BrowserProgressPanel.tsx:229`); `sr-only` labels for visible-only data (`:172,180`); paired `title` **and** `aria-label` on every icon button (`:116-117,129-130`); `aria-hidden="true"` on decorative glyphs (`:101`). Preserve Radix attributes and `data-slot` on anything rendered from `ui/`.
- **GENERATIVE-UI REGISTRY (the one rule worth its weight).** The payload union is `'table' | 'form' | 'comparison' | 'list' | 'chart'` at `GenerativeUI/index.tsx:9`; the dispatcher is the `switch (resultType)` at `:22` → `DataTable` `:25`, `FormPreview` `:35`, `ComparisonTable` `:48`, inline list markup `:59-72`, `ChartView` `:79`, JSON fallback `:92`. **Adding a generative type requires four coupled edits plus one behaviour**:
  1. extend the union (`index.tsx:9`);
  2. add the `switch` branch and keep the fallback reachable for unknown types;
  3. plumb the payload from `../../hooks/useChatSession.ts` — `UIPayload.type` (`:15-20`, field at `:16`), the final-chunk mapping `:188-192` (`uiPayloads`/`hasStructuredData`/`dataType`/`structuredData`), and the pending-type path `:309`;
  4. through `../ChatMessageBubble.tsx` — payload build `:243-246`, `<GenerativeUI resultType={payload.type}>` `:303-321` (`resultType` at `:305`);
  5. keep streaming behaviour: `GenerativeUISkeleton` + `GenerativeUIProgress` render before the payload lands (`:290-298`) driven by `uiPayloadPending`/`uiGenerationProgress`/`uiProgressMessage`.
  A new type missing step 3 or 4 renders the `:92` fallback or nothing at all. On the main side the matching Zod schema + `jsonMode` + validity filter trio is required — see `src/main/services/langgraph/AGENTS.md`.
- **GenerativeUI data shapes** are exported from their own file and re-exported at `GenerativeUI/index.tsx:100-101`: `TableData`/`TableColumn` (`DataTable.tsx:4,10`), `FormField` (`FormPreview.tsx:5`), `ComparisonItem`/`ComparisonCriteria` (`ComparisonTable.tsx:5,11`), `ChartDataPoint` (`ChartView.tsx:7`). Import from `./GenerativeUI`, not from the leaf files.
- **Chart colour law**: only `--color-chart-1..5` and semantic/border tokens. `CHART_COLORS` (`ChartView.tsx:22-27`) and the inline SVG attribute values `stroke="var(--border)"`, `fill="var(--color-chart-1)"`, `background: var(--card)` (`:63-75`). Recharts layout numbers (`height={280}`, `fontSize: 11`) are component props, not class strings — the drift grep cannot see them, so do not let them become a colour or spacing escape hatch.
- **Transparency section**: `TaskMetrics.tsx` is a native `<details className="task-metrics-display">`/`<summary>` disclosure (`:26-34,121`) whose styles exist (`ask-mode-perplexity.css:2134-2209`). All math and pricing come from `../../utils/costCalculator.ts` (`TaskMetrics.tsx:2` — `formatCost`, `formatTokenCount`, `calculateTokensPerSecond`, `getDisplayModelName`, `MODEL_PRICING`); do not duplicate pricing or formatting here.

## Work Guidance

- New ask-mode component checklist: `interface XProps` → `export function` → helpers above the component → BEM class added in one of the two stylesheets → token-only values → live-region/`role` markup if it changes state or streams → render it from the app shell, never call IPC from here.
- Keep functions ≤50 lines (root rail); `ThinkingSteps.tsx` and `BrowserProgressPanel.tsx` are the house style for splitting a large panel into module-level helpers.
- Icons come from `@phosphor-icons/react` with a numeric `size` prop (4 sites in this folder, e.g. `DesktopConfirmationDialog.tsx:23,26`). `--icon-size-*` tokens exist (`../../styles/tokens/spacing.css:75-81`) but are wired to nothing; only `AgentIndicator.tsx:35` consumes one, via `w-[var(--icon-size-xs)] h-[var(--icon-size-xs)]`. Prefer a size number that matches a token; register the token before inventing a new size.
- Logo assets are two-track: components load `/logo-nothing-terminal*.svg` from `public/` (`ChatWelcomeState.tsx:72-73`) while `src/renderer/index.html:9-11` links favicons at `../../build/icons/*` regenerated by `npm run generate-icons`. Anything a component renders goes in `public/`.
- Dark mode in this folder is essentially unbuilt — see Verification. To react to the theme, request a semantic-variable override in `../../styles/semantic/theme.css`; do not scatter `dark:` utilities the way `ui/` does.

## Verification

- **No component tests exist**: zero `*.test.tsx` and zero `*.stories.tsx` in `src/`. `@ladle/react` is a devDependency (`package.json:112`) with no `.ladle/` directory and no npm script, and `vitest.config.ts:17` already excludes `*.stories.tsx` — the harness is aspirational. Do not report coverage you do not have.
- `npm run typecheck` is **blocked in this checkout**: `node_modules` absent (`npm install` first) and `tsconfig.json:16` sets `baseUrl`, which TypeScript 6.0 rejects with TS5102.
- Runnable gates: `npm run lint`, then the greps — `grep -rn "\-\[" src/renderer/components/ask-mode/` (every hit must be `-[var(--…)]`), `grep -rn "oklch(" src/renderer/components/ask-mode/` (empty), `grep -rn "React.FC" src/renderer/components/` (only `GenerativeUISkeleton.tsx:79`).
- Manual eyeball in `npm run dev` is the only real visual check, and **"test in light AND dark" is a requirement that is currently under-met, not coverage that exists**: in this subtree only `ChatWelcomeState.tsx:72-73` (logo swap via `dark:hidden`/`dark:block`) and one raw CSS rule (`ask-mode-perplexity.css:1662` `.dark .answer-content code`) respond to the theme. Toggle `.dark` on `<html>` and expect most ask-mode surfaces to look identical.
- Restated manual procedure (source: `VISUAL-TESTING-REPORT.md:143-172`): `npm run dev` → navigate the browser MCP to `http://localhost:5173` → lock the viewport → snapshot → press Alt+Space → screenshot → measure with `document.querySelector('[role="dialog"]').getBoundingClientRect()`. **That report is quarantined by the root rail**: `:15` `shadow-[0_1px_3px_0_rgb(…)]`, `:22` `rounded-[10px]`, `:53` `px-[16px]`, `:60` `mx-[4px]`, `:70-74` `min-w-[32px]`/`text-[13px]` all celebrate forbidden literals. Copy the procedure, never the code snippets.

## Child DOX Index

Leaf doc — no child docs. `GenerativeUI/` (7 files) and `Transparency/` (1 file) are folded into Local Contracts above; `../common/`, `../ui/` and `../../styles/` are separate boundaries with their own docs. Split either folder into its own doc only if it grows past ~10 files or acquires a second rule.
