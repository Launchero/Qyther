## What changed

One paragraph on the problem this solves and the shape of the fix. Then a short list of the behavioural changes a reviewer would notice. If this closes an issue, link it here.

## Scope

Files and folders touched:

- `path/to/file` — why

## Contracts followed

Check what applies. An unchecked box needs a sentence saying why it does not.

- [ ] I read the `AGENTS.md` chain from the repository root down to every path I touched, in this session, and the change respects it.
- [ ] I updated the nearest owning `AGENTS.md` after editing (Purpose, Ownership, Local Contracts, Work Guidance or Verification as applicable), and any parent whose Child DOX Index changed. Stale or contradicted text was deleted, not annotated.
- [ ] **IPC**: if I added, renamed or removed a channel, all four sites are in step: the channel string in `src/preload/preload.ts`, the `ipcMain.handle` in `src/main/ipc/`, the renderer call site, and `src/renderer/types/electron.d.ts`. Validation added in main, not only in preload.
- [ ] **IPC**: I did **not** extend `src/preload/types.d.ts` or `src/renderer/types.d.ts` (stale duplicates).
- [ ] **Desktop tool**: if I added a tool, all six edits are present: factory in `src/main/services/desktop/desktop-tools.ts`, member of `DesktopToolName` (`src/main/services/desktop/types.ts:74-106`), `DANGER_POLICY` entry (`src/main/services/desktop/desktop-agent.ts:62-95`), push into the `DesktopAgent.initialize()` array (`desktop-agent.ts:136-170`), system-prompt guidance line (`desktop-agent.ts:251-300`), and a branch in `inferStatusFromTool` (`desktop-agent.ts:746-761`). Missing the last one makes the UI report "capturing" forever.
- [ ] **Desktop tool**: if I added an action to an existing tool, the per-action `file_operations`-style danger override was updated too.
- [ ] **Graph node**: if I added a node, it is registered in `NODE_AGENT_MAP` and in **both** `responseNodes` whitelists in `src/main/ipc/chat-handlers.ts`, and its reducer choice in `src/main/services/langgraph/state.ts` is deliberate.
- [ ] **Logger**: if I introduced a `createLogger('<Subsystem>')` name, it has a `SUBSYSTEM_ENV_VARS` entry in `src/main/utils/logger.ts:57-84`. Without one, its `info` and `debug` lines are dropped in production and no env switch can enable them.
- [ ] **Styling**: no new hardcoded pixel values or colors. I ran the three drift greps and pasted the output below; `oklch(` inside `src/renderer/components/` is still empty and `@theme inline` still returns exactly one hit.

## Verification

Actual output, not intentions.

```
npm run lint
npm run test
npm run typecheck
npm run build
```

Design drift greps:

```
grep -rn "oklch(" src/renderer/components/
grep -rn "@theme inline" src/
```

- [ ] `npm run dev` was run and the affected flow was exercised by hand.
- [ ] UI changes were checked in light **and** dark (toggle `.dark` on `<html>`).

### Screenshots for UI changes

Before and after, both themes if the change is theme-sensitive.

## Tests

- [ ] Where this fixes a bug, I added a test that imports the production module and fails without the fix.
- [ ] Where a surface is untested and I could not add a test, the manual steps above are the only coverage — and I said so below.

Do not write that the suite covers this. `npm run test` collects two files that import no production code, so a green run is not evidence.

## Dependencies

- [ ] No new dependency. Or: `name@version` — why the existing stack cannot do the job, and its native or license implications.
- [ ] Native modules untouched: `koffi`, `libwin32`, `node-winautomation` remain in the externals list in `electron.vite.config.ts`.
- [ ] No non-code runtime resource was added that `electron-builder` would need a copy step for. Anything read from disk at runtime beyond `sql-wasm.wasm` and `Automation.node` silently disappears from a production build.

## What I could not verify

State plainly what you did not check, and why — an absent `node_modules`, no Windows machine, no API key, a path you could not reach, a claim in the docs you could not confirm. This is the most useful section in the pull request: this repository has too much documentation that asserts things nobody tested, and it is better to record a gap than to imply coverage that does not exist.

## License

- [ ] I have read `LICENSE` (the proprietary Qyther Commercial Software License, not MIT) and I agree that my contribution is distributed under the same terms as the rest of this repository. I have the right to offer what I submitted, and I included no secrets — no `API_KEY`, no real `.env`, no credentials in `mcp-config.json`.
