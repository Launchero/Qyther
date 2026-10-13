# src/renderer/styles — DOX child contract (token authority)

Parent: `src/renderer/AGENTS.md` (`../AGENTS.md`) and the root `AGENTS.md` rail (`../../../AGENTS.md`). This doc is the nearest contract for `styles/` and the token authority for the renderer.

## Purpose

- Sole source of every visual value in the renderer: colour, spacing, radius, shadow, motion, type scale, stacking. If a component needs a number or a colour that is not here, the fix lands here — never inline in JSX.
- Implements the three-layer token system and registers it with Tailwind v4 so shadcn utilities (`bg-background`, `text-muted-foreground`) resolve.
- Owns the two component-adjacent stylesheets that carry the ask-mode BEM class vocabulary.

## Ownership

- `globals.css` (560 lines) — the single CSS entry point. Import order `:1-12`, `@custom-variant dark` `:14`, global reduced-motion `:16-29`, `@layer base` `:31-47`, `@layer components` `:50` to end, generative-UI BEM `:306-307,387-395`, skeleton `:402`, progress `:471-517`, `.shimmer` `:454` with its own reduced-motion mirror `:542`.
- `ask-mode-perplexity.css` (2924 lines) — one `@layer components` block spanning `:14` to end; in-file rules at `:8-11` ("Use design tokens only — no arbitrary values"). Landmarks: `.command-bar` `:25`, `.welcome-state` `:428`, `.welcome-logo` `:449`, `.answer` `:613`, `.answer-content` `:1623`, `.error-banner` `:1443`, `.task-metrics-*` `:2134-2209`, `.typing-dot` `:2807`, reduced-motion `:2872`.
- `tokens/` — 7 files, each opening a Tailwind v4 `@theme {…}` block: `colors.css` (83, `@theme` `:23`), `spacing.css` (101, `:16`), `radius.css` (41, `:11`), `shadow.css` (26, `:9`), `motion.css` (121, `:11`), `typography.css` (47, `:21`), `z-index.css` (25, `:11`).
- `semantic/` — `theme.css` (149 lines): the repo's **only** `@theme inline` (`:18`) plus the light/dark declarations.
- `tokens/` and `semantic/` are documented here as sections, not as separate docs. This folder has no child docs.

## Local Contracts

- **Three layers, no skipping**: base `tokens/*.css` → semantic `semantic/theme.css` → component. Declared in-file at `tokens/colors.css:15-21` and `semantic/theme.css:11-15`; `tokens/colors.css:20` reads "NEVER SKIP THE SEMANTIC LAYER — this is what makes refactors safe." A component reads `--primary`/`bg-primary`, not `--color-mist-500`.
- **Registration split is load-bearing.** Plain `@theme` in `tokens/` exposes each token as a Tailwind utility. `semantic/theme.css:18-58` is `@theme inline` and maps `--color-*` → `var(--*)` (`--color-background: var(--background)` `:19` … file-type tokens `:53-57`). grep confirms exactly one `@theme inline` in `src/`; a second one means the layering is broken.
- **Dark mode**: light values in `@layer theme`'s `:root` (`semantic/theme.css:62-111`), dark overrides in the `.dark` block (`:114-149`), variant declared as `@custom-variant dark (&:is(.dark *))` (`globals.css:14`). **There is no `@variant dark` anywhere in this repo** — that spelling (an older-docs leftover) matches no real Tailwind v4 at-rule and survives only in the stale header comment at `semantic/theme.css:9`; correct it the moment you touch that header. `design-systems/SHADCN-DESIGN-SYSTEM.md:451` and the root rail already state the `@custom-variant` form. Dark is applied at runtime by `../context/ThemeProvider.tsx:33-37`, which removes then adds `light`/`dark` on `document.documentElement`; no `prefers-color-scheme` query exists in `styles/`.
- **Token inventory** (all verified; extend, do not re-invent):
  - `tokens/colors.css` — mist palette `:25-35`, grays `:38-47`, brand `:50-54`, functional red/green/yellow/blue `:57-60`, `--color-chart-1..5` `:63-67`, code-block colors `:70-74`, green-active/muted/subtle `:77-79`, gray-750/850 `:82-83`.
  - `tokens/spacing.css` — spacing scale `:18-33`, container dimensions `:36-41` (`--container-command-palette: 800px` `:36`), section padding `:44-47`, shortcut-key `:50-52`, icon sizes `:75-81`, send button `:84`, text escape hatches `--text-2xs/--text-xs-custom/--text-11px` `:87-89`, ask-mode geometry `:92-101`.
  - `tokens/radius.css` — base `--radius` `:13`, scale `:16-23`, `--radius-full/micro/arrow` `:26-28`, `--radius-shortcut-key` `:31`, `--radius-command-palette` `:32`, aliases `:35-37`, `--radius-input` `:40`, `--radius-chip` `:41`.
  - `tokens/shadow.css` — shadow scale `:11-15`, `--shadow-command-palette` `:18`, `--shadow-shortcut-key` `:19`, ring tokens `:22-26`.
  - `tokens/motion.css` — durations `:13-20`, easings `:23-26`, `--animate-*` `:29-32`, transition composites `:35-41`, stagger `:44-49`, entry animations `:52-57`.
  - `tokens/typography.css` — font families `:23-25`, six-size scale `:28-33`, weights `:36-39`, line heights `:42-46`. The 9/10/11px one-offs are **not** here; they are in `spacing.css:87-89`.
  - `tokens/z-index.css` — `--z-base`…`--z-toast` `:13-20`, command-palette aliases `:23-25`.
