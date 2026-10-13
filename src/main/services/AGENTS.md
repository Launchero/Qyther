# src/main/services — DOX agent-runtime parent

Binding work contract for this subtree. The root `AGENTS.md` rail controls repo-wide rules; this doc controls the agent runtime across `services/`. Child docs control their folders.

## Purpose

Host of the Ask-mode agent runtime: LLM model bootstrap, graph entry (`getAskGraph`), the cross-process streaming contract to the renderer, intent classification entry, and delegation between the desktop / browser / document agents.

## Ownership

- `langchain/agent.ts` (567 lines) — model bootstrap, in-memory chat sessions (singleton `langChainAgent` `:567`), the MCP-fed ReAct agent (`createReactAgent({llm, tools})` `:484-487`), browser session lifecycle. No child doc; rules live here.
- Cross-process streaming contract — implemented in `src/main/ipc/chat-handlers.ts`, consumed from `langgraph/research-agent.ts`; owned by this doc.
- Delegation plumbing — `AskState.crossAgentContext` (see `langgraph/AGENTS.md`); delegation endpoints inside each child agent subtree.
- `utils/document-loader.ts` — leaf, no doc of its own.

## Local Contracts

- **Graph entry**: `getAskGraph()` (`langgraph/research-agent.ts:223-264`) is the only compiled graph. It is precompiled at boot (`src/main/main.ts:119`), so cold start pays the compile once. Graph cache is env-keyed (`:175-190`); after changing `MODEL`/`FAST_MODEL`/`BASE_URL`/`API_KEY` at runtime you MUST call `clearGraphCache()` (`:187`) or the stale graph keeps the old model config.
- **One way in**: nothing outside `src/main` touches these modules. Renderer reaches the runtime only through the IPC handlers in `src/main/ipc/` (`chat-handlers.ts` for the graph, `mcp-handlers.ts` for MCP control); the channel contract is owned by `src/main/ipc/AGENTS.md`.
- **Env reads at module load**: both `research-agent.ts:16-44` and `agent.ts:90-98` construct `ChatOpenAI` from `MODEL`/`FAST_MODEL`/`API_KEY`/`BASE_URL` at import time — env must be set before first import of this subtree.
  - With no API key: `agent.ts` warns, `chatModel` stays null, and `:183-187` returns the canned error `'Chat model not initialized...'`.
  - There is NO mock/offline path apart from the fast-path heuristics (`research-agent.ts:80-98`, consumed at `:289-299`). Never add one unasked.
- **Streaming contract** (highest-value content here):
  - `graph.streamEvents(..., {version:"v2", configurable:{thread_id}, recursionLimit:50, timeout})` — `src/main/ipc/chat-handlers.ts:412-421`.
  - Per-turn thread id `${sessionId}:turn-${Date.now()}` (`chat-handlers.ts:344`) — one thread per turn isolates checkpoint state.
  - Tokens are emitted ONLY for nodes in the `responseNodes` whitelist (`chat-handlers.ts:400-403`, duplicated at `:720-723` — both sites must be edited).
  - Channels: `chat:stream-chunk` (`:464`), `chat:thinking-step` (`:476,491`), `chat:agent-change` (`:439`) keyed by `NODE_AGENT_MAP` (`:32-38`). A new node without a `NODE_AGENT_MAP` + `responseNodes` entry streams nothing.
  - Final chunk carries `uiPayloads`/`sources`/`metrics` (`:664-679`). All state reads are guarded by `withStateLock` (`:43-54`).
  - HITL: node calls `interrupt()` → renderer resumes via `chat:resumeGraph` with `new Command({resume})` (`:711-738`).
- **Structured output convention**: `chatModel.withStructuredOutput(schema, {method:"jsonMode"})` (`research-agent.ts:1270,1309,1343`) with a post-parse validity filter (`:1353`); UI payload Zod schemas at `research-agent.ts:122-171`. Keep this trio (schema → jsonMode call → filter) together when adding generative-UI paths.
- **Delegation plumbing**: cross-agent handoffs travel in `AskState.crossAgentContext` (append reducer, `state.ts:236`) and typed results like `BrowserDelegationResult` (`state.ts:47-54`). The child-agent subtrees own their ends; this doc owns the shared state contract only (detail in `langgraph/AGENTS.md`).
- **MCP supply line**: `mcpService.getTools()` feeds exactly two consumers — `getMCPModelForIntent` (`research-agent.ts:194-221`, graph path) and the ReAct agent (`langchain/agent.ts:484-487`). Server/tool selection rules live in `mcp/AGENTS.md`.
- **Model default drift trap**: `agent.ts:92` defaults to `'qwen3.5-plus'` while `research-agent.ts` and later `agent.ts` paths default to `'qwen3.6-plus'` (`agent.ts:136,270,340,377`). Both only apply when `MODEL` is unset; when touching defaults, harmonise, don't add a third value.

## Work Guidance

- New agent subtree: create the folder with its own `AGENTS.md`, register its node in `getAskGraph`, add entries to `NODE_AGENT_MAP` and both `responseNodes` sets, and extend `routeAfterClassify` (`research-agent.ts:408-420`). Missing any one of these silently kills streaming for that agent.
- Model configuration changes go through env vars read at module load; do not add a second config surface.
- Karpathy caps from the root rail apply: max 50 lines per function; nodes are `(state: AskStateType) => Promise<Partial<AskStateType>>`.

## Verification

- No runtime tests exist for the streaming contract or `langchain/agent.ts`; `chat-handlers.ts` and `agent.ts` are untested.
- `npm run typecheck` and `npm run dev` (watch the `chat:agent-change` / `chat:stream-chunk` traffic end-to-end) are the real gates. `node_modules` may be absent — `npm install` first.
- Child docs state their own verification; the only test file in this subtree (`langgraph/research-agent.test.ts`) proves nothing about the graph — see that doc.

## Child DOX Index

| Doc | Owns |
|---|---|
| `langgraph/AGENTS.md` | AskGraph build, `AskState` annotations/reducers, the six non-graph `*Node` trap, in-graph `tools.ts` |
| `mcp/AGENTS.md` | MCP client only: `mcp-config.json`-driven server addition, intent/keyword prefix maps |
| `database/AGENTS.md` | sql.js persistence: migration recipe, trajectory/failure tables |
| `desktop/AGENTS.md` | Windows GUI automation agent subtree (tool registry, DANGER_POLICY/HITL, verifier-recovery) |
| `document/AGENTS.md` | Document-generation subtree (office formats, write sandbox, delegation) |
| `browser/AGENTS.md` | Playwright-MCP browser subtree (tool resolution, session lifecycle) |
