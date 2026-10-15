# Visual & interaction system audit — 2026-10-15

> **Status**: history — a dated report of one completed change set, not current-behaviour reference.
> The rules it established live in `src/renderer/styles/AGENTS.md` and the code; re-derive from
> there. See `docs/AGENTS.md` rule 1.

Scope: the whole renderer (48 components, 7 token files, 2 component stylesheets), both themes, both window modes. Every measurement below was taken in this session; the commands are named so each number can be re-derived.

This is not a list of isolated tweaks. One system was built: motion, spacing, colour, type and layering each got a single source of truth, and the components were moved onto it.

## How the result is verified

Three gates run over the source, plus one over the running app:

```bash
node tmp/token-refs.mjs          # every var() resolves; no primitive as text; no rgb()/hsl(); no transition:all outside ui/
node tmp/motion-tokens-check.mjs # every --animate-* names a real keyframe, has a reduced-motion reset, and is consumed
node tmp/contrast-full.mjs --strict  # WCAG ratios computed from the OKLCH tokens, both themes
node tmp/live-style.mjs          # computed styles read off the LIVE palette window over CDP + screenshots
node tmp/live-reduced-motion.mjs # emulates prefers-reduced-motion over CDP and asserts nothing animates
```

`tmp/contrast.mjs` (the pre-existing scratch gate) reported **0 failures** while the border pair measured 1.26:1, because it marked that pair "informational" and checked only 11 semantic pairs. It also computed `foreground on card` as 17.32:1 where the correct figure is 19.77:1 (`0.145³ → Y = 0.00305`). A gate that cannot see a failure class, and mis-computes the pairs it can see, is worse than no gate — it manufactures confidence. `contrast-full.mjs` derives luminance from the OKLCH cube-root path and covers 28 pairs; it found **20 real failures** on the pre-audit tokens.

## 1. Animation system

**Issue.** One easing curve (`cubic-bezier(0.4,0,0.2,1)`) served every motion, so a hover, a panel and the Alt+Space summon all moved identically. 39 of 61 `transition:` declarations were `transition: all`. `--easing-linear` had zero consumers while `.toast-progress-fill` hand-wrote `linear`. `COLLAPSE_FLASH_MS = 500` in JS duplicated `--duration-500` in CSS, so under reduced motion the flag held for half a second of nothing. Four Radix surfaces animated through `tw-animate-css` (`duration-100 animate-in zoom-in-95`), entirely outside the token vocabulary.

**Why it matters.** Uniform timing destroys motion hierarchy — the user cannot tell a consequential change from a trivial one. `transition: all` animates properties nobody chose, which is how a layout shift ends up tweening.

**Fix.** An easing scale with a stated job per curve — `--easing-enter` (weightless entrances), `--easing-exit` (exits leave faster than they arrive), `--easing-spring` (subtle overshoot for the summon, toasts, toggles), `--easing-standard` (state inside a surface), `--easing-linear` (elapsed-time meters only). `--easing-smooth` was re-pointed at `cubic-bezier(0.22,1,0.36,1)` so the ~60 existing consumers upgraded without a rewrite. Every `transition: all` in both stylesheets is gone (`grep -c "transition: all" src/renderer/styles/*.css` → 0, 0). JS timings now read the tokens through `utils/motion.ts`, so CSS and JS cannot disagree. The four primitives keep their upstream classes (pristine-by-policy) and a `[data-slot]` rule in `globals.css` overrides `transition-all` with a named property list at runtime — verified live: a button computes `transition-property: color, background-color, border-color, box-shadow, opacity, transform, outline-color` at `0.15s`.

**The structural motion bug.** Entry shorthands used `animation-fill-mode: both`, which parks the keyframe's final `transform` on the element for its entire life. A permanent non-`none` transform creates a stacking context *and* a containing block, so `position: fixed` descendants re-anchor to the animated element instead of the viewport. `.view-enter` was doing exactly that to the palette body, and the toast region lived inside it — a `z-index: 70` toast was trapped in a `z-10` layer and could never paint above a dialog. It also vanished under `prefers-reduced-motion`, which is why it survived. All entry shorthands now use `backwards`, which holds the start state across a stagger delay and then releases the element. Live confirmation: `.view-enter` computes `transform: none`, and `.toast-region` is a direct child of `BODY`.

