# src/main/services/langgraph — DOX child contract

Parent: `../AGENTS.md` (agent-runtime rail). Local contract wins local detail; parents win repo-wide rules.

## Purpose

The single compiled AskGraph: graph build, `AskState` annotations and reducers, node/edge recipes, and the only in-graph-authored tool (`webSearchTool`). Subgraph implementations are NOT here — this folder wires `../desktop/`, `../browser/`, `../document/` into the graph.

## Ownership

- `research-agent.ts` (1376 lines) — graph build, all nodes, routers, structured-output schemas.
- `state.ts` (369 lines) — `Annotation.Root` (`:64-330`), shared agent types, `debugSnapshot` (`:338`).
- `tools.ts` (111 lines) — in-graph tools only.
- `research-agent.test.ts` (473 lines) — see Verification before trusting it.
- The graph's consumers (`src/main/ipc/chat-handlers.ts`) are NOT owned here; their streaming rules are the parent doc's contract.

## Local Contracts

- **One graph, five real nodes.** `getAskGraph` (`:223-264`) builds exactly one graph: nodes chained at `:236-241` (`classify`, `browserSubgraph`, `desktopSubgraph`, `documentSubgraph`, `postProcessNode`), edges at `:242-251`, checkpointer `new MemorySaver()` (`:234`), `compile({checkpointer})` (`:253`). Env-keyed cache at `:175-190`; call `clearGraphCache()` (`:187`) after env changes.
  - `clearGraphCache()` is currently exported and called by nothing — invalidation is manual; there is no automatic env watcher.
- **Router contract**: `routeAfterClassify` (`:408-420`) returns only `"browser" | "desktop" | "document"`. Everything not desktop/document goes through `browserSubgraph`.
- **THE TRAP — six fake nodes**: `comparisonNode:567`, `formNode:685`, `chartNode:795`, `externalSearchNode:903`, `internalKnowledgeNode:995`, `generalChatNode:1037` are NOT graph nodes. They are dispatched imperatively inside `browserSubgraphNode` (`:463`, dispatch checks `:480-510`). Never `.addNode` them and never add conditional edges to them.
  - Dispatch order inside `browserSubgraphNode`: contextual followup → comparison regex → form regex → chart regex → research+medium/complex → `externalSearchNode` → research+simple → `internalKnowledgeNode` → general → `generalChatNode` → browser-automation fallback delegating to `executeBrowserSubgraph` at `:536` (checks `:480-510`).
  - New imperative handlers belong in that chain, not in the graph.
- **Node signature**: `(state: AskStateType) => Promise<Partial<AskStateType>>` — example `classifyNode:284`. Return partials; never mutate state.
- **Reducer law (`state.ts`)**: reducers are load-bearing. `replaceArray` (`:44`) for per-turn fields; append reducers for `reasoningSteps:90`, `uiPayloads:130`, `desktopExecutionTrace:184`, `desktopActions:198`, `crossAgentContext:236`. A wrong reducer = cross-turn contamination on a reused `MemorySaver` thread.
- **Tool contract (`tools.ts`)**: `webSearchTool` (`:43-111`) is DuckDuckGo HTML scrape with Tavily fallback (`TAVILY_API_KEY` read at `:8`). Authored with `tool(fn, {name, description, schema: z.object})` (`:103-110`); invoked at `research-agent.ts:921`. This is the only in-graph-authored tool — MCP-sourced tools come from `../mcp/`, not here.
  - The DuckDuckGo result regexes (`tools.ts:63,75`) are fragile by nature; repair them in place, do not add another search provider unasked.
- **Classification entry (`classifyNode:284`)**: heuristics run before any LLM call — `detectFastPath` (`:80-98`, consumed `:289-299`) and `isContextualFollowup` (`:268-282`). Model instances at module scope: `chatModel` (`:16-24`, streaming), `routerModel` (`:27-34`, `maxTokens: 10`), `rewriteModel` (`:37-44`, `maxTokens: 100`) — all read `MODEL`/`FAST_MODEL`/`API_KEY`/`BASE_URL` at import. Invalid LLM complexity output falls back to the `assessComplexity` heuristic (`:380-386`); keep that guard when touching classification.
- **Fan-in shape**: all three subgraph nodes edge into `postProcessNode` (`:248-250`) which edges to `END` (`:251`) — every subgraph must return a partial that `postProcessNode` can finalise.
- **Message hygiene**: read `state.messages` only through `safeMessages` (`:116`), the guard against malformed message arrays; `rewriteQueryWithContext` (`:423`) resolves followup anaphora against history before LLM calls.
- **State defaults**: `intent` defaults to `"general"` (`state.ts:74-77`), `finalResponse` to `""` (`:86-89`); `previousIntent` (`:135` region) carries the last turn's intent into `classifyNode` for followup detection.
- **HITL propagation**: child subtrees call `interrupt()` (e.g. `desktop/desktop-agent.ts:439`); the subgraph nodes here detect the pause and surface it (`research-agent.ts:1097` desktop path, `:1188` document path). Resume plumbing is the parent doc's streaming contract.

## Work Guidance

- Add a node: write a signature-conforming function, `.addNode` it in `getAskGraph`, wire an edge/conditional edge, then register it in `NODE_AGENT_MAP` and BOTH `responseNodes` sets in `src/main/ipc/chat-handlers.ts` (parent doc's streaming contract) or it streams nothing.
- Add a state field: pick its reducer deliberately — `replaceArray` unless the field must accumulate across turns within one thread.
- Add a generative-UI path: Zod schema (`:122-171` region) + `withStructuredOutput(schema, {method:"jsonMode"})` + post-parse validity filter (pattern at `:1353`). Keep the trio.
- MCP tools bind to the model via `getMCPModelForIntent` (`:194-221`) — it merges intent- and keyword-matched tools and dedupes by name; change server selection in `../mcp/tool-router.ts`, not here.
- Debugging state: use `debugSnapshot` (`state.ts:338`), which is JSON-safe (excludes screenshots/large arrays); never log raw state.
- Subgraph wiring changes: `desktopSubgraph`/`documentSubgraph`/`browserSubgraph` nodes delegate into `../desktop/`, `../document/`, `../browser/` — internal behaviour is those docs' contract; this folder only guarantees the `Partial<AskStateType>` return shape.
- Max 50 lines per function (root rail); extract helpers beyond that.

## Verification

- `research-agent.test.ts` (473 lines) **tests the test, not the source**: it imports only `describe/it/expect` from vitest and `import type { AskStateType } from './state'` (`:1-2`), then re-implements router logic inline (`routeAfterSynthesis:119-135`, `routeAfterFanOut:99-112`) for routers that do not exist in `research-agent.ts`. Passing it proves nothing about the graph.
- Graph compile, every node, all reducers, `state.ts` and `tools.ts` are untested. Real gates: `npm run typecheck` and `npm run dev` (end-to-end ask). `node_modules` may be absent — `npm install` first.
- The HITL pause paths (`:1097`, `:1188`) and the `interrupt()` round-trip have no automated coverage either — verify any touch by hand in `npm run dev`.

## Child DOX Index

No child docs.
Browser/desktop/document subgraph internals live in `../browser/`, `../desktop/`, `../document/` (their own docs; this folder only wires them into the graph).
