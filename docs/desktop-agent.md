# Desktop Agent Architecture

> Auto-maintained by Cursor agent. See `.cursor/rules/doc-sync-on-changes.mdc` for sync rules.
> Last updated: 2026-05-12

## Current Architecture

The desktop agent is a ReAct loop that performs GUI automation on Windows. It uses a planner subgraph to decompose tasks into subtasks, executes each subtask via tool-calling LLM, verifies results via screenshot/OCR/diff-based checks, and stores trajectories for future retrieval.

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Desktop Agent | `desktop-agent.ts` | ReAct loop with 26 tools, tool execution, danger policy |
| Desktop Subgraph | `desktop-subgraph.ts` | LangGraph StateGraph: memoryRetrieve -> planner -> executeSubtask -> delegateToBrowser -> verifier -> recovery -> memoryStore |
| Desktop Planner | `desktop-planner.ts` | Decomposes tasks into ordered subtasks; skips LLM for simple window actions; detects browser-requiring subtasks |
| Desktop Verifier | `desktop-verifier.ts` | Verifies subtask completion via window state, pixel diff, OCR; validates browser delegation results |
| Windows Adapter | `windows-adapter.ts` | Windows-specific UI automation and screenshot capture |
| Input Simulation | `input-simulation.ts` | Win32 API input simulation (SendInput, ShowWindow) |
| Desktop Tools | `desktop-tools.ts` | Tool definitions for LangChain (click, type, screenshot, window management, etc.) |

### Cross-Agent Browser Delegation

The desktop subgraph can delegate browser-centric subtasks to the browser agent mid-execution. When the planner detects a subtask requiring web interaction (URLs, web forms, web data extraction), it flags it with `requiresBrowser: true`. The `delegateToBrowser` node then:

1. Extracts the subtask description and postcondition
2. Builds a browser task payload with accumulated desktop context
3. Calls `executeBrowserSubgraph()` to run the browser agent
4. Receives structured results back (actions, artifacts, execution trace)
5. Routes to the next subtask (desktop or browser) via conditional edges

```
memoryRetrieve -> planner -> executeSubtask
  ├── (next subtask.requiresBrowser = true) -> delegateToBrowser -> [more browser?] -> delegateToBrowser / [more desktop?] -> executeSubtask / [done] -> memoryStore
  └── (next subtask requires desktop) -> verifier -> [pass + more?] -> executeSubtask / [pass + done] -> memoryStore / [fail] -> recovery
```

The browser subgraph handles its own verification. The desktop subgraph stores full cross-agent trajectories in memory, including delegated browser actions and artifacts, enabling experience-based retrieval for future hybrid tasks.

## Changelog

### [2026-05-12] optimize-window-interaction: Eliminate 30s planner timeout and 11s verifier overhead for simple window tasks
- **What**: Three optimizations for window management tasks (minimize, maximize, restore, close, focus):
  1. **Planner shortcut**: `isSimpleWindowTask()` regex detects window management tasks and skips LLM entirely, falling back to single-subtask plan instantly (saves ~30s timeout).
  2. **Verifier shortcut**: `verifyDeterministicWindowAction()` performs lightweight window-state verification without expensive screenshots, pixel diff, or Tesseract OCR (saves ~11s).
  3. **Agent shortcut**: Skips initial screenshot capture (~1s) for simple window tasks, reducing first-LLM-call context size.
- **Files**:
  - `src/main/services/desktop/desktop-planner.ts` — added `isSimpleWindowTask()` with regex keywords; planner now detects and skips LLM for window management tasks
  - `src/main/services/desktop/desktop-verifier.ts` — added `isDeterministicWindowAction()` and `verifyDeterministicWindowAction()` with per-action verification helpers
  - `src/main/services/desktop/desktop-agent.ts` — skips initial screenshot for simple window tasks
- **Impact**: ~42s saved (70% reduction) for simple window management tasks. Expected latency: ~18s -> ~6s for "minimize window" type requests.
- **Details**: Before: 60s total (30s planner timeout + 18s ReAct loop + 11s verifier + 1s init). After: ~18s estimated (0s planner skip + 7s ReAct loop + 0s verifier + 0s screenshot skip). The verifier uses direct `listWindows()` API call instead of screenshot diff, completing in <100ms.