Reduced motion was already centralised and correct; it was extended to cover the new shorthands, and `motion-tokens-check.mjs` fails if a future token is added without one.

## 2. Layout and spacing

**Issue.** The scale was not a 4pt grid: `--spacing-1-5: 6px`, `--spacing-2-5: 10px`, `--spacing-3-5: 0.625rem` (also 10px — one value, two names), `--padding-section-xl: 18px`, `--switch-height-default: 16.6px`, `--text-11px`. Section padding on one stacked surface ran 12px / 8px / 10px. `ModeTabs` was 40px tall inside a header whose input is 44px.

**Why it matters.** Sub-4px drift is invisible as individual decisions and unmistakable as a whole screen: it reads as careless rather than dense.

**Fix.** `tokens/spacing.css` is now strictly multiples of 4. The half-step rungs are kept as **explicit grid aliases** (`--spacing-1-5: 8px`, `--spacing-2-5: 12px`, `--spacing-3-5: 16px`) rather than deleted, for two reasons: Tailwind resolves `p-1.5` straight to `var(--spacing-1-5)` (verified in the built CSS: `.py-3{padding-block:var(--spacing-3)}`), so re-snapping the rung moves all 267 utility usages at once with no class-string churn; and deleting a rung a stylesheet still references makes the declaration vanish silently. A rhythm vocabulary replaced the one-offs: `--gap-inline`, `--gap-block`, `--gap-section`, `--padding-block-row`, `--padding-block-section`, `--padding-card`, plus `--target-min: 32px` and `--target-row: 44px` as the pointer-target floors. Tabs and input now agree at 44px.

Compact density is expressed as **one token reassignment**, not a pile of per-class rules: `[data-window-mode="compact"] { --padding-block-section: var(--spacing-2) }` and every consumer inside that subtree tightens with it. Verified live: the compact bar computes `padding: 8px 16px`.

`SearchEmptyState` rendered its single quick action into `grid-cols-2`, leaving the right column empty — a missing tile, not a decision. The column count now follows the item count.

**Responsive behaviour — what "breakpoints" means here.** This is a single fixed-width (800px) frameless desktop window with three geometry modes owned entirely by the main process; there are no viewport breakpoints, no mobile layout and no `sm:`/`md:`/`lg:` utilities anywhere in the renderer, and adding them would be inventing a requirement the product does not have. The analogous work is width reflow and per-mode density, and both were done: the 800px card had no `max-w-full` and was **clipped** by `App.tsx`'s `overflow-hidden` whenever `clampSizeToWorkArea` handed main a narrower window, which is now fixed; and compact mode gets one token reassignment rather than a parallel set of class rules. Measured live: the compact bar computes `padding: 8px 16px` against the expanded `12px 16px`, and the published compact frame shows no clipped chrome.

## 3. Surfaces, layering and focus

**Issue.** `tokens/z-index.css` declared nine layers and had **one** consumer (`--z-toast`). Components used raw `z-50` (9 sites), `z-10`, `z-20`, and `ask-mode-perplexity.css` used `z-index: 100` to beat the palette interior. Dialog content had `ring-1` and **no shadow** while dropdowns used a bare `shadow-md`. Menu items had `focus:bg-accent` and no hover, so the mouse got no feedback at all. Escape tier 1 tested only `[role="dialog"]`, so a Radix menu (`role="menu"`) was invisible to it and Escape hid the whole OS window with the menu still open. `useFocusTrap` — the only code that restores the previously focused element — had zero importers.

