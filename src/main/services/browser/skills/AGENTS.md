# src/main/services/browser/skills — SKILL.md runtime prompt material

Parent rail: `../AGENTS.md` (browser subgraph); repo-wide rules in the root `AGENTS.md`. Leaf doc — owns no children (see index).

## Purpose

This folder holds on-disk `SKILL.md` prompt material that the browser agent reads **from disk at runtime** and inlines into the ReAct system prompt. Skills are not compiled, not imported as modules, and never executed as code. They steer agent behaviour (which `browser_*` tools, in what order, with what guardrails). The loader `../browser-skill-loader.ts` is the only consumer.

- Runtime material, not code: every byte here becomes prompt text; a wrong sentence changes agent behaviour with no type error and no failing test.

## Ownership

The loader logic is `../browser-skill-loader.ts`; this folder owns the six skill directories and their files (SKILL.md line counts in `()`):

- `authentication/SKILL.md` (50) + `references/auth-patterns.md`
- `data-extraction/SKILL.md` (49) + `scripts/extraction-templates.js`
- `form-filling/SKILL.md` (49) + `references/form-patterns.md`
- `visual-interaction/SKILL.md` (52) + `references/visual-patterns.md`
- `web-navigation/SKILL.md` (44) + `references/navigation-patterns.md`
- `web-scraping/SKILL.md` (47) + `scripts/scraping-helpers.js`

All six SKILL.md are 44-52 lines. Four skills carry a `references/` file (authentication, form-filling, visual-interaction, web-navigation); two carry a `scripts/` file (data-extraction, web-scraping). Leaf: this doc governs all six folders; there are no nested docs.

## Local Contracts

- **Two-pass read.** Pass 1 `getCatalog()` reads ONLY each `<dir>/SKILL.md` front matter to build the catalog (`../browser-skill-loader.ts:21-53`). Pass 2 `loadSkill(name)` reads the body and **inlines every `references/` and `scripts/` file** into the prompt (`../browser-skill-loader.ts:81-97` collection, `:194-204` inlining). A file in `references/` or `scripts/` becomes prompt text verbatim.
- **Wiring.** `skillRouter` node (`../browser-subgraph.ts:142-155`) → `loadSkills` node (`:159-178`) → prompt injection into the system message (`../stateful-browser-agent.ts:175-191`).
- **Routing is the description string.** `matchSkills()` tokenises the front-matter `description`, keeps words longer than 3 chars, and selects a skill when **≥1** token appears in the task (`../browser-skill-loader.ts:112-138`; filter `:120`, threshold `:122`). The wording of `description` is a functional contract, not prose — choose tokens a user would actually type.
- **Required front matter:** `name:` and `description:`, parsed by regex (`../browser-skill-loader.ts:150-157`). A file missing either logs a warn and is dropped. `name` MUST equal the directory name — the loader resolves `<dir>/SKILL.md` from `name` (`:68`), so a mismatch loads nothing. All six currently match.
- **The file MUST open with a `---` fenced front-matter block on line 1** (`../browser-skill-loader.ts:143,171`); any leading prose before the first `---` means the skill never parses and is invisible to the catalog.
- **Optional `category:`** defaults to `"interaction"` when absent (`../browser-skill-loader.ts:162`); the value must be one of the six enums in `../types.ts:42` (navigation | interaction | extraction | scraping | authentication | visual). It is metadata only — routing reads `description` alone and never consults `category` (`../browser-skill-loader.ts:117-122`). Current: authentication→authentication, data-extraction→extraction, form-filling→interaction, visual-interaction→visual, web-navigation→navigation, web-scraping→scraping.
- **Optional resources.** `references/*.md` and `scripts/*.js`. Scripts are bare `() => { … }` payloads separated by `---`; they are **NEVER executed by any code path** — the loader only pastes them into the prompt (`../browser-skill-loader.ts:91-97`, `:194-204`). Treat every script as documentation, not runnable code. The loader inlines EVERY file in `references/` or `scripts/` regardless of extension (`readdirSync`, no filter — `:84`, `:93`); keep those folders to `.md`/`.js` only or it becomes prompt bloat.
- **Progressive-disclosure budget.** The catalog carries just `name` + `description` and is capped at ~500 tokens (`../browser-skill-loader.ts:18-19`); full bodies load only for skills matched to the current task. So keep `description` short and dense — a verbose description inflates every routing pass.
- **The loader caches.** The catalog (`catalogCache`) and each skill body (`skillContentCache`) are memoised after first read (`../browser-skill-loader.ts:14-15,22-25,61-64`); a `SKILL.md` edit is not picked up until the process restarts (unless Vite HMR reloads the module). Restart `npm run dev` to see skill changes.
- **Assignment is separate from routing.** Even when a skill is matched here, the planner only assigns it to a subtask if it also appears in the planner's SKILL ASSIGNMENT HINTS (`../browser-planner.ts:58-64`). Add the skill name there or it is never used. The six current skills map 1:1 to those hint lines.
- **No priority among matches.** `matchSkills` returns EVERY skill whose description token hits the task (`../browser-skill-loader.ts:117-128`); matched bodies concatenate in load order. Overlapping descriptions double-load unrelated skills, so keep the six `description` word-sets disjoint.
- **Only three paths are read.** Per skill directory the loader touches `SKILL.md`, `references/` and `scripts/` (`../browser-skill-loader.ts:40,68,81,91`); any other top-level file or folder is ignored. Extra folders here are dead weight, not structure.

