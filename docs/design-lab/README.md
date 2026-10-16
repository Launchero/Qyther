# Qyther design lab — alternate design systems

> **Status**: mockup — research record and visual references for design directions that are **not** implemented. Nothing here describes current behaviour; `src/renderer/styles/AGENTS.md` and `design-systems/SHADCN-DESIGN-SYSTEM.md` do.

## Direction 29 — Composed Stack (a synthesis, not a thirtieth research direction)

`29-composed-stack.html` is the stack a critical read of the other 38 produces. It is recorded here as a **proposal**, not as a peer candidate: it borrows one named mechanism from five existing directions rather than researching a sixth system, and its own header cites each donor at the point of use.

| Donated by | Mechanism taken |
|---|---|
| `28` | Seed → derivative → alias tiering; a 12-step ramp; the control state quartet; a foreground partner per role |
| `10` | Named elevation ladder (`--surface-base/-raised/-overlay/-sunken`, `--border` ≠ `--input`) and `--s-cond`/`--s-norm` wired to `[data-window-mode]` |
| `17` | The numeric contract — `tabular-nums`, right alignment, a fixed sign gutter, row rules instead of zebra, no rounding of the last significant digit |
| `18` | Colour as a published contract: every status hue carries a **shape** and a **word**, so colour is never the only channel. Extended past `18`'s four states to six, because a five-state tool vocabulary has nowhere to go in a four-state law |
| `27` | Named elevation roles |
| `05` | A `-shade` / `-foreground` partner per role |

**What it adds that no other file does: surface 0, the mode band.** The app's default surface is `MODE_CONFIGS.compact.height` = 72px, and `--container-header-height` is contractually equal to it, so the compact card *is* one header tall — yet every other mock authors `--header-h` between 40px and 80px and renders only the expanded card. **13 of the 28 directions therefore cannot physically render the app's default state.** `29` renders it at 72px, beside a 300px icon-only dock and a condensed/expanded density pair, all off the same aliases. Surface 6 is a specimen for the ladder, the law and the numeric column. That is why this file has seven surfaces per theme rather than five.

Three findings from the live pass are recorded here because they change how the other files should be judged:

1. **A themed background is not a themed surface.** `.desktop` set `background: var(--plate)` and no `color`, so content sitting directly on the plate inherited the lab page chrome's near-white text — **measured 1.02:1** on the density pair in the light column. This is latent in `00`–`28` because every row there lives inside a `.palette`, which does set `color`; the mode band is the first content on the plate itself.
2. **Lab chrome and themed surfaces need different text tokens.** `.lbl` sits on the page chrome while `.note` sits inside `.desktop`/`.page`; giving both the same token makes one of them fail (`.lbl` measured **2.39:1** before the split). `29` declares `--lab-ink` / `--lab-mute` / `--lab-line` in `:root` for the former — the same reason the control hardcodes `#8f929c` there.
3. **A 1px border is not 1px at 125% DPI.** Measured here at `devicePixelRatio: 1.25`, every 1px border in this file computes `border-bottom-width: 0.8px`. That is the sub-pixel hairline hazard already recorded for `03`, confirmed on real hardware, and it is why ring-versus-border is not cosmetic at that scale.

### Geometry & spacing retune of `29` (2026-10-16, researched)

`29` is the one file here whose dimensions were set against **primary sources** rather than a direction's aesthetic. Five values moved:

| Token | Was | Now | Why — primary source |
|---|---|---|---|
| `--palette-w` | 800px | **680px** | Every launcher with a shipped dimension is narrower. VS Code's Quick Open is `width: 600px` in shipped `quickInput.css`; PowerToys Run is `Width="640"` in shipped `MainWindow.xaml`; Raycast is community-reported near 750px. The convergence band is 600–760 and **nothing primary supports 800**. The only principled ceiling anyone publishes is readability (~70ch, Baymard; ≤80ch per WCAG 1.4.8) — no vendor publishes a launcher max. |
| `--target` | 32px | **40px** | 32px clears WCAG 2.2 SC 2.5.8 AA (24×24 plus the 24px-circle spacing rule) but sits **under Microsoft's own 7.5mm / 40px targeting guideline** — the wrong floor for a Windows app. 40px is also Carbon's `md` button. |
| `--space-*` | px literals | **rem, on Carbon v11's `$spacing-01…13`** (2/4/8/12/16/24/32/40/48/64/80/96/160) | rem is the majority output across Primer, Carbon, Atlassian, Tailwind and USWDS — only Radix documents px — and a px rhythm stops scaling under WCAG 1.4.4 (200% text resize). Hairlines and icon geometry stay px; a 1px rule is optical, not a rhythm value. |
| `td`/`th` inline padding | 12px | **16px** | Carbon's data-table spec uses `$spacing-05` = 16px on both column axes. |
| `.row` padding | `6px 12px` physical | **`padding-block` / `padding-inline`** | Logical properties flip correctly under RTL and vertical writing modes; no counter-argument found in current sources. |

**Deliberately *not* moved.** `--header-h` and `--palette-w` stay **px** even though the rest of the rhythm moved to rem: both must keep equalling `MODE_CONFIGS.compact.height` and `MODE_CONFIGS.*.width` in the main process, and a rem value would silently stop matching the window the moment a user changed their root font size — the same "fifth copy of `MODE_CONFIGS`" failure the token file exists to prevent. The row ladder stays 32/40/48 because it was **already** Carbon's `sm`/`md`/`lg` verbatim. `--header-h` stays 72px because no launcher publishes a search-field height at all; 72px is the app's contract, not a design choice.

**Density is two discrete modes, not a multiplier.** A global `calc(var(--x) * var(--density))` breaks icon grids, 1px borders and type rhythm, and no major system ships one — Fluent exposes exactly two levels (default/compact), and Material 3 defines density as changing "top and bottom padding" with text size explicitly untouched. Both rules are honoured: `[data-window-mode="compact"]` remaps `--pad`, `--gap`, `--gap-2`, `--row-h`, `--row-pad-block` and `--target`, and no type token.

**Container queries replace three hand-authored variants.** `container-type: inline-size` plus size queries are Baseline Widely available (Chrome 105 / Safari 16 / Firefox 110), so a frameless window the user can resize from 280px to full width responds to *its own* width — no viewport breakpoint is ever correct for it. Measured: the 300px dock and the 680px result list carry **byte-identical row markup** (4 children each), yet `.p` and `.k` compute `display:none` in the dock and `block` at full width, with the grid collapsing from 4 columns to 3. This is the first responsive mechanism in the folder.

**Verification after the retune.** Gate `all 38 pass` (`29`: 957 lines, 14 surfaces, 166 CSS variables); 88/88 markup classes covered, no dangling `var()`; compact strip measures **680 × 72.00**; `--target` 40px default / 32px compact; density paddings 0.75rem / 0.5rem; **40 painted colour pairs re-measured, none below 4.5:1**.

**Earlier verification, before the retune.** `node tmp/design-lab-check.mjs` → **all 38 pass** (`29` at 877 lines, 14 surface blocks, 152 CSS variables). A separate coverage pass confirmed all 88 markup classes have a CSS rule and no `var()` is undeclared — the defect class that shipped `18` with an unstyled Settings surface. Live read over CDP: the tier chain resolves in both themes, with **19 theme-scoped roles correctly absent on `<html>`** and present inside a themed column, which is the seed/derivative/alias contract measured rather than asserted. `[data-window-mode="compact"]` re-points `--row-h` 40px → 32px and `--pad` 12px → 8px; the compact strip measures **exactly 72.00px** with the header at 70.4px inside it. `tabular-nums` computes on `td.n`, `.met b` and `.dens .n`. All six status marks are geometrically distinct (filled circle 9px, ring 10px, square 9px, rotated square 14.1px, clip-path diamond 11px, ring 10px). **38 painted colour pairs measured from the rendered nodes, none below 4.5:1**, after fixing `.lbl` (2.39 → 7.65), `--st-caution` (3.69 → 5.12), `--st-armed` (4.32 → 4.96) and the unthemed plate foreground (1.02 → 16.46). The reduced-motion block uses the universal `!important` reset rather than a per-selector `animation: none`, matching the conclusion recorded in `src/renderer/styles/AGENTS.md`.

## Why this folder exists

Qyther ships one visual system: shadcn/ui + Radix primitives on Tailwind v4, OKLCH tokens in `src/renderer/styles/tokens/`, semantic roles in `src/renderer/styles/semantic/theme.css`, dark via the `.dark` class. The question this lab answers is what the app would look like under **other** design systems, and what adopting each would actually cost.

Ten directions, each rendered as a self-contained HTML mock of the real screens so the comparison is visual rather than adjectival.

## Screen brief — the content every mock must reproduce

