# src/renderer/components/ui — DOX child contract (shadcn primitives)

Parent: `src/renderer/AGENTS.md` (`../../AGENTS.md`) and the root `AGENTS.md` rail (`../../../../AGENTS.md`). Token rules belong to the sibling contract `../../styles/AGENTS.md` and are not restated here beyond the parts a primitive must obey.

## Purpose

- House the 16 vendored shadcn/ui + Radix primitives the whole renderer composes against. These are **source code we own**, not a node_modules dependency — but they are kept shaped like upstream so `shadcn diff` stays cheap.
- Provide accessible, feature-agnostic building blocks. Everything app-specific belongs in `../common/`, `../ask-mode/` or the app shell.

## Ownership

| File | Lines | File | Lines |
|---|---|---|---|
| `dropdown-menu.tsx` | 267 | `tooltip.tsx` | 55 |
| `dialog.tsx` | 163 | `scroll-area.tsx` | 53 |
| `avatar.tsx` | 110 | `badge.tsx` | 49 |
| `card.tsx` | 100 | `switch.tsx` | 31 |
| `tabs.tsx` | 88 | `progress.tsx` | 29 |
| `popover.tsx` | 87 | `separator.tsx` | 26 |
| `button.tsx` | 65 | `input.tsx` | 19 |
| — | — | `textarea.tsx` | 18 |
| — | — | `skeleton.tsx` | 15 |

1175 lines total. No subdirectories; `../common/` (currently only `ShortcutKeys.tsx`) and `../ask-mode/` are siblings, not children of this folder. This doc owns no child docs.

## Local Contracts

- **What must NEVER appear here** (`design-systems/SHADCN-DESIGN-SYSTEM.md:185-193`): business logic, API calls or data fetching, feature-specific components, hardcoded colours, components that know about the app's data structure. Operative rule (`:191`): "If a component can't be reused outside a specific feature, it doesn't belong in `components/ui/`." No file here imports `window.electronAPI`, a hook, or a feature type.
- **Customisation goes in `../common/`**, not by editing a primitive (`SHADCN-DESIGN-SYSTEM.md:711-720`). `components/blocks/` is referenced by that doc (`:724,926,939,960,1005`) but **does not exist on disk** — do not cite it as current structure or create it unasked.
- **Radix comes from the `radix-ui` BARREL only**: `import { Avatar as AvatarPrimitive } from "radix-ui"` (`avatar.tsx:2`, same shape in `dialog/dropdown-menu/popover/progress/scroll-area/separator/switch/tabs/tooltip`), and `{ Slot }` for asChild (`button.tsx:3`, `badge.tsx:3`). Zero `@radix-ui/*` subpackage imports; adding one forks a dependency the `keyDependencies` barrel already covers.
- **CVA recipe**: `cva(base, { variants, defaultVariants })` for the class string, `VariantProps<typeof xVariants>` intersected into the props type, `cn()` for merging, and `data-slot` / `data-variant` / `data-size` on the rendered element. Only three files use it: `button.tsx:7-62` (variant block `:11-22`, size block `:23-31`, type `:49`, `data-slot="button" data-variant data-size` `:56-58`), `badge.tsx:7-49` (type `:36`, `data-slot`/`data-variant` `:41-42`), `tabs.tsx:25-38` (`tabsListVariants`, 2 variants, type `:45`). Cap at 5-6 variants per axis; button's 6 variants / 6 sizes is the ceiling.
- **Every primitive exports its component(s) and, where variants exist, the variants function** (`button.tsx:65`, `badge.tsx:49`, `tabs.tsx:88`). Keep that surface; consumers rely on it.
- **`data-slot` is present on every file** (`dropdown-menu.tsx` 17 occurrences, `dialog.tsx` 11, `card.tsx` 7, `popover.tsx` 7) and is the CSS/styling hook used upstream — never remove it, never repurpose it for test IDs.
- **Styling is Tailwind utilities first**, with token-backed arbitrary values only where no utility exists: `p-[var(--spacing-1)]` (`tabs.tsx:27`), `ring-[var(--ring-width-focus)]` (`badge.tsx:8`), `h-[var(--switch-height-default)]` / `w-[var(--switch-width-sm)]` (`switch.tsx:18`). Everything else uses the Tailwind scale (`h-10`, `size-8`) or a semantic utility (`bg-primary`, `text-muted-foreground`, `border-input`). Raw literals are forbidden — see `../../styles/AGENTS.md`.
- **Dark mode**: `dark:` utilities are legitimate here because these files track upstream shadcn. They currently appear in 9 of 16 files (`button.tsx:8,14,18,20`, `badge.tsx:8,16,18,20`, `avatar.tsx:18`, `dropdown-menu.tsx:74`, `input.tsx:11`, `textarea.tsx:10`, `switch.tsx:18,25`, `tabs.tsx:64-66`, `progress` inherits). Preserve them on every upstream diff; feature components must NOT copy the pattern — they override semantic variables instead.
- **Config facts** (`components.json`): `:3` style `radix-mira`, `:8` `baseColor: "mist"`, `:4` `rsc: false`, `:7` tailwind css target `src/renderer/styles/globals.css`, `:15` ui alias `@/components/ui`, `:19` `iconLibrary: "phosphor"`. Consumers import through the alias — `@/components/ui/button` (`../ask-mode/DesktopConfirmationDialog.tsx:2-3`) — never by relative path.
- **Accessibility is the product**: keep Radix's own attributes and composites (`TooltipProvider` export `tooltip.tsx:55`, `DialogPrimitive.*` composition `dialog.tsx`), keep `asChild`/`Slot` support, and keep the `aria-invalid` / `focus-visible` states in the CVA base strings.