## Work Guidance

- Layout: `skills/<kebab-dir>/SKILL.md`, front matter `name` = `<kebab-dir>`, optional `references/` and `scripts/`. No other file types are read.
- Fixed four-block shape (all six follow it, in order): `# <Title> Skill` → `## When to use` (bulleted triggers) → `## Instructions` (numbered **bold** topics with sub-bullets) → `## Best Practices`. Keep SKILL.md ≤52 lines; do not grow a fifth block.
- Voice: imperative and tool-anchored — open steps with the exact tool, e.g. "**Always start with browser_snapshot**", "Use `browser_fill` for the username field". Wrap tool names in backticks.
- Description hygiene: pick task-specific tokens; avoid near-universal words ("website", "page", "data", "user") that appear in almost every task and over-match every skill. Inlined `references/`/`scripts/` concatenate in filesystem `readdirSync` order (`../browser-skill-loader.ts:84,93`), so never depend on their relative order in the prompt.
- Reference only the `browser_*` tools the server actually exposes (the 14 names catalogued in `../AGENTS.md`); do not invent tool names.
- Security-first phrasing is mandatory for anything touching credentials: never store/log/echo passwords, use a `[credentials provided]` placeholder, do not attempt to bypass 2FA (`authentication/SKILL.md:17-34`). Screenshots are not returned as images, so instruct the agent to describe them (`visual-interaction/SKILL.md:52`).
- **Do NOT create a per-skill `AGENTS.md`.** Each `SKILL.md` already is the per-skill contract and is injected verbatim at runtime; a second doc per skill would duplicate prose the loader reads. This leaf doc is the only contract for the folder — extend it here instead.
- Adding a skill (5 coupled edits): create `skills/<kebab-dir>/SKILL.md` with `name` = `<kebab-dir>` + `description` front matter; write the four blocks; add `references/` or `scripts/` if needed; register `category` if not `"interaction"`; add the name to `../browser-planner.ts:58-64`. Verify by restart and read the `[SkillLoader] Loaded N skills` / `Matched N skills` logs.

## Verification

- Nothing here is executed or unit-tested: no test imports the skill loader, and `npm run test` never touches these files. Gates are `npm run typecheck` / `npm run lint` for the loader (absent `node_modules` — `npm install` first) plus a `npm run dev` run observing the runtime logs `[SkillLoader] Loaded N skills from catalog` (`../browser-skill-loader.ts:51`) and `[Subgraph][skillRouter] Matched N skills` (`../browser-subgraph.ts:149`).
- Front-matter errors fail **silently** — a bad/missing `name:` or `description:` only logs a warn (`../browser-skill-loader.ts:155`) and drops the skill from the catalog. Re-check both fields after every edit.
- Packaging caveat: `skills/` is not copied into the production build (see `../AGENTS.md` BUILD/PACKAGING GAP), so skill edits are only observable under `npm run dev`.
- Front-matter sanity grep (run from the repo root): `grep -HnE "^(name|description):" src/main/services/browser/skills/*/SKILL.md` must return two lines per file with `name` equal to the directory name; any skill with one line is silently skipped.
- The per-skill discovery log at `../browser-skill-loader.ts:45` is `debug` under the unregistered `BrowserSkillLoader` key, so it is suppressed in production; trust only the `info` count at `:51`.

## Child DOX Index

Leaf doc — `skills/` owns **no child docs**. It governs the six skill folders listed in Ownership: `authentication`, `data-extraction`, `form-filling`, `visual-interaction`, `web-navigation`, `web-scraping`. Do not add per-skill docs (see Work Guidance); if a folder becomes a durable boundary beyond `SKILL.md`, extend this file.