Every mock renders the same five surfaces with the same words and the same data — the content never changes. What changes is the design language and its dimensions: each direction retunes its own card width, row/control heights, spacing and type scale (see the "Geometry & typography re-tune" note below). Copy strings marked *(verbatim)* are the app's real strings, taken from the components named in `docs/design-lab/README.md` → Source strings below; a mock that invents a nicer string is testing a fake.

The control (`00-current-baseline.html`) keeps the app's real dimensions: 800 CSS px card (`--container-command-palette`), 72 px header (`--container-header-height`), 40 px row floor (`--target-row`), 32 px control floor (`--target-min`), compact density. The other directions are no longer pinned to those numbers: each sets its own card width, header/row/control heights, spacing and type scale to the value its research calls authentic (or a conservative *unverified* one where the source is thin) — the geometry pin was lifted on 2026-10-16, see the "Geometry & typography re-tune" note. The window is frameless, always-on-top, centred in the work area; mocks draw the card on a desktop plate, never inside a browser chrome.

### 1. Palette — Files tab, empty query

Mode pill `Files`, input `#search-input`, placeholder *(verbatim)* `Search for files, tools, actions...`, leading magnifier, clear button, divider, key caps `Alt` `Space`. Body: section **Quick Actions** with exactly one tile `Find in Folder`; section **Recently Opened** with four rows (name + mono path). Footer: one rotating tip *(verbatim)* `Tip: Press Alt+Enter to ask about the selected file`, ghost button `Keyboard shortcuts`, theme toggle.

### 2. Palette — Files tab, query `design tokens`

Section header `Results` + count badge `6`. Six rows, each: type icon, title with the matched substring wrapped in `<mark>`, mono path, kind label, trailing shortcut badge (`↵`, or `→` for the folder). The row grid is `icon | title+path | kind | badge`. One row carries `bg-primary`/`primary-foreground` as the selection; one row shows the hover state with the `Ask` pill and its tooltip `Ask about this file (Alt+Enter)`. One row shows the `Opening…` spinner state.

| title | path | kind |
|---|---|---|
| `colors.css` | `Qyther/src/renderer/styles/tokens/colors.css` | CSS |
| `SHADCN-DESIGN-SYSTEM.md` | `Qyther/design-systems/SHADCN-DESIGN-SYSTEM.md` | Markdown |
| `theme.css` | `Qyther/src/renderer/styles/semantic/theme.css` | CSS |
| `spacing.css` | `Qyther/src/renderer/styles/tokens/spacing.css` | CSS |
| `screenshots` | `Qyther/docs/assets/screenshots` | Folder |
| `AGENTS.md` | `Qyther/src/renderer/styles/AGENTS.md` | Markdown |

All paths stay inside the repo — the capture harness refuses to write a frame whose rows fall outside it, and these mocks inherit that rule.

### 3. Ask mode — transcript mid-answer

User bubble: `What is our current cold-start cost breakdown?`. Assistant answer (`role="article"`, label `Assistant response`) with a streaming caret glyph `▊` on the last line, a thinking-steps timeline (loading copy *(verbatim)* `Understanding your question…`, then completed `Searching the web…`, `Reading source pages…`, and a `tool`-badged step `Running tool…`), and an agent pill labelled *(verbatim)* `Desktop`.

Below the answer: a generative-UI table card (`table` is one of the five payload types) titled `Cold-start cost by phase` with columns `Phase | ms | Owner` and rows `main boot | 214 | main.ts`, `graph precompile | 388 | getAskGraph`, `MCP connect | 1,204 | mcpService`, `es.exe init | 96 | initializeEs`; export buttons `CSV` `JSON` `MD` and a `Filter {column}…` / `All columns` control. Then a sources summary `3 sources` and the `Task Details` disclosure: `Tokens 4,812` (`Input 3,190 · Output 1,622`), `Cost (est.) $0.0131`, `Time 8.6 s`, `Speed 559 tok/s`, `Model: qwen3.6-plus`, and the caveat *(verbatim)* `Costs are estimates based on token usage. Actual charges may vary.`

Command bar: textarea placeholder *(verbatim)* `Ask anything about your code, files, or project...`, `Attach file or folder`, `Stop response`, `Send message`, a `3 MCP` chip.

Two of those four are `aria-label` text on icon-only buttons in the live app (`Attach file or folder`, `Send message`), so the control and every mock render them as labelled icons rather than as visible words — the brief lists them because they are the accessible names a screen reader announces, not because they are printed on screen.

### 4. Desktop-agent activity

The panel the app really renders (`Automating browser task...` heading *(verbatim)*, reused by the desktop path): a status `Badge`, `Current URL:` row → for desktop tasks this reads `Target window:`, `Reasoning:` line *(verbatim)* `Capturing screen to understand current state`, `Upcoming steps:` list *(verbatim)* `Analyze screen content`, `Plan next action`, `Execute interaction`, a `progressbar` labelled `Step 2 of 3`, and `Time: 4.2 s`. Beside it a tool trace using real `pi/toolbox.ts` names — `screenshot`, `get_screen_text`, `search_elements`, `invoke_element`, `type_text`, `close_window` — each with a status (`ok`, `ok`, `ok`, `error`, `pending`, `pending`) and the `close_window` row carrying the verifier marker `verifies`.

### 5. Settings and the not-ready card

`Settings` dialog: rows `Theme` / `Currently dark` / `Switch to light`; `Window size` / `Currently expanded (Alt+Shift+M toggles)` / `Compact`; `Keyboard shortcuts` / `Every shortcut the palette implements` / `View`; `MCP servers` / `3 connected` / `Manage`. The MCP modal: search field `Search servers...`, three cards — `filesystem` (`stdio`, `14 tools`, connected, enabled), `sequential-thinking` (`stdio`, `1 tool`, connected, enabled), `playwright` (`stdio`, `28 tools`, connected, disabled).

Plus the not-ready card (`role="alert"`): `API_KEY — required`, `MODEL — optional, defaults to qwen3.6-plus`, `BASE_URL — optional, defaults to the Qyther endpoint`, button `Back to Files`.

### Per-mock page requirements

