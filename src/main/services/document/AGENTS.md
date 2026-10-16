# src/main/services/document — DOX child contract

Parent: `../AGENTS.md` (agent-runtime rail). The tools that drive this subtree are `../pi/tools/document-tools.ts`; the loop that calls them is `../pi/ask-turn.ts`.

## Purpose

Office-document generation. Five Pi tools take a task and produce a real `.docx` / `.pptx` / `.xlsx` file on disk with `docx`, `pptxgenjs` and `xlsx`, then re-parse the bytes they just wrote to verify them. **There is no graph, no planner, no recovery ladder and no delegation here** — the model plans, because the loop already plans.

## Ownership

| File | Lines | Owns |
|---|---|---|
| `document-executor.ts` | 331 | File writing: `createDocx:90`, `createPptx:158`, `createXlsx:236`, dispatch `executeDocumentSubtask:298`, `getDocumentsFolder:38`, `sanitizeFileName:47`, `uniqueFilePath:60` |
| `document-executor.test.ts` | 110 | Imports the production executor — this subtree's one real gate |
| `document-verifier.ts` | 164 | `verifyDocument:20`: file-exists / format-valid / content / structure scoring |
| `types.ts` | 75 | `DocumentFormat:11`, `DocumentActionType:16`, `DocumentSubtask:22`, `DocumentVerificationSignal`, `DocumentVerificationResult`, `DocumentExecutorResult` |

