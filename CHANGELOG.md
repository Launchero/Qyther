# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`1.0.0` is the version declared in `package.json`. It is the only release entry in this file: the repository has no git tags, no changelog history before it, and no published binaries, so the date below is the commit date of `HEAD` at the time this file was written, not a download date.

## [Unreleased]

## [1.0.0] - 2026-10-13

### Added

- **Command palette shell.** A frameless, transparent, always-on-top Windows window opened by the global hotkey Alt+Space, with fuzzy result ranking, quick-execute slots for rows 1-9, an Emacs-plus-Vim keyboard map, a shortcuts overlay, and a system tray. Alt+Space on Windows needs both a koffi low-level keyboard hook and an in-window `SC_KEYMENU` intercept, because the operating system reserves the combination.
- **Three window modes.** `compact`, `expanded` and `custom` geometry (`src/main/windowManager.ts`), persisted through `preferences.json` and broadcast to the renderer over IPC. The window hides to the tray rather than closing.
- **File search.** Instant Windows filename search through the Everything CLI (`es.exe`), auto-download of that CLI if it is missing, debounced queries from the renderer, and a recent-files list.
- **Ask mode with four compiled LangGraph graphs.** An `AskGraph` of 5 nodes plus three delegated subgraphs — browser (8 nodes), desktop (7) and document (9) — for 29 nodes in total, with a shared `AskState`, intent classification before any model call, per-turn checkpoint threads, and reasoning-step streaming to the renderer.
- **Windows GUI automation agent.** 32 LLM-callable tools over three native backend families (koffi FFI into `user32.dll`/`shell32.dll`, `libwin32`, and `node-winautomation` UIA COM), with screenshot capture, `tesseract.js` OCR, pixel-diff and UIA postcondition verification, a plan-execute-verify-recover subgraph, and trajectory memory.
- **Human-in-the-loop gating.** A per-tool danger policy (`src/main/services/desktop/desktop-agent.ts:62-95`) — 29 `safe`, 2 `reviewable`, 1 `dangerous` — that interrupts for confirmation before any non-safe action, with deny fed back to the model as a no-retry instruction.
- **Browser automation agent.** Chromium driven through the Playwright MCP stdio server, with on-disk `SKILL.md` prompt material, LLM task planning, postcondition verification and a five-strategy recovery ladder.
- **Document generation.** Real `.docx`, `.pptx` and `.xlsx` output via `docx`, `pptxgenjs` and `xlsx`, written only into `~/Documents`, verified by re-parsing the written bytes, with reads bounded by a shared loader (`mammoth`, `pdf-parse`, `unzipper`, `xlsx`) and per-format size caps.
- **MCP client.** Servers are added by editing `mcp-config.json` — no code change per server — with intent- and keyword-prefix tool routing, per-server enable/disable in preferences, and a non-fatal retry at startup.
- **Trajectory and failure memory.** `sql.js` persistence with four append-only migrations (`src/main/services/database/`), reused by both the desktop and document learning loops.
- **Structured generative UI.** Table, form, comparison, list and chart payloads rendered from validated Zod structured-output payloads, with skeleton and progress states while a payload streams, plus a per-answer token/cost/duration disclosure.
- **Design system.** A three-layer OKLCH token architecture (`src/renderer/styles/tokens/` -> `semantic/theme.css` -> component) over shadcn primitives and Tailwind v4, with `.dark` class theming and centralised reduced-motion handling.
- **Windows packaging.** An NSIS x64 installer target via `electron-builder` (`npm run build:win`), plus an unpacked directory build (`npm run build:win:dir`).
- **Security posture.** Sandboxed renderer with context isolation and no Node integration, denied `setWindowOpenHandler`, a `will-navigate` allowlist, protocol checks on `url:open`, and dev-only remote debugging gated on `NODE_ENV`. See `SECURITY.md` for the limits of this.

### Notes

- LLM access is `@langchain/openai` against any OpenAI-compatible endpoint. Configuration is three required environment variables — `API_KEY`, `BASE_URL`, `MODEL` — with optional `FAST_MODEL` and `TAVILY_API_KEY`; see `.env.example`.
- Web search is a DuckDuckGo HTML scrape with a Tavily fallback; there is no vendor search API dependency.
- The automated test suite in this release is a skeleton: `npm run test` collects two files, `src/main/ipc/handlers.test.ts` and `src/main/services/langgraph/research-agent.test.ts`, and neither imports production code. The graphs, the 32 desktop tools, the streaming contract and the renderer are untested. See `CONTRIBUTING.md`.
- Documentation in this repository is contract-driven: nested `AGENTS.md` files are binding for contributors, and several root-level reports are explicitly marked historical.
