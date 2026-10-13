# docs/ — Documentation boundary (DOX leaf)

Binding work contract for `docs/`. The root `AGENTS.md` "Documentation Authority" section classifies root-level markdown; that table is not repeated here. This doc governs the five files in `docs/` plus the durable rules for classifying any repo doc as live vs diary.

## Purpose

- Make `docs/` honest: every file is labelled by freshness so no reader has to infer whether its claims are current.
- Give an agent working in this repo a trustworthy pre-edit read: here, live reference and point-in-time diary are never confused.
- Encode the five classification rules in Local Contracts; they outlive the current five files.

## Ownership

| File | Classification | Verified facts |
|---|---|---|
| `docs/desktop-agent-gap-analysis.md` | LIVE, roadmap | Dated 2026-05-13 at `:3`. Competitor/roadmap study; its roadmap sections describe work not done, so cite it only as "roadmap, not inventory". Tool count stale: says 28 at `:11,754,846` (actual 32). Claims PowerShell UIA at `:11,49,62,657`; the shipped path is native `node-winautomation` COM (`src/main/services/desktop/uia-native.ts` requires it; `accessibility-tree.ts` `initialize()` logs "native, no PowerShell"); `uia-wrapper.ts` is dead with zero importers |
| `docs/desktop-agent.md` | STALE, quarantined by root rail | `:14` says "26 tools" (actual 32); `:3` points at `.cursor/rules/doc-sync-on-changes.mdc`, which does not exist |
| `docs/FILE_SEARCH_ENHANCEMENTS.md` | HISTORY ONLY | Change report: "Summary of Changes", "Files Modified" at `:383`, emoji status at `:206`. Its paths do resolve (`src/main/utils/esRunner.ts`, `src/renderer/hooks/useFileSearch.ts`, `src/preload/preload.ts`), but it describes one past change, not current behaviour |
| `docs/WEB-TOOLS-GUIDE.md` | STALE, quarantined by root rail | Documents Cursor's `.cursor/rules/*.mdc` + `.cursor/skills/*` tree at `:309-328`; `.cursor/` is gitignored (`.gitignore:82`) and physically absent. About Cursor, not Qyther |
| `docs/file-search-ask-mode-bridge-preview.html` | Mockup, not documentation | Throwaway CSS mockup (`<title>` at `:6`), no consumer |

## Local Contracts

1. **Freshness label mandatory.** Every doc added to `docs/` declares at the top, in one line, exactly one of: live / roadmap / history / mockup. A reader must never have to infer freshness.
2. **No `path:line` citations of source code.** Line numbers rot on the next edit; cite `path` plus symbol name instead. Existing violators to fix if touched: `UI-FIXES-SUMMARY.md:51`, `VISUAL-TESTING-REPORT.md:11`.
3. **No Cursor-tree references.** `.cursor/rules/*`, `.cursor/skills/*`, and `@design-tokens-enforcement` are dangling everywhere in this repo; never cite them as if they existed.
4. **Changelog convention** (the closest thing to a house template): metadata blockquote at the top, then `### [YYYY-MM-DD] slug: description` entries with **What / Files / Impact / Details** (`overall-architecture.md:136-142`). There is no front matter anywhere and no other template — do not invent one.
5. **Numeric facts are re-derived from source before being written.** Tool counts, file counts, versions must be counted from code, never copied from another doc. All four stale docs above failed this. Current truth: 32 desktop tools — 32 `create…Tool` exports in `src/main/services/desktop/desktop-tools.ts` and 32 `DANGER_POLICY` entries in `src/main/services/desktop/desktop-agent.ts`.

## Work Guidance

- New reference material belongs in the root `AGENTS.md`, `overall-architecture.md`, or the owning subtree's `AGENTS.md`; use `docs/` for studies, reports, and mockups, and label them per rule 1 on day one.
- Apply the rule 1 label as a blockquote directly under the `#` title, e.g. `> **Status**: roadmap — counts below are stale; see docs/AGENTS.md`.
- When editing `docs/desktop-agent-gap-analysis.md`, keep the roadmap label visible and correct the 28→32 tool count where you touch those sections; do not treat its gap tables as current inventory.
- Quarantined files (`docs/desktop-agent.md`, `docs/WEB-TOOLS-GUIDE.md`) are not authority; repair only as part of explicit doc-cleanup work, and if you cannot fix them, label per rule 1 rather than deleting.
- If your code change alters anything `docs/` counts or names (tool count, UIA backend, IPC surface), either update the affected doc in the same pass or state in your report that the doc is now stale.
- The HTML mockup needs no maintenance; if it is ever wired into the app, it stops being a `docs/` file and moves to the renderer tree.
- Classifying a new file: dated + describes one change + "Files Modified" section = history; describes work not yet done = roadmap; matches current code = live only if you re-derived its facts per rule 5.

## Verification

There is no doc linter in this repo. `npm run typecheck`, `npm run lint`, `npm run test` do not touch `docs/` at all — they are not doc verification, and a green run says nothing about these files. The repeatable checks are the read-only greps and recounts below, run from the repo root before and after any work in `docs/`:

```bash
grep -rn "\.cursor/" docs *.md                      # rule 3. Expect hits only in docs/WEB-TOOLS-GUIDE.md, docs/desktop-agent.md, this contract, and root files; any new file = dangling Cursor ref. Do not grep bare "cursor" — the gap-analysis legitimately means the mouse pointer
grep -rn "@design-tokens-enforcement" docs *.md     # rule 3. Expect hits only in AGENTS.md and this contract (both name the ban); any other file = violation
grep -cE "^export function create[A-Za-z]+Tool" src/main/services/desktop/desktop-tools.ts   # rule 5: must equal any documented tool count (32)
awk '/^const DANGER_POLICY/,/^};/' src/main/services/desktop/desktop-agent.ts | grep -cE "^  '?[a-z_]+'?:"   # cross-check: same count (32)
```

Then, per doc: confirm the rule 1 freshness label exists, every cited `path` resolves, every cited symbol exists, and no doc line cites a source `:line` (rule 2 — `path:line` into `docs/*.md` files is allowed, into `src/` is not).

## Child DOX Index

Leaf doc — `docs/` has no subdirectories and owns no child docs.
If a subfolder here ever becomes a durable boundary, create its `AGENTS.md` per the root rail's child-doc shape and list it above.