**Deleted, and do not restore:** `document-subgraph.ts` (9-node `StateGraph`), `document-delegation.ts` (browser/desktop handoff), `document-planner.ts` and `document-recovery.ts` (each built a `ChatOpenAI` and called `withStructuredOutput`), `document-memory.ts` (trajectory store whose only writer was the graph's `memoryStore` node), `ui-detector.ts`. The types that existed only for those — `DocumentRecoveryAction`, `DocumentDelegationResult`, `DocumentTrajectoryRecord`, `DocumentTrajectoryStep`, `DocumentExecutionTraceEntry` — are deleted too.

## Local Contracts

- **The five tools are the contract with the model**, and their names are fixed by `../pi/ask-prompt.ts`'s `FAMILY_GUIDANCE.document`: `create_docx`, `create_pptx`, `create_xlsx`, `read_document`, `modify_document`. A sixth name there means a sixth name here, in the same change.
- **Verification is inline, in the tool, and that is deliberate.** `reportVerified` (`../pi/tools/document-tools.ts`) calls `verifyDocument` on the file it just wrote and puts the score **in the tool result text the model reads**. There is no separate `afterToolCall` hook: unlike the desktop pixel verifier, which needs screen state the tool cannot see, re-reading a file is something the tool can do for itself, and a hook would verify every file twice.
- **Verification is re-parse, not trust-the-LLM** (`document-verifier.ts:20-`): file exists +0.2 (`:36`), format parses +0.2 (`:56`), postcondition key terms present +0.3 (`:75-83`), structure matches spec +0.3 or partial +0.15, pass at `score >= 0.6`. An unparseable file or too few key terms fails early and short.
- **The `read` path is real and is wired end to end** through `extractDocument` (`../utils/document-loader.ts`), reached from `read_document` and `modify_document`. This is a change from the graph era, where a read-classified task arrived with no subtasks and returned `'No subtask available'`.
- **Writes go only to `~/Documents`.** `getDocumentsFolder()` is the sole output root; there is no user-chosen path. The `read_document`/`modify_document` tools resolve a caller-supplied relative path against that root and reject anything that escapes it (`../pi/tools/document-tools.ts:64-69`) — that check is the sandbox, do not weaken it.
- **THE COLLISION COUNTER IS DEAD CODE — FILES OVERWRITE, UNFIXED.** In `uniqueFilePath` (`:60-86`) the first `try` block contains only comments and an unconditional `break` (`:69`), so the `while (true)` exits on iteration one and the `statSync`/`_N` renaming branch below it (`:74-82`) never runs. Asking for the same title twice silently replaces the first file. Measured in this checkout: the `break` is still there. The fix is to replace `:64-72` with a real existence check inside the loop; until that happens, never cite `:60-86` as collision-safe and never describe overwriting as a regression — it is the documented current behaviour.
- **`contentSpec` is untyped on the way in and cast on the way out.** The executor reads it through raw `as` casts: docx `sections`, pptx `slides`, xlsx `sheets`, each with a `title` fallback. The TypeBox schemas on the tools describe the shapes you *wish* were enforced. Either wire those schemas into the executor or leave the casts — never add a third, undocumented shape.
- **Format-specific write rules.** docx needs `Packer.toBuffer` before `fs.writeFile`; pptx writes by path through `pres.writeFile({fileName})`; xlsx truncates sheet names to 31 chars (`:269`) and still writes one sheet containing the task text when the spec is empty. Every writer falls back to the task description for the file name, through `sanitizeFileName` (allowlist `[a-zA-Z0-9\s\-_().,]`, spaces→`_`, 80-char cap, `'document'` fallback).
- **Library binding contract**: `docx` is a static ESM import → `Packer.toBuffer` + `fs.writeFile`; `pptxgenjs` is CJS and MUST go through `createRequire(import.meta.url)`, `new PptxGenJS()`, `pres.writeFile({fileName})`; `xlsx` is required the same way and written with `xlsx.writeFile(workbook, filePath)`. Do not convert these to static imports — the build is ESM-only main.
- **Every read goes through `../utils/document-loader.ts`** — never a second parser: `unzipper`, `pdf-parse`, `mammoth`, `xlsx`, with per-format size caps (5 MB office, 10 MB PDF).
- **Logger is `DocumentExecutor` and `DocumentVerifier`**, both registered to `LOG_DOCUMENT` in `SUBSYSTEM_ENV_VARS`. The names of the deleted modules (`DocumentSubgraph`, `DocumentPlanner`, `DocumentRecovery`, `DocumentMemory`, `DocumentDelegation`) are removed from that registry — `logger.test.ts` fails if an entry loses its call site.

## Work Guidance

- New format: extend `DocumentFormat` (`types.ts`), add `create<X>` in the executor plus a dispatch branch, add a verification branch in `document-verifier.ts`, and add the tool in `../pi/tools/document-tools.ts` **plus its name in `../pi/ask-prompt.ts`**. Four sites, no compiler help — walk them all.
- Naming: kebab-case files. The executor and verifier stay module functions; there is no class-and-singleton convention left in this folder.
- The write sandbox IS the permission boundary: `~/Documents` only, `sanitizeFileName` is the only path filter, and reads stay bounded by `../utils/document-loader.ts` size caps. Never accept a destination path from task text, and never widen the allowlist regex.
- Keep functions under 50 lines (root rail); the three `create<X>` writers are already near the cap — extract helpers rather than growing them.

## Verification

- `npx vitest run src/main/services/document/` — `document-executor.test.ts` imports the production executor, so this subtree has one real gate. The verifier has no direct test; it is exercised indirectly through the document tool tests in `../pi/tools/document-tools.test.ts`, which assert that a writing tool sets `details.verifies` and that `read_document` leaves it unset.
- `npm run typecheck` is the only mechanical gate on the write path. There is no type check on generated file bytes or on `contentSpec` shape.
- Sanity grep before reporting done: `grep -n "as " src/main/services/document/document-executor.ts` is the drift census for the whole `contentSpec` contract — a new cast is a new unvalidated assumption.
- Manual gate, mandatory after any change here: `npm run dev`, ask "create a docx report about X with three sections", then confirm a new file lands in `~/Documents` with a sanitised name and the tool result reports a verification score. Repeat for `pptx` and `xlsx`. Asking for the *same* title twice currently **overwrites** — that is the known `uniqueFilePath` defect above, not a regression.

## Child DOX Index

Leaf doc — this folder has no subdirectories and owns no child docs. The tools that drive it are `../pi/tools/document-tools.ts` (contract there); the loop is `../pi/ask-turn.ts`.