- **OKLCH is required for every token value** (`tokens/colors.css:12`, "All colors in OKLCH format for perceptual consistency"). grep confirms zero `oklch(` occurrences inside `src/renderer/components/` — colour literals must never migrate into JSX.
- **Import order is load-bearing** (`globals.css:1-12`): `tailwindcss` → `tw-animate-css` → `shadcn/tailwind.css` → the seven token files → `semantic/theme.css` → `ask-mode-perplexity.css`. Semantic must precede `ask-mode-perplexity.css`, which consumes `var(--border)` etc. A new `tokens/*.css` file needs an `@import` inserted **before** `:11`, or its utilities are never generated.
- **Consumption rule** (`design-systems/SHADCN-DESIGN-SYSTEM.md:289-297`): Tailwind utilities for typography, colour and radius; `var(--token)` inside arbitrary values for container dimensions, custom spacing and motion. Exemplars: `CommandPalette.tsx:179-192` (`w-[var(--container-command-palette)]`, `shadow-[var(--shadow-command-palette)]`, `rounded-[var(--radius-command-palette)]`, `duration-[var(--duration-150)]`) and `common/ShortcutKeys.tsx:19-25`.
- **Forbidden**: any raw literal — `w-[800px]`, `text-[13px]`, `rounded-[10px]`, `shadow-[0_1px_3px…]`, `text-[oklch(…)]` — and `text-[var(--text-xs)]` where the utility exists (`SHADCN-DESIGN-SYSTEM.md:303`: "the CSS var won't resolve at build time"). Live violators to fix on touch: `ResultsList.tsx:199,203`. New tokens go in `tokens/`, never inline in a component.
- **Primitive-backed arbitrary values are the sanctioned fallback**, below the semantic utility but above a literal: `text-[var(--color-blue-500)]` / `text-[var(--color-green-500)]` in `ask-mode/BrowserProgressPanel.tsx:64,66,79,81` and `ask-mode/ThinkingSteps.tsx:136` reference real tokens (`colors.css:58,60`) and `SHADCN-DESIGN-SYSTEM.md:296` blesses the same form for custom colours. Prefer a semantic utility when one exists; promote a primitive to `semantic/theme.css` when several components want it.
- **Reduced motion is centralised**: `globals.css:16-29` zeroes every `--animate-*` token. Adding an animation means adding the keyframe use in `tokens/motion.css`, the `:16-29` reset entry, and, if the class animates outside the token path, a rule in the per-file mirrors (`globals.css:542`, `ask-mode-perplexity.css:2872`).
- **Semantic pair naming**: `name` / `name-foreground` (`semantic/theme.css:19-50`) — primary, card, popover, secondary, muted, accent, destructive, sidebar (+ `sidebar-primary`, `sidebar-accent`, `sidebar-border`, `sidebar-ring`). Any new surface token needs both halves.

## Work Guidance

- Add a token: pick its file by kind, append inside the existing `@theme` block, comment the provenance in the house style (`/* Mockup line 78 */`, `spacing.css:36`), then consume it. Do not create a fourth layer, a `tokens/*.css` without an `@import`, or a component-scoped stylesheet.
- Add a dark-mode value: override the **semantic** variable in the `.dark` block (`semantic/theme.css:114-149`). Reserve `dark:` utilities for upstream shadcn primitives in `components/ui/`; do not scatter them through feature components.
- Add an ask-mode class: it goes in `ask-mode-perplexity.css` (chat/transcript/command-bar vocabulary) or `globals.css` (generative-UI primitives) — see the ask-mode contract at `../components/ask-mode/AGENTS.md`.
- Keep the two stylesheets as CSS only. No `@apply` outside `@layer` blocks, no inlined component stylesheets from JS, no CSS-in-JS.
- Asset tracks are separate and both live outside this folder: `src/renderer/index.html:9-11` links favicons out of the renderer root (`../../build/icons/icon-256.png`, `icon.ico`) while `npm run generate-icons` regenerates only `build/icons/`; `public/` is a hand-maintained set consumed at runtime by ask-mode (`ChatWelcomeState.tsx:72-73`). A logo used by a component belongs in `public/`; a window/app icon belongs in `build/icons/`.

## Verification

```bash
grep -rn "\-\[" src/renderer/components/            # token-drift census — currently 102 hits, all should be -[var(--…)] or a documented non-token value
grep -rEn "(w|h|p|m|gap|text|rounded|min-w|max-w|shadow)-\[[0-9]" src/renderer/components/   # raw literals — currently 4, none in ask-mode except ChatMessagesList.tsx:150 (max-w-[100%] → use max-w-full)
grep -rn "oklch(" src/renderer/components/          # must stay empty
grep -rn "@theme inline" src/                       # must return exactly theme.css:18
grep -rn "@custom-variant dark" src/renderer/styles # must return exactly globals.css:14
```

- `npm run lint` and a visual eyeball in `npm run dev` (toggle `.dark` on `<html>`, check both themes) are the runnable gates.
- `npm run typecheck` is **blocked in this checkout**: `node_modules` is absent (`npm install` first) and `tsconfig.json:16` still sets `baseUrl`, which TypeScript 6.0 rejects with TS5102. Do not treat a red typecheck as CSS regression evidence.
- There are no CSS/token tests. Nothing in `vitest.config.ts` covers stylesheets.

## Child DOX Index

Leaf doc. `styles/` owns no child docs: `tokens/` and `semantic/` are folded into the sections above. Revisit only if `ask-mode-perplexity.css` is split, in which case each split file needs its own boundary stated here first.