**Fix.** The scale was rewritten to the seven surfaces that actually exist and is now consumed everywhere; `z-index: 100` became `--z-overlay`. Elevation is assigned per surface class through `[data-slot]` rules (unlayered, because a `@layer components` rule loses to Tailwind's utilities layer regardless of specificity — the documented collision that made the old `.shimmer` never apply): dialog `--shadow-dialog` + `--z-modal`, menu/popover `--shadow-popover` + `--z-popover` + `--animate-surface-enter`, tooltip `--z-tooltip`, scrim `--scrim`. Menu items gained a real hover treatment and `min-height: var(--target-min)`. Escape now recognises `[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]`; the hand-rolled click-outside effect in `SearchBar` that double-owned dismissal with Radix was deleted, along with the ref only it read. `useFocusManager` now captures and restores the previously focused element without adding a third `electron-window-shown` listener.

Dismiss stays instant — that is a recorded decision owned by `src/main`, and the user confirmed it. Surface and toast exits are animated in the renderer.

## 4. Colour and theming

**Issue (all measured, all fixed).** 20 failing pairs:

- `--background`, `--card` and `--popover` were **identical** in light (`oklch(1 0 0)`) and card/popover/sidebar identical in dark. The app had no elevation language; a "raised" panel was distinguished from the page by nothing.
- Dark `--destructive-foreground` on `--destructive`: **2.73:1** — failing AA normal *and* large.
- `--border`: 1.26:1 light, 1.25:1 dark. `--input` was the same value, so a control boundary and a decorative hairline were one token.
- Light `--chart-4` 1.81:1, `--chart-5` 2.24:1 (below the 3:1 non-text floor); `--file-typescript` 3.65:1 as text; `--info` 4.17:1 on muted and 4.35:1 as a fill.
- 56 lines painted raw primitives (`--color-green/yellow/red/blue-500`, `--color-green-active`) as **text**. A primitive has no `.dark` half, so it is guaranteed illegible in one theme: yellow measured **1.72:1**, green 2.40:1, red 3.79:1, blue 3.65:1 on a light card. `.error-retry-btn` compounded it by pairing a primitive red fill with the semantic foreground: 3.63:1 in both themes.
- `--color-purple-500` and `--color-orange-500` were referenced by two agent pills and **never defined** — CSS drops the declaration, so the pills rendered untinted with inherited text.
- `--ring-color` pointed at `--color-brand-500` (2.35:1) instead of the theme-aware `--ring`.
- `tokens/shadow.css` used `rgb()` against the repo's own "all colours OKLCH" rule.

**Fix.** A monotonic surface ramp in both themes (light: background 0.975 < sidebar 0.965 < muted 0.955 < card/popover 1.0, where "up" means whiter; dark: 0.145 < 0.175 < 0.205 < 0.245 < 0.275, where "up" means lighter) so every layer is distinguishable by lightness *and* carries the shadow that matches its elevation. `--border` and `--input` were split deliberately: a decorative divider is allowed to be quiet, the boundary of an interactive control is held to 3:1 (WCAG 1.4.11) — the gate encodes that split at 1.4 and 3.0 so nobody merges them back. Dark `--destructive-foreground` flipped to the same dark label the other dark foregrounds use. Charts, `--file-typescript` and `--info` were re-solved numerically to clear their floors. All 56 primitive-as-text lines and both agent pills moved to the semantic pairs, with `-soft` tints so a status background themes too. Shadows became tinted OKLCH (`oklch(0.2 0.02 250 / α)`) — pure black alpha reads as grey dirt on a cool-white plate. `--ring-color` now defers to `var(--ring)`.

The purple/orange gap could not be closed by adding two primitives, and `styles/AGENTS.md` already said why: no single lightness clears 4.5:1 in both themes. They became `--agent-browser` / `--agent-document` semantic tokens each with a `.dark` half that lifts only lightness — the same shape as `--file-*`.

## 5. Components and states

**Issue.** Loading was universally absent across the 16 primitives. Icon-only buttons rendered at 28px, 24px and 20px (`button.tsx` `size-7/6/5`), and call sites restated `h-7 w-7` over the variant. Assistant chat used a spinner where a skeleton existed. Dozens of raw `<button>`s bypassed `ui/Button` across `ModeTabs`, `CodeBlock`, `RelatedQuestions`, `RecentChatsInline`, `SearchWebToggle`, `UnifiedCommandBar`, `DataTable`, `ComparisonTable`, `FormPreview`. `DataTable`'s sortable header was a `click` handler on a `<th>` — unreachable by keyboard, and announced as `aria-sort` on a cell nothing could activate.

**Fix.** A 32px `--target-min` floor and a 44px `--target-row`, applied through the variants rather than per-call-site overrides (the restated `h-7 w-7` overrides were deleted). File search renders `.skeleton-row` and its scroll behaviour reads `prefersReducedMotion()`. The bypassing buttons were converted to `ui/Button` through the alias, so hover/active/focus-visible/disabled behave identically everywhere — which orphaned five CSS families that were deleted after grep confirmed zero consumers. The sort header is now a real `<button>` inside the `<th>` (`scope="col"` added), inheriting the cell's type and alignment, with a `:focus-visible` ring, so the interaction is keyboard-reachable while the sort semantics stay on the header cell. Live check: no rendered interactive element is below 32px (`smallTargets: []`).

## 6. Typography and readability

**Issue.** `--font-display` and `--font-body` were byte-identical `'JetBrains Mono'` strings, duplicated verbatim in `semantic/theme.css`, and loaded **only** from a Google Fonts CDN — nothing is bundled, so offline the whole app falls back to Arial. Mono as body text is the single largest gap versus the Linear/Raycast-tier reference: its fixed advance makes every column ragged and it reads as a terminal, not a product. Three sizes sat below the 12px accessibility floor (9px, 10px, 11px). `###` and `##` rendered identically (`text-sm font-semibold`) and `#` matched body size. `.answer-content` was declared twice, 12px then 14px, so the first rule was dead. There were no letter-spacing tokens at all while six rules hand-wrote `letter-spacing`.

**Fix.** UI text moved to a system-first sans stack (`system-ui` / Segoe UI Variable on Windows — hint-crisp, zero network, no FOUT); `--font-mono` keeps JetBrains Mono for code, file paths, key labels and command strings, so the terminal character survives exactly where it is readable. Each size rung now carries its own line-height and tracking (`--text-lg--line-height`, `--text-lg--letter-spacing`), so `text-lg` is a style rather than a number and components stop restating leading. The sub-12px rungs became 12px aliases — kept as aliases rather than deleted so no existing `var()` reference could drop. Heading rungs became a real descending scale (h1 `text-xl` → h4 `text-sm`), prose moved to `text-base` with a `--measure-readable` cap, and inline code became `0.9em` so it reads as a span of its sentence rather than a different kind of text. Live check: no rendered text is below 12px (`subTwelve: []`), and the body computes the system stack.

## 7. Premium product feel — the details that decide it

Found by looking at the running app rather than at the source — the shortcuts dialog rendered as a genuinely elevated surface (z-40, `--popover` 0.275, 16px radius, tinted shadow, 24px padding, real scrim) **with a raw OS scrollbar on top of it**: a wide unthemed Windows control that also overlapped the key column. Scrollbars are now thin, transparent-track and tinted from `--input`/`--muted-foreground`, so the one element that touches every scrollable surface matches the system instead of the platform. Mono was confirmed to be doing its new job in exactly the right place: the key caps render in `--font-mono` while every label around them is the system sans.

## What is deliberately not changed

- `components/ui/` stays pristine so `shadcn diff` remains cheap; every correction to a primitive is applied through `[data-slot]` rules or a variant at the call site.
- Palette dismissal stays instant (`src/main` owns it).
- The `.shimmer` → transform-sweep rewrite stays reverted; it was measured as *more* expensive (39.6ms vs 30.1ms of `RecalcStyleDuration` per 2s), and `paint` was never measured.
- Dead files (`ApiKeySetup`, `ActionPanel`, `ContextUsageIndicator`, `useFocusTrap`, `useDebounce`) were left alone — DOX says do not extend them, and deletion needs an explicit request. They are excluded from the gates, because a gate that fails on code that never renders teaches everyone to ignore it.
- No new dependency, no CSS-in-JS, no abstraction for a single consumer.

- **Selected-row metadata was failing AA in light mode only, and opacity was the cause.** `ResultItem` rendered the path and type label as `text-primary-foreground/70` on the selected row's `--primary` fill. Computed: on the dark fill that is 4.66:1 (passes), but the light fill is much darker (`oklch(0.54 …)` against near-white ink), so the same 70% alpha composites to **3.00:1** — below AA for text that carries the file path, the single most useful column in the list. `/80` is 3.46 and `/90` is 3.97; only full opacity clears it (4.53:1), so the selected state now uses full `--primary-foreground` and carries hierarchy through size and position instead of alpha. Rule worth keeping: an opacity step that is safe on one theme's fill is not safe on the other's, because the two fills are at opposite ends of the lightness scale.

- **Reduced motion was re-verified in the running app after the fill-mode change**, because `motion-tokens-check.mjs` only proves the tokens are reset — not that pixels follow. `node tmp/live-reduced-motion.mjs` emulates `prefers-reduced-motion` over CDP and reads computed values: with motion **on**, `.view-enter` runs `viewEnter` at `0.15s` and rests at `transform: none` (the `backwards` fix — under `both` it would hold a transform permanently); under **reduce** the same node computes `animation-name: none`, `animation-duration: 0s`, `transition-duration: 0s`, `opacity: 1`, and `document.getAnimations()` reports **0 running animations**. Content paints rather than hiding, which is the fail-safe direction.

**Numbers in this report are the ones measured during the audit; two have since moved.** A later concurrent pass tightened the launcher aesthetic: `--radius` base 12px → **8px** (scale 2/4/6/8/10/12/14/16, `--radius-input` 6, `--radius-chip` 4), and `--target-row` / `--container-input-height` 44px → **40px** with `--container-header-height` 72px pinned to equal main's `MODE_CONFIGS.compact.height`. The 32px `--target-min` floor, the 4pt grid, the surface ramp, the easing scale and every accessibility result below are unchanged, and 40px still clears both the 32px floor and WCAG 2.5.8. Where this report says "44px" or "16px radius" it is reporting what was measured at the time, not current values — read `tokens/spacing.css` and `tokens/radius.css` for those.

## Verification result

Final run of the full suite against this checkout:

| Check | Result |
|---|---|
| `node tmp/contrast-full.mjs --strict` | **0 of 28 pairs below floor** (was 20 failures) |
| `node tmp/token-refs.mjs` | OK — 224 distinct `var()` references resolve across 204 files; no primitive as text, no `rgb()`/`hsl()`, no `transition: all` outside `ui/` |
| `node tmp/motion-tokens-check.mjs` | OK — 21 keyframes, 21 `--animate-*` tokens, each with a reduced-motion reset and a consumer |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (44 warnings, all pre-existing, all in `src/main/**`) |
| `npm run test` | 297 passed / 297, 37 files. One intermediate run reported a single main-process failure that did not reproduce on re-run, and a concurrent session was editing `src/main/services/web/` throughout — recorded rather than hidden, but not attributable to this change set |
| `npx electron-vite build` | all three environments build (renderer CSS 171.69 kB) |
| `node tmp/live-style.mjs` | body computes the system sans; surface ramp resolves monotonic; button `transition-property` is the named list at `0.15s`; `.view-enter` computes `transform: none`; `.toast-region` is a child of `BODY`; `subTwelve: []`; `smallTargets: []` |

### Live harness drive (measured in this session)

`npm run harness:preflight` → `ok: true`, one pid owning both the window and the CDP endpoint. `npm run harness:selftest` → **16/16 PASS**, including real-`VK_ESCAPE` hide, real Alt+Space reveal (3 dim frames, 50 ms, within the 150 ms + slack budget), the height tween (42 frames, 11 distinct heights, 0 duplicate consecutive, monotonic, 167 ms), compact settling to 75 px, an OS click landing on `#search-input` whose measured rect height is **40 px** (the new `--container-input-height`), per-char typing producing 2 rows, and the "no DOM-level input in harness" audit.

The graded Escape ladder was then driven by hand with OS input: an `click_element` on `button[aria-label="Keyboard shortcuts"]` opened the dialog (`dialog: true, helpOpen: true`), and a real Escape closed it while the palette **stayed visible** (`dialog: false, hidden: false`) — **tier 1 confirmed**, which is exactly what the widened `ESCAPE_OWNERS` predicate exists to do.

### Defect found by that drive, not yet fixed

After the dialog closed, `state` reported `activeElementId: "BODY"`. Consequence, reproduced in the same session: the next `type` reported sending `notes` while `inputValue` stayed `""` — the keystrokes went nowhere — so the following Escape fired **tier 3 and hid the window** where the user expected tier 2 (clear the query). So closing a palette dialog strands focus on `<body>` and silently breaks keyboard continuity, which is the palette's primary interaction model.

`useFocusManager`'s new `lastFocusedRef` restore does **not** cover this: it fires on the `(searchMode, windowMode)` landing effect, and a dialog close changes neither. The fix is to route focus back through the existing single router when a dialog closes (Radix's own trigger-restore is not landing — the trigger's focus was never the stored value, because `onOpenAutoFocus` moves focus into a `tabIndex={-1}` `DIV` first), and it must be verified by re-driving the ladder: open → Escape → type → the query must appear → Escape must clear it, not hide the window. Left unfixed here deliberately rather than patched without that re-verification.

### What is NOT verified live

- **Reduced motion under the real Windows setting.** The CSS/token half is proven (`prefers-reduced-motion` emulated over CDP: `animation-name: none`, `0s`, `document.getAnimations() === 0`). The OS half — Windows Settings → Accessibility → Visual effects → "Show animations in Windows" off, then re-summon — is hand-driving a user's system setting and was not done.
- **Drag-resize after this change set.** Covered by `useResizeDrag.test.tsx` and by an earlier harness drag measurement, not re-driven here.
- **The tray Quit teardown** and the process-tree observation the `## Process & Resource Lifecycle` rail demands — untouched by this change set.

## Open items

- **`docs/assets/screenshots/` is regenerated** (`scripts/capture-ui.mjs`, six PNGs, light and dark, compact / expanded / shortcuts-dialog / results). Two defects surfaced while making that run reproducible, both now fixed in the script rather than in the app: it assumed the palette always boots into the Files tab (it throws `search input not mounted` from Ask mode, and `searchMode` is React state with no IPC to force it — there is now an `ensureFilesMode` step that expands the mode pill and clicks the tab by role, not by text, because the collapsed pill's label is the *current* mode and a text match ping-pongs), and its dialog dismissal looked for `button[aria-label="Close"]` while the upstream close button takes its accessible name from an `sr-only` span, so the shortcuts dialog never closed and every later frame was occluded.
- The upstream dialog close affordance is `size="icon-sm"` (24px), under the 32px floor this system now holds icon controls to. `ui/` is pristine-by-policy, so the floor is enforced by a `[data-slot="dialog-content"] > [data-slot="button"]` rule in `globals.css`.

- JetBrains Mono is still CDN-only; self-hosting it is a separate decision (`--font-mono` already falls back to Cascadia/Consolas).
- `DataTable`/`ComparisonTable` exceed the 50-line rule, and `DataTable`'s column filter is a raw `<select>` where a `ui/select` treatment would match the rest of the system. Its sort header is now keyboard-reachable (a `<button>` inside `<th>`), which was the accessibility half of that defect.
- `ui/tooltip.tsx` renders its arrow without a `data-slot`; it is reached through `[data-slot="tooltip-content"] > svg` in `globals.css`, which is a parent selector rather than the hook the rest of the system uses.
- The landing surface's vertical balance is carried by `flex-1` + `my-auto` on `SearchEmptyState`, so a short history centres instead of pooling a void. The *window's* height stays owned by main's mode machine: an expanded window with two items is taller than its content needs, and fixing that in the renderer would make it a second owner of those pixels, which the height invariant forbids.
- `tokens/colors.css` keeps four deprecated aliases (`--color-green-active/-muted/-subtle`, `--color-code-ts-dot`) that forward to semantic tokens so an un-migrated reference cannot drop. Delete them once no consumer remains.