- One `.html` file, self-contained: inline `<style>` only, no CDN, no webfonts, no JS (a checkbox-free static page; `:target`/`:hover` are fine, `<script>` is not).
- Light and dark rendered **side by side** in the same file, each half labelled, so contrast and colour roles are judged together.
- A header block naming the direction, its provenance and licence, its type plan, and its three adoption moves against our real token files.
- Every colour written as a CSS custom property at the top of the file, named after **our** roles (`--background`, `--card`, `--popover`, `--primary`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--success`, `--warning`, `--info`, `--destructive`), so a reader can diff the block against `semantic/theme.css` directly.
- Keyboard/hover/selection/focus states are shown, not described.

## Wave 2 (files `11`–`20`) — the banner requirement

Wave 1 answered "what would our UI look like under system X" and nothing beyond that. Wave 2 answers the harder question a designer asks: **what does the system believe about surfaces, hierarchy and material?** Every wave-2 mock therefore opens with a full-bleed **direction banner** before the surfaces, composed in the direction's own graphic language — not a title above a card.

Shared structure (the markup is fixed; the styling is the entire point):

```html
<header class="hero">
  <span class="hero-kicker">Qyther · design lab · NN</span>
  <h2 class="hero-title">Direction name</h2>
  <p class="hero-thesis">one sentence, in the direction's own voice</p>
  <div class="hero-field">
    <span class="spec">Aa</span><span class="spec">14</span><span class="spec">▮</span>
    <i class="f f1"></i><i class="f f2"></i><i class="f f3"></i><i class="f f4"></i><i class="f f5"></i>
  </div>
</header>
```

Requirements: the banner is at least 320 px tall, spans the column, uses the direction's real palette as blocks of colour, shows a display-size type specimen (the actual face stack, at the scale the direction is famous for), and carries **at least one signature device** native to the direction — a rotated band, a seal, a reticle, a halftone field, a misregistered duplicate, a gauge arc, a bevel, a rule grid, an ink wash. The banner must be composed, not stacked: use the direction's own grid, alignment and asymmetry. Everything below it stays byte-comparable in *content* to wave 1 — same five surfaces, same strings, same data — so the only things that change are authorship and the direction's own dimensions and type.

The five surfaces, the states, and the per-mock page requirements above apply unchanged.

## Wave 2 — the ten-plus directions

Wave 2 exists because wave 1 was criticised as too safe. It reaches past software design systems into **graphic systems and standards bodies**, and it is the pass where the citations get harder: published token repos, FAA advisory circulars, ISO line-weight standards, USGS cartographic specifications, and shipped npm packages read from their own files.

| # | Mock | Direction | Where the values came from | Licence | Cost |
|---|---|---|---|---|---|
| 11 | `11-swiss-railway-grid.html` | Railway grid as law | SBB **LYNE** `designTokens/{color,typo,spacing,border}.ts` | Tokens MIT; `SBB` house face UNVERIFIED | tokens + 2 grid columns |
| 12 | `12-braun-signal-panel.html` | Rams panel, one signal dot | DERIVED from ET66/RT20 hardware; DIN 1451 status sourced | Overpass OFL 1.1 | tokens |
| 13 | `13-neo-brutal-plate.html` | Hard outline, offset plate | `neubrutalism.com` recipe verbatim | Anton / Archivo Black OFL 1.1 | tokens + border-width rung |
| 14 | `14-constructivist-band.html` | Diagonal plate and overprint | Lissitzky / MoMA Picelj; palette DERIVED | Big Shoulders, Saira Stencil One, Overpass — OFL 1.1 | markup |
| 15 | `15-poster-scale-type.html` | Public Theater scale | Pentagram + Cooper Hewitt + typeroom (faces: Akzidenz-Grotesk, Knockout) | Paid originals → Anton/Big Shoulders OFL | markup + a geometry decision |
| 16 | `16-riso-overprint.html` | Two-ink print, misregistered | Martian Press ink chart (BYU's chart disagrees on the same inks) | Inter/Overpass + JetBrains Mono OFL | tokens + 2 classes |
| 17 | `17-bench-amber-terminal.html` | Bench amber | P3 phosphor spec (`#FFBF00` virtual amber) + `vim-bloomberg`, `berg` teardowns | JetBrains Mono, B612 Mono, Chivo OFL | tokens |
| 18 | `18-efis-colour-law.html` | EFIS colour law | FAA HFCC Ch.3 §7, AC 25.1322-1, AC 25-11B, ATC colour report | **B612 / B612 Mono OFL 1.1** | semantic-pair explosion |
| 19 | `19-hmi-grey-field.html` | High-performance HMI | Rockwell HMI style guide, ISA-101 overview, Adroit, Ignition docs, IEC 60073 | system stack | tokens (lowest) |
| 20 | `20-mission-console-dsky.html` | Mission console | AGC "green, specified as 530 nm" + Smithsonian artefact + NASA-STD-3001 | **DSEG OFL 1.1 since v0.40** | `@font-face` + packaging |
| 21 | `21-usgs-topo-quad.html` | Quadrangle | USGS *Topographic Map Symbols* + 2023 US Topo symbol guide | Oswald/Archivo OFL | medium, no blend risk |
| 22 | `22-cyanotype-plate.html` | Cyanotype plate | Prussian blue PB27 `#003153`, ISO 128 line classes, ISO 5457 margins, ISO 3098 lettering | Jost OFL | medium |
| 23 | `23-broadsheet-pink.html` | Broadsheet pink | `@financial-times/o-colors` 6.7.1 `_palette.scss`, quoted | Financier proprietary → Oswald/Playfair OFL | medium-low |
| 24 | `24-washi-ma-seal.html` | Washi, ma, seal | 日本色名 sRGB mappings via Wikipedia; Kenya Hara's doctrine | Zen Old Mincho, Shippori Mincho, Noto Serif JP OFL | medium-low |
| 25 | `25-retro-os-bevel.html` | Retro-OS bevel | `98.css` 0.1.21 `dist/98.css`, verbatim bevel recipes | Code MIT; **bundled font CC-BY-SA 3.0** | tokens + 4 shadow recipes |
| 26 | `26-frutiger-aero.html` | Frutiger Aero gloss | Wikipedia + MakeAero (MIT), which generates the gloss from an OKLCH base | Frutiger proprietary → OFL grotesques | tokens + a background layer |
| 27 | `27-named-elevation.html` | Named elevation | `@rose-pine/palette` 4.0.1 `dist/css/rose-pine.css`; daisyUI 5.7.50 `*-content` discipline | MIT | low-medium |
| 28 | `28-derived-token-algorithm.html` | Derived token algorithm | `antd` 5.29.3 seed→derivative→alias, `@primer/primitives` 11.10.0, `@radix-ui/colors` 3.0.0 | MIT | **architectural, cheapest of the bold set** |

### What each one is actually arguing

**11** Colour as law, with named greys (`midnight`, `iron`, `graphite`, `cloud`) instead of numbered ones, and selection as a red rule rather than a pill. Its own shipped stack is `SBB, Inter, …` — Inter is the railway's first fallback, which settles the font question honestly. Measured: `#eb0000` is 4.6:1 on white and 4.5:1 on black, i.e. exactly at the floor with no headroom.

**12** The single-signal discipline: one green dot as the only chromatic element, colour always paired with a shape (filled vs ringed) because colour-only status fails WCAG 1.4.1, and no display size at all.

**13** `border: 3px solid #000; box-shadow: 5px 5px 0 0 #000; border-radius: 0` — the published recipe, plus the honest correction that its white-on-acid variants measure 1.4:1 and that the whole trend is light-only, so the dark half has to be authored with light frames.

**14** Rotation, halftone and `mix-blend-mode: multiply` as composition. Two hard constraints stated in the file: rotation belongs on chrome and never on row text, and in a transparent window a blend layer composites against the desktop unless it has an opaque ancestor.

**15** The size *jump*, not the size: 13px rows against a 48px query echo and a 64px answer opener, with the caps credit line sitting underneath the big word. The expensive consequence is documented rather than hidden — display type in the header would change `--container-header-height`, which is contractually equal to main's `MODE_CONFIGS.compact.height`.

**16** Two plates, and every mid-tone earned by their overlap. The header keeps the honest note that two published ink charts disagree on the same colours, so the invariant is subtractive overprint, not a hex.

**17** Amber CRT with a day mode, because MIL-STD-1472H §5.18.2.2.1 specifies dark-on-light for day use and §5.2.2.7 asks 6:1 minimum. The transferable idea is not the colour, it is **alignment mechanics**: tabular figures, right-aligned numerals, a fixed sign gutter, row rules instead of zebra, and never rounding the last significant digit. Verified in this checkout: `src/renderer/` contains **zero** `font-variant-numeric`, `tabular` or `font-feature-settings` declarations today.

**18** Colour as a published contract: green = engaged, cyan = selected/armed, magenta = planned, amber = caution, red = exceeded, straight from FAA guidance — the strongest available answer to "how should an agent's status colours mean something?" Ships with B612, a face designed and tested for cockpit displays, OFL, with a slashed zero and separated `1/l/I/5/S/0/O`.

**19** The safety argument for being boring: a non-saturated grey ground, colour reserved for alarms, and "emphasis is provided by differences in line thickness, not colour" (Adroit/ISA-101), plus Rockwell's acknowledge state machine — unacknowledged blinks between alarm fill and grey border, acknowledged shows the border only — which maps directly onto a tool call awaiting acknowledgement. It is the only direction here that measurably improves the app for the 61.3% of low-vision users who report light and glare sensitivity.

**20** The DSKY's layout grammar as an agent UI: discrete value bays with the label above the numeral, a two-field VERB/NOUN entry as an honest model for tool-plus-argument, an annunciator lamp row instead of toasts, and the rule that **nominal values are always shown, including zeroes — an empty cell is a fault**. DSEG is OFL since v0.40, so seven-segment is legally shippable, at 20px and above only.

**21** A map's ink *is* a feature-class legend: USGS specifies contours in brown, hydrography in blue, roads in black and red. Qyther already renders a file-class legend as `--file-*`, so this is the one direction where the identity is load-bearing rather than cosmetic, and the marginalia (scale, declination, contour interval) is a native metaphor for mode, height and token cost. No blend modes, no portal risk, no multi-megabyte font — the cheapest impressive option in the lab.

**22** The difference between a plate and a tint is **two genuinely different line weights used with fixed meaning** (ISO 128 classes A/B/C/D, minimum 0.25mm, borders 0.7mm), a 20mm filing margin on the left edge (ISO 5457), uppercase single-stroke lettering, and a title block.

**23** The FT's own token package, quoted: the stock is `#fcd0b1`, not the `#F7E7E0` that circulates, and the reading field is `paper #fff1e5` — so pink is a masthead band, never the background. Financier is Klim and proprietary; the drop cap, hairline column rules and double-rule breaks are the substance. Honest limit: two columns of 13px text do not fit 800 × 74 DIP, so this direction is only truthful in expanded mode.

**24** Emptiness as material, with one saturated object on screen — the vermillion seal — and 間 expressed as a 40px unbroken band above the input. The failure mode is named rather than hidden: a 74px strip with a 40px void reads to users as a rendering bug, and `#FF3500` cannot clear 4.5:1 as text.

**25** `98.css` verbatim: the four-ring raised and sunken bevels, the 21-23px controls, the 16px scrollbar, the dotted 1px focus outline. Two findings worth more than the look — it ships **zero CSS custom properties**, so the token layer must be written by hand, and the code is MIT while the bundled bitmap font is **CC-BY-SA 3.0**, which is an attribution and share-alike obligation on that asset alone. The mock keeps 32px controls and says so: the period's hit targets are below WCAG 2.5.8 and below this app's own floor.

**26** Gloss as a four-layer stack (a lightness-only aqua body, a specular cap, rim light plus ground shadow, a blurred footer), generated from an OKLCH base by an MIT tool. The Electron caveat decides it: `backdrop-filter` samples the page, never the desktop, so a transparent window with nothing behind the DOM blurs nothing — the sky has to be painted in-page, which is a real repaint cost during the main-process height tween.

**27** Rosé Pine contributes what shadcn lacks and what Qyther's surface ramp was invented to reach: **named elevation roles** (`base`/`surface`/`overlay`/`highlight-low-med-high`) plus a light variant that is a real second edition (`dawn`). Paired with daisyUI's rule that every role declares its own `-content` foreground, so a theme swap cannot derive an illegible pairing.

**28** The least visual and most engineering-relevant entry: Ant Design v5's published tier law ("Seed > Derivative > Alias") with its real seeds (`colorPrimary #1677ff`, `borderRadius 6`, `controlHeight 32`, `sizeUnit 4`, three named easings), Radix Colors' reserved steps (9 border, 10 hover border, 11 muted text, 12 full text) and alpha twins, and Primer's component-state vocabulary with **14** functional theme files rather than 9. It also carries the warning: an algorithm that generates values can generate a contrast failure silently, so the generator must answer to the same strict gate as the hand-written tokens — and take the model, never the runtime CSS-in-JS, which collides with the CSP meta.

### Rejected in wave 2, and why

- **Luxury quiet-dark** (Didone display, bone paper, hairline gold): the research's own verdict is right — it is the direction the owner already rejected, in better clothes. Its material is whitespace and photography, and a 74px utility strip has neither. The shippable Didone substitutes (Instrument Serif, Playfair Display, Libre Bodoni, Italiana) are recorded anyway, because high-contrast Didone hairlines break below ~20px and that is a useful fact.
- **Motorsport pit wall**: sector-colour semantics are documented, but the published timing-tower hexes were not findable, the face is proprietary, and the recurring community question "what do the colours mean?" is itself the argument against three-state colour coding without a permanent legend. Its transferable idea — digits get their own optical size per hierarchy level — is folded into 17.
- **ECDIS / IHO S-52** as its own mock: it mandates **day, dusk and night** colour tables plus a *Colour Test Diagram* for initial verification. That is a better idea than a theme: a four-mode brightness ramp and a self-check screen in Settings. Recorded here rather than built, because the lab's two-column light/dark contract cannot show three modes honestly.
- **USWDS**: no CSS custom properties at all — 0 `:root` blocks in the shipped `uswds.css`; tokens are SCSS compiled to utilities, and `uswds` on npm is still v2 while v3 is the scoped `@uswds/uswds` 3.14.0. Wrong package name plus a build step for no variable surface.
- **Elastic (EUI)**: the strongest status model surveyed (a 26-step cool ramp, `primary/accent/danger/severity` plus a high-contrast-mode severity set, and text-safe chart hexes), blocked by licence — "Elastic License 2.0 **and** SSPL v1, at your election" is not an OSI-open position for a distributed app.
- **Cyberpunk / vaporwave as raw CSS**: glow lowers the local contrast of every adjacent glyph, and an animated RGB split on a streaming transcript is a motion loop that also breaks `prefers-reduced-motion`. The disciplined version exists and is taken instead — daisyUI's MIT `cyberpunk` and `synthwave` themes are hue-shifted ramps with radius 0, 2px borders and zero glow.
- **Arc/Dia, Superhuman, Material 3, Spectrum, Atlassian, Open Props**: excluded in wave 1 for the reasons recorded above (no published tokens, proprietary faces, wrong density, missing typeface licence, no static CSS, no semantics).

### Cross-cutting findings from wave 2

1. **`mix-blend-mode` creates a stacking context** and blends with what is behind it *in that context* — so over a transparent window the backdrop is the user's desktop, and every Radix portal (`Popover`, `Dialog`, `DropdownMenu`) lands in `document.body` and loses its intended backdrop. Any multiply/overprint direction needs `isolation: isolate` and an opaque plate per portal, and a stacking review against `tokens/z-index.css`.
2. **`backdrop-filter` cannot sample the desktop** in Electron (electron/electron#30412), so every glass direction is really an in-page background layer with a cost per frame during the height tween.
3. **Translucency and cream fields break the dark surface ramp.** Several wave-2 palettes are light-only by nature; each one that ships must author its dark half as a real second edition, which is the same rule `styles/AGENTS.md` already enforces for `--file-*` and the status pairs.
4. **The cheap, high-value ideas are not colours.** Tabular figures (17), named elevation roles (27), seed→derivative→alias tiering (28), explicit foreground per role (27), line-weight hierarchy instead of hue (19, 22), and colour-as-law with a text label beside every hue (18, 19). All five are token-layer changes with no markup.
5. **Two licence traps that only appear when you read the shipped artefact**: `98.css` is MIT code around a CC-BY-SA font, and Rosé Pine ships all three variants in one `:root`, so a `.dark` flip must re-point a prefix rather than swap values.

## Wave 1 (files `00`–`10`) — the ten directions

Each row's values were fetched from a primary source in the session that produced these mocks — a shipped package file, the vendor's own CSS, or a licensed spec — not recalled. Anything not so confirmed is marked **unverified** and is not used as load-bearing evidence.

| # | Mock file | Direction | Source of the values | Licence | Cost to adopt |
|---|---|---|---|---|---|
| 00 | `00-current-baseline.html` | The system that ships today | `src/renderer/styles/semantic/theme.css`, read directly | MIT | — (control) |
| 01 | `01-geist-cold-chrome.html` | Cold Chrome — Vercel Geist | `vercel.com` CSS chunks (`--ds-*`, `--geist-*`) | OFL 1.1 font, MIT code | tokens only |
| 02 | `02-stripe-canted-spectrum.html` | Canted Spectrum — Stripe | `stripe.com` / `stripe.dev` CSS | Söhne **not** shippable → Inter Display (OFL) | tokens + wrapper markup |
| 03 | `03-newos-ink-hairline.html` | Ink Hairline — Linear / Attio / Framer | live marketing CSS; palette is **derived**, not a package | Inter + JetBrains Mono (OFL) | ~90% tokens |
| 04 | `04-editorial-press-rules.html` | Press Rules — editorial/print | The Pudding, Bloomberg Graphics; Fraunces/Instrument Serif specs | OFL 1.1 | genuine restructure |
| 05 | `05-govuk-focus-first.html` | Focus First — GOV.UK | `govuk-frontend` SCSS (`_colours-palette--internal.scss`, `_colours-functional.scss`, `_typography-responsive.scss`) | MIT (OGL-UK) | tokens + focus/left-bar markup |
| 06 | `06-terminal-phosphor-ledger.html` | Phosphor Ledger — Solarized | ethanschoonover.com/solarized spec, verbatim | palette is a spec, not a package; JetBrains Mono OFL | tokens only |
| 07 | `07-aurora-vapour-stack.html` | Vapour Stack — mesh + glass | MDN `backdrop-filter`, Apple Materials | n/a (technique) | wrappers + `@supports` |
| 08 | `08-raycast-launcher-grammar.html` | Launcher Grammar — Raycast | `raycast/ray-so` theme JSONs + `lib/alpha.ts` | MIT registry; Catppuccin MIT | tokens + 2 small marks |
| 09 | `09-fluent-mica-native.html` | Native Material — Fluent 2 / Mica | MS Learn Mica + Acrylic pages, Windows Terminal **Campbell** scheme (verbatim) | Campbell MIT; Segoe UI Variable **not redistributable** | tokens + main-process flag |
| 10 | `10-carbon-layers.html` | Carbon Layers — IBM Carbon | `@carbon/styles@1.117.0` compiled sheet (628 `--cds-*` properties) | Apache-2.0; IBM Plex OFL 1.1 | tokens + a layer-scoping rule |

### Dossier notes worth keeping

**01 Geist.** Greyscale at chroma 0 with alpha twins as the working hairlines (`#0000000d/14/1a/57/b3/e8`, dark `#ffffff0f…eb`); accents authored per theme (`#0070f7` light, `#50a8ff` dark, `#0064e2` for body-size links because `#0070f7` on white is 4.51:1); 4px grid, radius 6; elevation is a ring — `0 0 0 1px #00000014` — composed with a soft shadow; focus is a double ring. The correction that matters: the npm package is **`geist`** (1.7.2), not `@vercel/geist-font`, which does not exist. `#28a948` as text on white is 3.06:1, so green is a fill, not a label.

**02 Stripe.** Navy ink (`#061b31`, `#0a2540`) and papers (`#f6f9fc`, `#e5edf5`), brand `#635bff`, gradient planes with literal values (`linear-gradient(203deg,#ffa319 9.93%,#fd6252 82.88%,#fd5b86 131.32%)`, `linear-gradient(0deg,#7500fb,#ff39db)`) feathered by a mask. Their own CSS declares `sohne-var` with an `SF Pro Display` fallback and a `SourceCodePro` stack — Söhne is a Klim face whose desktop licence does not cover app embedding, so the shippable substitution is Inter Display + Inter + IBM Plex Mono.

**03 Ink Hairline.** The whole look is a 1px line at 7-9% white plus a ~2% luminance step, with shadows essentially absent and one blur layer reserved for overlays. Two hard constraints found while specifying it: at device-pixel-ratio 1.25 a 1px alpha `border` is sub-pixel-erased, so hairlines must be drawn as `box-shadow` rings; and the fingerprint label size (11px tracked caps) is below this app's own 12px floor.

**04 Press Rules.** Rules instead of cards, radius 0, shadows 0, measure 68ch, body leading 1.6, labels set in mono at `+0.14em` and never bold. Fraunces is the honest choice because its `opsz` axis is what reads as letterpress; Instrument Serif is OFL but ships a single weight. This is the only option that requires restructuring `ResultsList`, the generative-UI tables and the answer bubble rather than restyling them.

**05 GOV.UK.** Black `#0b0c0c` with tints at 25/50/80/95%, blue `#1d70b8`/`#1a65a6`, red `#ca3535`, green `#0f7a52`, focus yellow `#ffdd00` with black text (14.55:1), border `tint-80` while **input border is full black** — the same decorative-vs-control split this repo encodes as `--border` ≠ `--input`, taken to its conclusion. Two widely-repeated claims about this system are wrong: it is a 5/10/15/20/25/30/40/50/60 scale, not an 8px grid; and GDS Transport is restricted to `*.gov.uk`, with Arial/Helvetica the prescribed fallback.

**06 Solarized.** base03 `#002b36`, base02 `#073642`, base01 `#586e75`, base2 `#eee8d5`, base3 `#fdf6e3`, with cyan 4.75:1, yellow 4.68:1 and green 4.69:1 measured on base03 — i.e. the accents land just above AA, which is why they belong on fills and status glyphs rather than on 12px prose. The direction is a promotion of the `--font-mono` stack the app already declares.

**07 Mesh + glass.** Technique is real (stacked `radial-gradient` layers, `backdrop-filter: blur() saturate()`, an inner light ring, an `@supports` opaque fallback). The damage is also real: a translucent row hands its contrast to whatever is behind the window, and this window is `transparent: true` and always-on-top, so the uncontrolled background is the user's actual desktop. `#ffffff` on `#0ea5b7` is 2.96:1 — chromatic fills cannot carry 13px white labels. Recommended for the overlay, tooltip and toast scrim only.

**08 Raycast.** A genuine token system: 12 slots (`background, backgroundSecondary, text, selection, loader, red, orange, yellow, green, blue, purple, magenta`) plus an appearance flag, with theme JSONs in an MIT registry — Catppuccin Mocha `#1E1E2E`/`#CDD6F4`/`#6C7086` and Latte `#EFF1F5`/`#4C4F69`/`#9CA0B0` quoted verbatim. Its opacity ramp is 5% steps (`05→0D, 10→1A, 20→33, 25→40, 50→80, 75→BF, 90→E6`) and it has **no named greys**: every hairline is text-or-background plus alpha. Density from its own HTML replica: 56px header, 40px rows at radius 10, 40px footer, 22×20 kbd chips, borderless card. What it does not have: any elevated-surface, code-block or metrics role — which is exactly what Ask mode needs.

**09 Fluent / Mica.** Mica is an **opaque** wallpaper-tinted base for long-lived windows with content on a low-opacity layer above it; Acrylic is the translucent material Microsoft's own guidance restricts to transient surfaces. Both fall back to a solid colour when the window is inactive, when transparency effects are off, on battery saver and on low-end hardware — and a palette is inactive nearly all of its life. Electron exposes it first-party as `win.setBackgroundMaterial('mica'|'acrylic'|'tabbed')`, Windows-only, needing 22H2+; CSS `backdrop-filter` cannot substitute because Chromium cannot sample behind the window (electron/electron#30412, #38532, #19765). Windows' stated type floor — 14px Semibold, 12px Regular, Semibold over Bold, no italic — is where this app already sits. The 4px grid steps, the exact `LayerFillColorDefault` alphas and the Reveal CSS recipe could **not** be fetched, so the mock labels them as approximations.

**10 Carbon.** `background → layer-01 → layer-02 → layer-03` with borders indexed to the current layer, so a raised surface is a named plane rather than a shadow opinion; g100 runs `#161616 → #262626 → #393939 → #525252`, `--cds-field-01` is a **fill** not an outline, `--cds-border-strong-01: #8d8d8d` is the control underline, `--cds-icon-interactive: #0f62fe`. Body is 14px natively and labels 12px — the two sizes this app runs on. Its most transferable idea is the **additive** type law, `Xn = Xn-1 + {INT[(n-2)/4] + 1} × 2`, because a 1.25 modular ratio skips the rungs a dense UI needs. The trap: layers only work if every subtree redeclares its tokens under a layer wrapper, so copying the flat variable list breaks the maths. **Correction (2026-10-16, re-derived against the v11 migration guide):** the density claim this section previously made — *"`padding-inline` condensed `.5rem` vs normal `1rem` is a real axis, mapping one-to-one onto `[data-window-mode="compact"]`"* — is **v10 language and no longer true of the version the mock quotes** (`@carbon/styles@1.117.0`). Carbon v11 has **no named density modes at all**: the official migration guide lists `$carbon--layout-01…04` as *Removed, replaced by* `$spacing-05/06/07/09`, and the v10 tall/normal/short/compact row model was superseded by one per-component size ladder — **xs 24 / sm 32 / md 40 / lg 48 / xl 64 / 2xl 80** (fetched from the data-table spec, updated Sep 30 2026). The ladder is the more useful half, and it is what `29` uses.

## Candidates considered and excluded

- **Arc / Dia (The Browser Company)** — no published tokens; the sites declare `Marlin Soft SQ`, which is a commercial TypeTogether licence. Any "Arc palette" in a mock would be invented.
- **Superhuman** — a first-party blog post gives `#141413`, `#714cb6` and a 0-100 neutral ramp, and nothing else; radius, spacing and shadow values are unpublished, and Super Sans VF is proprietary. Imitation, not adoption.
- **Linear** — values came from third-party extractions, the app's own display face is unshippable, and Berkeley Mono is proprietary. Its grammar survives inside option 03.
- **Radix Themes** — the lowest-delta option of the eight published systems surveyed: same primitives, 12-step scales with alpha twins, `--radius-1..5` on a live scaling dial, dark mode by `.dark` class exactly as here. It is excluded from the ten because that is a token upgrade to schedule, not a direction to choose.
- **Material 3** — the most complete surface model surveyed (~45 `--md-sys-color-*` pairs including `surface-container-lowest…highest`, each with an `on-*` partner, plus five elevation levels and state layers), and excluded on density and font: 16px+ card radii and 24px+ paddings fight a 72px compact header, and Roboto on Windows reads as Android. Apache-2.0, and `@material/material-color-utilities@0.4.0` will generate the whole ramp from one seed colour via HCT if a tonal model is ever wanted.
- **Adobe Spectrum** — the cleanest three-tier provenance model (palette → semantic → component, 827 custom properties), blocked by its typeface: `adobe clean` is proprietary. The "Verast" style mode named in some write-ups does not appear anywhere in the packages.
- **Atlassian** — no static CSS token file at all; `--ds-*` names are the output of a JS transform over ~467 entries, across several coexisting theme generations, so the mapping churns under you.
- **Open Props** — primitives without semantics (`--gray-0…12`, `--size-*`, `--radius-*`, `--shadow-1…5`), so adopting it changes ramp quality and easings and nothing else; its hex/HSL model also conflicts with this repo's OKLCH mandate.
- **GitHub Primer** — strong on accessibility (9 colour modes, `dark_dimmed` and high-contrast variants, ~218 paint variables, a three-plane canvas, `--shadow-floating-large` as a ring plus a diffuse shadow) but its `data-color-mode` attribute theming collides with the `.dark` class contract, so it needs a shim before it is a real option.

## Adoption mechanics

- **The `@theme` vs `@theme inline` split is the whole migration risk.** Plain `@theme` emits `.bg-x{background-color:var(--color-x)}`; `@theme inline` emits the resolved value. A theme token whose own value is `var(--something)` **must** be registered inline or the reference resolves where it was declared rather than where the utility is used — which is why `src/renderer/styles/semantic/theme.css` holds the repo's single `@theme inline` block and `styles/AGENTS.md` gates it. Every option above is expressible as a value change inside that existing shape; none of them requires a second registration layer.
- **Tailwind is at 4.3.3** (v4.3.0 shipped 2026-05-08). The namespaces that matter here are `--color-*`, `--radius-*`, `--spacing-*`, `--shadow-*`, `--text-*` with their paired `--text-*--line-height` / `--letter-spacing`, `--ease-*` and `--animate-*`. `tw-animate-css@1.4.0` owns the `animate-in`/`fade-in-0`/`slide-in-from-*` vocabulary and collides with same-named component classes — the `.shimmer` collision documented in `styles/AGENTS.md` is this mechanism.
- **Renderer support is not a constraint.** Electron 42 is Chromium 148: `oklch()`, `color-mix(in oklch)`, relative colour syntax and `light-dark()` are all available; CSS `@function` shipped in Chrome 137 and is not Baseline, so it stays out. Note that relative colour syntax performs **no gamut clamping**, so a derived colour can be unrenderable and paint identically to its parent — a ramp generator has to clamp explicitly.
- **Fonts are the hard gate.** A sandboxed renderer with no guaranteed CDN must vendor anything it wants to guarantee. OFL is the only licence class that permits embedding: Inter (48 KB Latin variable, measured), Geist (29 KB), IBM Plex, Fraunces, Instrument Serif, Newsreader, JetBrains Mono. Proprietary and excluded: Söhne, GT America, Untitled Sans, Marlin, Berkeley Mono, Super Sans, GDS Transport, Adobe Clean, Segoe UI Variable (referenced by family name only — legal, and it silently falls back to Segoe UI on Windows 10).
- **Accessibility floors a mock must clear.** WCAG 2.2 target size is 24×24 CSS px at AA, so the 40px row and 32px control are fine and a 28px row would not be; focus appearance (2.4.11) is **AAA**, not AA, and asks for a 2px perimeter at 3:1; 13-14px text is normal text at 4.5:1. Worth knowing before copying a class: shadcn's `outline-ring/50` compiles to `color-mix(in oklab, var(--color-ring) 50%, transparent)`, so a 50%-alpha ring carries roughly half the opaque token's contrast.
- **Motion cannot move the window.** The palette's height is tweened by the main process through `setBounds`, so `@starting-style` and `transition-behavior: allow-discrete` apply only to content appearing inside the frame. Any option that reintroduces a CSS height transition on the card is the measured -298/+444px regression, not a feature. The curves with a citable source are Tailwind's `cubic-bezier(0.3,0,0,1)` / `(0.2,0,0,1)` and Radix's `300ms ease-out`; the Linear and Vercel curves quoted around the internet are unverified, and this repo's own `--easing-smooth` `cubic-bezier(0.22,1,0.36,1)` is already in that family.

## Recommendation

Three options are one-file experiments — **01**, **06** and **10** change only colour, radius, shadow, spacing and type tokens, and **08** adds two small marks. The rest buy their look with wrapper elements, and **04** buys it with a restructure.

The evidence points at borrowing rather than swapping: take Carbon's **named layer ladder** (it formalises what `semantic/theme.css` already asserts about the surface ramp), Geist's and Raycast's **alpha hairline discipline** (no named greys, every divider derived from text), and Solarized's or Catppuccin's **published ramps** as the primitive layer — all of which land inside the existing `@theme inline` shape and none of which touches a component. Adopting a whole foreign system costs the surface ramp, the density contract, or the main-process geometry ownership, and those three are the things this app has already measured and hardened.

## How these mocks were verified

**Static gate.** `node tmp/design-lab-check.mjs` parses each file's `<style>` block and fails on: a live `<script>` or `<img>`, any `@import`/`url()`/`src`/`href` reaching the network, a `var(--x)` with no declaration and no fallback, fewer than ten surface blocks (five surfaces × two themes), an out-of-repo user path in a rendered frame, and — the check that earned its place — a `:root` token whose value references a theme-scoped custom property. All eleven files pass.

**Live reads over CDP.** Seven files were opened in a real Chromium and read back as *computed* styles, not inferred from the CSS: `00`, `02`, `03`, `05`, `06`, `07`, `10`.

| File | Measured in the running browser |
|---|---|
| 00 | Palette `oklch(1 0 0)` / `oklch(0.205 0.008 250)`, header 72 px, row 40 px, radius 8 px, selection `oklch(0.54 0.115 230.923)` / `oklch(0.715 0.143 230.923)`, 38 sprite icon uses, 0 scripts, 0 external requests |
| 02 | Canted plane paints as `linear-gradient(203deg, rgb(255,163,25) …)` on `.head::before` at `z-index: -1` inside `overflow: hidden`; card `rgb(13,42,74)`; painted selection-row text is **4.70:1 in both themes** |
| 03 | Dark card `rgb(17,19,24)`, hover `rgb(23,26,33)`, selection `rgb(91,91,214)`, hairlines present as `inset 0 0 0 1px` rings, paths in the mono stack at 12 px |
| 05 | Focus plate computes to `rgb(255,221,0)`, radius `0px`, font `Arial`, and all ten `.ib` interactive blocks carry a 4.8 px solid black left border |
| 06 | Body and answer prose are mono at 16/24 px, the caret inverts correctly (`background` = ink, `-webkit-text-fill-color` = field), `1ch` row padding resolves to 9.6 px, scanlines present at 0.04 / 0.08 opacity |
| 07 | Mesh field resolves on `.page::before` / `.desktop::before` with `animation: meshDrift 46s`, four blurred surfaces per theme (12 px popover tier, 24 px dialog tier), card radius 28 px |
| 10 | The layer ladder renders: `#ffffff → #f4f4f4 → #e0e0e0` light and `#161616 → #262626 → #393939` dark, radius `0px` everywhere, IBM Plex stack, focus a 2 px inset ring, and the raised generative-UI card carries **no** shadow |

**Not opened in a browser:** `01`, `04`, `08`, `09` — static gate only. Their rendering is unverified, and the direction-specific mechanisms in `09` (the two-ring Reveal focus, the `.layer` material stack) and `04` (the ruled structure) are exactly the kind of thing a computed-style read would catch.

**Two defects found, both real, both fixed.** Mock 07's mesh layer was dead on arrival: `--mesh` was declared on `:root` while the `--blob-*` it interpolates live in the `[data-theme]` blocks, and a custom property substitutes `var()` at computed-value time *on the element where it is declared* — so `--mesh` was invalid at `:root` and vanished in every descendant, leaving glass with nothing behind it. The fix moves the declaration into both theme blocks. Mock 06's inverted caret was specified in this folder's own brief as `background: currentColor; color: var(--background)`, which self-cancels because `currentColor` is the element's own computed colour; it ships as `-webkit-text-fill-color` instead. Both are now covered: the first by the new gate rule, the second by the live read above.

**One measurement error retracted.** An early probe reported mock 02's selected row at 3.31:1; it had read the row container's *inherited* colour rather than the painted text nodes, which the `.row.sel .t` rule actually sets. Re-measured against the painted text, the pair is 4.70:1. A contrast number is only worth as much as the node it was taken from.

**Screenshots were not available** — the in-app browser surface reported hidden and refused a positive viewport — so nothing here claims pixel-level visual confirmation; the evidence is computed styles plus the structural counts the gate produces. Open any file directly in a browser to eyeball it.

## Wave-2 verification

**Static gate.** `node tmp/design-lab-check.mjs` runs over every file in this folder and currently reports **all pass**. It caught two classes of silent defect during wave 2 — both are the same bug the gate exists for, an invalid custom property that drops a declaration without any visible error:

- Mock `11` referenced `var(--lyne-ink)` fifteen times while the primitive it meant is named `--lyne-void`, so its foreground, ring and band colours were all quietly resolving to nothing. Renamed.
- Several files failed transiently while their authors were mid-write (`18`, `21`, `25`), which is the expected signature of an incomplete file rather than a wrong design — the gate cannot tell those apart, so a FAIL is only evidence once the writer has reported.

**Live reads over CDP.** `16` was opened in a real Chromium and measured: all twelve `mix-blend-mode: multiply` layers sit inside an ancestor with `isolation: isolate` and an opaque background (`rgb(251, 248, 241)`), which is the specific fix the direction requires — an un-ancestored blend layer in a transparent window composites against the desktop. Its banner measures exactly `320px`.

**Not opened in a browser.** `11`, `12`, `13`, `14`, `15`, `17`, `19`, `20`, `21`, `22`, `23`, `24`, `25`, `28` — static gate only. `18` and the four `27` forks have been read live (see the two sections below); the `27` base file at its own radii has not, though it differs from `27a` only in the geometry block. Their contrast figures were computed by hand from the quoted hexes by the authoring agents, not measured in a browser, and `tmp/contrast-full.mjs --strict` parses the app's real `semantic/theme.css`, not a mock, so it is not evidence about these files. Anyone deciding between these directions should open them in a browser first; the mechanisms most likely to need a live look are `13`'s offset shadows against `overflow: hidden`, `19`'s alarm blink under reduced motion, `20`'s seven-segment ghost layer, and `25`'s `::-webkit-scrollbar` rules.

**Screenshots remain unavailable** in this session — the in-app browser surface reports hidden and refuses a positive viewport — so no file here carries a pixel-level claim.

### Radius variants of 18 and 27

Two directions were forked four ways each to test how far "minimal radius" can go before it stops reading as designed. `node tmp/design-lab-radius-variants.mjs` generates all eight from the two source files. It substitutes the geometry block, the header line and (for the chamfer forks) one appended rule, and **throws if any substitution misses**, so a drifted source cannot silently emit a half-patched variant.

#### `18` — EFIS Colour Law

`18` is the one direction in the lab whose geometry is already square — an EFD frame is a rectangle with corner ticks — so it is the natural control for the experiment. Seven hardcoded radii in the source (progress bar, switch track and knob, step mark, status dot, trace marks, chat bubble) are first routed onto `--r-pill / --r-mark / --r-knob / --r-bubble` so that each fork only has to change one block.

| File | `--r / md / sm / xs` | Pill | Status mark | Thesis |
|---|---|---|---|---|
| `18a-efis-hard-zero.html` | 0 / 0 / 0 / 0 | 0 | square | Nothing is round except the dial and the spinner, which are instruments. Square status marks add shape to colour+word, so the annunciator survives a hue the reader cannot resolve. |
| `18b-efis-2px-moulded.html` | 0 / 0 / 2 / 2 | 2px | square | Containers are cut sheet, controls get a moulded lip. 2px is the smallest radius that survives this app's measured 1.25 DPI scale without reading as anti-aliasing. |
| `18c-efis-control-round.html` | 0 / 0 / 4 / 0 | 0 | square | Radius becomes a signal: if a corner is round, the thing inside it does something. No pills anywhere. |
| `18d-efis-chamfered.html` | 0 / 0 / 0 / 0 | 0 | square | Zero radius expressed as a machined 12px `clip-path` chamfer on the plates. The honest cost is stated in the file: a clip on an element that hosts an overflowing child or a portal cuts it. |

#### `27` — Named Elevation

`27` is the opposite test case: a system whose separation is *already* structural (a named lightness step plus a 1px ring, never a blurred shadow), so radius is doing no load-bearing work and removing it should be nearly free. Its source has one non-token radius left — the chat bubble's asymmetric four-value corner — which the generator routes onto `--r-bubble`, and one that was mis-routed: the switch knob rode on `--r-pill`, so "no pills anywhere" also squared the knob. That is now a separate `--r-knob` token, which is the only way `27c` can mean what it claims.

| File | `--r / md / sm / xs / lg` | Pill / knob | Thesis |
|---|---|---|---|
| `27a-named-elevation-hard-zero.html` | 0 / 0 / 0 / 0 / 0 | 0 / 0 | Cut cards on a rung ladder. Because elevation here is a lightness step and a ring, a square plate wearing a ring is exactly what the model says a surface is; the pill was the last soft web affordance in the file. |
| `27b-named-elevation-2px-moulded.html` | 0 / 2 / 2 / 2 / 2 | 2px / 50% | Plates square, controls a single 2px lip, knob stays circular. 2px is the floor for the highlight rungs: `highlight-low` is a 1.03 luminance step, and at 1px the corner and the step become indistinguishable. |
| `27c-named-elevation-control-round.html` | 0 / 0 / 4 / 0 / 0 | 0 / 50% | The sharpest version: every surface and container is 0px and only a thing you can act on carries 4px — buttons, chips, badges, key caps, the mode tab. Since the ladder already marks selection with a 3px key-line, radius becomes a third independent channel: square means surface, round means control. |
| `27d-named-elevation-chamfered.html` | 0 / 0 / 0 / 0 / 0 | 0 / 0 | 0px throughout with a 10px `clip-path` chamfer on ten plate selectors, including this direction's own `.ladder`. |

**`clip-path` clips the element's own `box-shadow`.** That is the finding that makes `18d`/`27d` non-trivial: a chamfered plate loses its outer ring outright, and for `27` the outer ring *is* the elevation language, so every chamfered selector has to wear its ring `inset` or lose its edge. Neither fork chamfers the palette card — for a transparent frameless window the drop shadow is the only thing separating it from the desktop, and a clipped card is a card with no separation.

**Verification.** All eight pass `node tmp/design-lab-check.mjs`, and all four `27` forks plus `18a`/`18d` were read back in a live Chromium:

- `27d` — `clip-path: polygon(10px 0px, 100% 0px, 100% calc(100% - 10px), …)` on all ten plate selectors per column, each with `box-shadow: rgb(121, 117, 147) 0px 0px 0px 1px inset`; `.palette` computes `clip-path: none` and keeps its outer ring; every radius token resolves to `0px`.
- `27c` — `.sw2` track `0px`, `.sw2::after` knob `50%`, `.btn`/`kbd`/`.badge`/`.chip` `4px`, `.dlg` and `.ladder` `0px`.
- `27b` — track `2px`, knob `50%`, `.prog`/`.st i`/`.dot`/`.btn`/`kbd` all `2px`, `.dlg` `0px`.
- `27a` — `pill=0px knob=0px`, and `.sw2`, `.sw2::after`, `.prog`, `.st i`, `.dot`, `.ladder` all compute `0px`; the selected row keeps `rgb(40, 105, 131) 3px 0px 0px 0px inset` on `rgb(223, 218, 217)`, i.e. the key-line survives being the only curved-free selection channel.
- `18d` — the 12px chamfer computes on seven elements per column with every `border-radius` at `0px`.

**A defect found while forking:** `18` had shipped without the control's dialogs block — `.dlg`, `.set`, `.btn`, `.sw2`, `.dot`, `.alert` were all referenced by surface 5's markup and defined by nothing, so the Settings and MCP surfaces rendered as bare text. The static gate cannot see that class of bug (it checks token resolution and structure, not whether a selector exists), and no one had read surface 5 of that file. Restored in `18` and inherited correctly by all four variants; live-verified after the fix — `.dlg` now computes a 1px `#a2aeb8` border on the day card, `.btn` a 32px control, and the status dot resolves to the engaged green `#00683a`. The same class of miss in the generator itself (the dead `--r-knob`) was only caught by reading the variants' computed styles rather than trusting the fork's own prose.

## Geometry & typography re-tune (2026-10-16)

The original lab pinned every direction to the app's real dimensions (800 px card, 72 px header, 40 px row, 32 px control) so that only the skin varied. That pin was lifted: each of the 28 directions (`01`–`28`) now carries its own card width, header/row/control heights, spacing rungs and type scale, set to what online research says is authentic for that system — and, where a system publishes no dimensional spec, to a conservative value the file marks *unverified* in its header. The rule that keeps the five surfaces comparable: **only token values move.** No DOM, no content strings, no data rows, no light/dark layout, no banner markup, and no font *families* (the "no webfonts / inline only" rule holds). The gate still passes all 37 files, and the radius forks (`18a`–`18d`, `27a`–`27d`) were regenerated so they inherit their parents' new dimensions.

Re-derived from the files on 2026-10-16 (`--palette-w` / `--header-h` / `--row-h` / `--target`):

| # | width | header | row | control |
|---|---|---|---|---|
| `01`–`02` | 800 | 72 | 40 | 32 |
| `03` | 800 | 72 | 28 | 32 |
| `04`–`05` | 800 | 72 | 40 | 32 |
| `06` | 920 | 48 | 32 | 28 |
| `07` | 720 | 64 (ask 52) | 44 | 40 |
| `08` | 640 | 54 | 44 | 36 |
| `09` | 800 | 60 | 40 | 32 |
| `10` | 800 | 40 | 48 | 48 |
| `11` | 800 | 72 | 40 | 32 |
| `12` | 720 | 72 | 40 | 32 |
| `13` | 800 | 80 | 40 | 32 |
| `14`–`15` | 800 | 72 | 40 | 32 |
| `16` | 640 | 64 | 44 | 32 |
| `17` | 720 | 56 | 32 | 32 |
| `18` | 1024 | 56 | 32 | 32 |
| `19` | 960 | 48 | 32 | 32 |
| `20` | 640 | 56 | 28 | 28 |
| `21` | 880 | 72 | 44 | 32 |
| `22` | 840 | 72 | 44 | 32 |
| `23`–`24` | 800 | 72 | 44 | 32 |
| `25` | 640 | 56 | 32 | 32 |
| `26` | 760 | 64 | 44 | 36 |
| `27` | 840 | 76 | 48 | 36 |
| `28` | 840 | 72 | 40 | 32 |

A few rows read identical to the control on purpose: `02`, `04`, `09`, `11` and `28` were checked against their research and already sat on the authentic values, so they moved only a type or spacing rung, not a dimension. Rows that are a judgment call rather than a published spec (mostly `12`, `13`, `14`, `15`, `16`) are flagged *unverified* in their own headers. Spacing rungs and the display/hero type were retuned in most files too; those are recorded in each file's header block rather than tabulated here.

## Expressive UI overlay (2026-10-16)

A second pass layers the *principles* of **Google Material 3 Expressive** (expressive type ramp, spring motion, shape morphing, tonal colour), **spring physics** and **Apple Liquid Glass** material onto the mocks, so each reads as a living product rather than a flat skin. Everything stays static: CSS-only, no JS, no webfonts, and the DOM / content / strings are unchanged. Three read-only research subagents sourced the principles this session (M3X type/shape/motion token specs; Google Sans Flex's variable `opsz` axis; M3 motion easing/duration plus M3X spring tokens; Framer / react-spring defaults; Liquid Glass "functional-layer" glass; Rive state machines; WCAG 2.3.1 / 2.3.3). The consolidated vocabulary lives in the scratch contract `tmp/design-lab-expressive-contract.md` and is inlined into every file.

**Uniform `:root` block.** Every mock — all 28 and the 8 forks, which were regenerated so they inherit it — carries one theme-independent `:root { --ex-* }` block: the sourced M3 easing curves (`--ex-ease-out` `cubic-bezier(0.2,0,0,1)`, decel `0.05,0.7,0.1,1`, accel `0.3,0,0.8,0.15`), a spring-approximation `--ex-ease-spring` (*unverified* default), duration rungs 120 / 300 / 480 ms, a display weight 800 with −0.03 em tracking, and a `backdrop-filter` blur + edge-light pair for the glass tier. A `@media (prefers-reduced-motion: reduce)` opt-out zeroes it in every file.

**Applied per direction, not blanket.** The "smartly" is the withhold matrix — expressiveness is matched to the doctrine:

| Tier | Directions | Treatment |
|---|---|---|
| FULL | `07`, `26` | liquid-glass material + spring morph on cards/hero + expressive type |
| EXPRESSIVE | `01`, `02`, `04`, `08`, `09`, `13`, `15`, `27`, `28` | spring micro-motion on controls + bolder/tighter display type (no glass card-morph) |
| MEANINGFUL | `05`, `10`, `11`, `14`, `23` | one disciplined standard transition + bold headings, no overshoot |
| OPACITY | `03`, `06`, `17`, `20` | dense / terminal — state by fade only |
| CALM | `24` | one slow decelerating transition, no bounce |
| WITHHOLD | `12`, `16`, `18` (+forks), `19`, `21`, `22`, `25` | safety / print / period — no decorative motion; `18` and `19` keep only the single authored state-sweep |

The gate still passes all 37, and the `--ex-*` tokens are self-contained in the one `:root` block so the scope-trap check stays green. The spring curve and the lift/scale/blur amounts are conservative *defaults* (no primary px spec) and are marked *unverified* in the block; the M3 easing/duration values and the type-weight guidance are the documented ones. Live-verified this session: `26` computes `backdrop-filter: blur(10px)` plus a 0.48 s decel transform transition and h1 at weight 800; `18` (WITHHOLD-safety) carries the block but no surface transition, and its h1 was deliberately left un-bumped.

**Keyframe animation patterns (second wave, 2026-10-16).** On top of the hover/focus *transitions*, the motion-friendly tiers now also self-run `@keyframes` so each mock feels alive on load. The vocabulary — all `ex-`-prefixed so it never collides with a file's existing loops — is: `ex-enter` (a one-shot staggered entrance, `both` fill so content ends visible), `ex-pulse` (a ~3 s single-channel ambient state on the agent panel), `ex-sweep` (a slow scan across a progress/selection rule via a `::after` layer), and `ex-breathe` (a 6 s glass layer, FULL tier only). Coverage by tier: FULL (`07`,`26`) get all four; EXPRESSIVE (`01`,`02`,`04`,`08`,`09`,`13`,`15`,`27`,`28`) get enter + pulse + sweep; MEANINGFUL (`05`,`10`,`11`,`14`,`23`) get enter + sweep (no ambient loop, decel not spring); OPACITY (`03`,`06`,`17`,`20`) get a fade-in enter + sweep; CALM (`24`) gets a single slow enter only (no loops — *ma* = stillness). The WITHHOLD tiers (`12`,`16`,`18`+forks,`19`,`21`,`22`,`25`) get none — the safety/print/period doctrine holds, and `19` keeps only its authored `hmiAck*` acknowledge sweep. Every loop is single-channel and ≥ 2.8 s (no strobing → WCAG 2.3.1 safe), and each file's `prefers-reduced-motion` block explicitly zeroes the animated selectors *including the `::after` sweep* (the global `*` rule does not reach pseudo-elements). The `27` forks regenerate and inherit `27`'s keyframes; `18`'s forks correctly carry none. Live-verified this session: `26` computes `hero→ex-enter`, `palette→ex-enter,ex-breathe`, `ag→ex-pulse`, `prog::after→ex-sweep`, and `18` has zero `ex-` keyframes.

## Taste correction (tasteskill v2 pass, 2026-10-16)

A final pass ran the design-lab mocks through the anti-slop taste skill (`design-taste-frontend`),
which is a **marketing-page** tool. Because these are **UI-screen references of the app**, most of
its "tell" rules target things a UI mock is not meant to have, so the pass was scoped honestly:

- **Scoping.** Each mock's five app surfaces carry a `data-ui` attribute (the skill's
  interface-fragment exemption for a product's own borders/shadows). The lab's own banner (`.hero`)
  and meta (`.brief`) are *not* scoped, so they stay judged. This cleared the product's own
  `shadow`/`hairline`/`outlined-box`/`few-pictures`/`focal` inspector failures without touching the
  design.
- **Genuine craft defects, fixed** (all recorded in the inspector): the lab's caption/label
  **contrast** raised to ≥4.5:1 on both light and dark grounds; the `✓` status **emoji** replaced by
  the file's CSS status dot or the word "ok"; underbuilt final screens filled or put on a colour
  field; and any **default indigo/violet** accent swapped (none survived — `03`'s indigo is Linear's
  own brand colour, kept). Two real 1:1 colour bugs were found and fixed (`07`'s light-column text
  never set `color`; `08`'s "text@5" alpha idiom compositing against the dark board).
- **Kept by design (identity).** Each file carries one `/* taste: kept by design — … */` note: the
  direction's signature tells — monospace file paths & keycaps, card elevation, 1px UI dividers,
  glass/`backdrop-filter`, gradient material, SBB index numbering, dense 13–14 px launcher/terminal
  density, the seven-segment/console readouts. Stripping these would delete the research.
- **N/A for a UI mock.** The skill's photography-based rules (a hero picture, footage, a large
  focal image, a first-screen button) do not apply to a screens reference and were not forced.

The taste gate will still list the identity tells (the static `lint.mjs` flags `mono`/`gradient`
/etc. in the CSS block regardless of `data-ui`); that is expected, not a failure to hide — the
right measure for these interface fragments is the `inspect.mjs` output with the surfaces
`data-ui`-scoped, which is what the per-file "kept by design" notes refer to. The control
(`00-current-baseline.html`) was **not** touched.

## Known gaps in this record

- Linear, Superhuman and Arc values are third-party or absent; they are cited as influences on 03, not as token sources.
- Fluent 2's 4px grid steps, exact layer/solid alpha values and the Reveal CSS recipe were not retrievable this session; the mock labels them as approximations.
- Carbon's support (red/green/yellow) hexes were not read from the compiled sheet, so option 10's status colours are explicitly approximate.
- Material 3's `--md-sys-space-*` unit value and the state-layer percentages were not printed in the files fetched.
- No claim here about cold-start cost is measured; the numbers inside the mocks are illustrative data for a mock, not instrumentation.


## Source strings

The *(verbatim)* strings above are read from live components, not invented: `src/renderer/components/SearchBar.tsx`, `CommandPaletteHeader.tsx`, `ResultsList.tsx`, `ResultItem.tsx`, `SearchEmptyState.tsx`, `FooterTips.tsx`, `SettingsDialog.tsx`, `MCPToolModal.tsx`, `MCPServerCard.tsx`, `AskModeExpanded.tsx`, `ChatMessageBubble.tsx`, `ask-mode/ThinkingSteps.tsx`, `ask-mode/UnifiedCommandBar.tsx`, `ask-mode/BrowserProgressPanel.tsx`, `ask-mode/ConfidenceBadge.tsx`, `ask-mode/Transparency/TaskMetrics.tsx`, `ask-mode/GenerativeUI/DataTable.tsx`, and the tool names in `src/main/services/pi/toolbox.ts`.