## Work Guidance

- Add a primitive: `npx shadcn@latest add <component>`. Do not hand-write a lookalike — that breaks the diff path forever.
- Update a primitive: `npx shadcn@latest diff` (`SHADCN-DESIGN-SYSTEM.md:1402-1406` monthly workflow), review, apply selectively. **NEVER `--overwrite`** (`:793-794` explicitly bans `npx shadcn@latest add button --overwrite`). Monthly cadence is the doc's recommendation; if you skip a month, say so in the commit rather than silently diverging.
- If a primitive genuinely needs app behaviour, wrap it in `../common/` and leave this file untouched. The only such wrapper today is `../common/ShortcutKeys.tsx`.
- New variant axis: extend the existing `cva` object, add the matching `data-*` attribute, and re-export. Keep the base string for shared concerns (ring, focus, disabled) so variants stay orthogonal.
- Icons: Phosphor (`@phosphor-icons/react`) per `components.json:19`; primitives accept icon sizing through the `has-data-[icon=inline-end]` class pattern (`button.tsx:25-30`) rather than a size prop.

## Verification

- **No component tests exist**: zero `*.test.tsx` and zero `*.stories.tsx` under `src/`. `@ladle/react` is a devDependency (`package.json:112`) with no `.ladle/` directory and no script, and `vitest.config.ts:17` already excludes `*.stories.tsx` from coverage — so the harness is aspirational, not a gate. Do not claim visual coverage.
- `npm run typecheck` is **blocked in this checkout**: `node_modules` is absent, and `tsconfig.json:16` sets `baseUrl`, which TypeScript 6.0 rejects with TS5102. Run `npm install` first; a red typecheck is not proof your primitive broke.
- Real gates: `npm run lint`, `npm run typecheck` (once unblocked), the token drift greps in `../../styles/AGENTS.md`, and a manual eyeball in `npm run dev` toggling `.dark` on `<html>` — light AND dark, both, since `ui/` is the one layer where dark coverage genuinely exists.
- Spot-check after any edit: grep the changed file for `data-slot`, for `from "radix-ui"`, and for `@radix-ui/` (the last must return nothing).

## Child DOX Index

Leaf doc — `components/ui/` owns no child docs and has no subfolders. All 16 primitives are documented above as one flat contract; `components/ask-mode/` has its own doc (`../ask-mode/AGENTS.md`) and `components/common/` rules live in the renderer parent `../../AGENTS.md`.
