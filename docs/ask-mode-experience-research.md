# Ask-mode experience — world-class gap research

> **Status**: roadmap — dated research record (2026-10-15). Every item under INCLUDE/UPDATE describes work **not yet done**. For current behaviour the authority remains `src/renderer/components/ask-mode/AGENTS.md`, `src/renderer/AGENTS.md` and the code. Nothing here is a claim about the app being verified live: no code changed while writing it, so the defect table is static-code evidence and the recommendations are external research, not measurements of a running build.

## 0. The structural cause

Ask-mode's spacing, motion, colour and contrast were audited and fixed with measurements on 2026-10-15 (`docs/design-system-audit.md`). What still feels bad is not that. The missing invariant is: **no ask-mode control is coupled to a truth in the main process.** A component may render anything it can name — a model chip, a web-search toggle, a Pause button, a confidence badge, a token counter, a "Recent Chats" menu — and roughly a third of those are connected to nothing, or to a number invented in the renderer.

A launcher whose controls lie is worse than one with fewer controls, because the user learns not to trust the surface. That is the theme behind every finding below: **fabricated state, dead affordances, and an answer renderer that cannot render answers.** The single highest-leverage change is not visual — it is the rule "a control renders only when the state it manipulates exists, and a number displays only when something measured it."

## 1. Method

- Read `AGENTS.md`, `src/renderer/AGENTS.md`, `src/renderer/components/ask-mode/AGENTS.md`, `docs/design-system-audit.md`, `docs/AGENTS.md`.
- Read the ask-mode render path end to end: `AskModeExpanded.tsx`, `ChatMessageBubble.tsx`, `ask-mode/ChatMessagesList.tsx`, `ask-mode/UnifiedCommandBar.tsx`, `ask-mode/ChatWelcomeState.tsx`, `ask-mode/CodeBlock.tsx`, `ask-mode/SourcesPanel.tsx`, `ChatHistoryDropdown.tsx`, `hooks/useChatSession.ts`, `src/main/ipc/chat-handlers.ts`.
- Grepped for dead/duplicated wiring (`isComposing`, `showToast`, `relatedQuestions`, `webSearch`, `activeAgent`, `overflow-anchor`, markdown and virtualisation dependencies).
- Online research on: human-AI interaction guidelines (Microsoft HAX / Amershi et al.), the Google PAIR Guidebook, NN/g, streaming-markdown reference implementations (Vercel AI SDK + Streamdown), conversation-mechanics teardowns, citation-and-trust research, latency metrics (TTFT/ITL), prompt-caching practice, agent-observability write-ups (Manus, Cursor), command-palette teardowns, accessibility of ARIA live regions, IME composition failures, scroll anchoring, reading measure, and AI-era UX measurement.
- Not done: the app was not started and nothing was driven live. Section 8 defines the drive that must accompany any implementation slice.

## 2. What "world class" means, by reference set

The bar is the current best-in-class answer and agent surfaces — ChatGPT, Claude, Perplexity, Gemini, Raycast/Alfred for the launcher half, Cursor/Windsurf for the coding-context half — expressed as checkable rules:

| Source | What it licenses in this document |
|---|---|
| [Guidelines for Human-AI Interaction](https://dl.acm.org/doi/10.1145/3290605.3300233) (Amershi et al., CHI 2019; [HAX Toolkit page](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)) | The 18 evidence-based guidelines, organised Initially / During engagement / When things go wrong / Over time — including "make clear what the system can do", "make clear how well the system can do what it can do", support for efficient oversight, correction and feedback, and learn/adapt cautiously. The frame this whole doc hangs on |
| [People + AI Guidebook](https://pair.withgoogle.com/guidebook/) — [Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/) | Mental models, feedback & control, explanations, errors and graceful failures as first-class design surface rather than afterthoughts |
| [39 Principles for Designing Human–AI Interaction](https://syntaxstream.substack.com/p/42-principles-for-designing-humanai) | "Prefer provenance over confidence scores — research shows confidence numbers can raise trust in a wrong answer. Where possible, show evidence instead"; "make output cheap to verify"; "show plans and traces for multi-step work"; "design the wait, not just the result"; "measure reliance, not just usage"; "keep generated output malleable" |
| [Citations and Trust in LLM Generated Responses](https://ojs.aaai.org/index.php/AAAI/article/view/34550/36705) (Ding et al., AAAI 2025) | Trust rose when citations were present — **including when they were random**. A citation UI is a trust placebo; shipping one that is not verifiable is worse than shipping none. See also [Citation Design in AI Overviews](https://reposit.haw-hamburg.de/bitstream/20.500.12738/20009/1/SEASON2026_paper_50.pdf) |
| [AI UX pattern catalogue](https://aiuxplayground.com/patterns) (64 patterns: Trust, Chatbot, Agents, Inputs, Outputs, Performance) | Named patterns and their anti-patterns used throughout §4: Streaming, Citations, Source Browser, Chat Artifacts, Generative UI, Follow-up Chips, Interrupt and Resume, Response Refinement, Feedback Loops, Tool Use, Autonomy Budgets, Checkpoints & Restore, Smart Diff, Multimodal Input, Context Chip Management, Model Selection UI, Cost Transparency, Running Meters, Failure Disclosure |
| [Markdown chatbot with Streamdown](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization) + [streamdown](https://github.com/vercel/streamdown) | The reference approach to markdown under a stream: handle incomplete syntax gracefully, memoize per block so unchanged blocks skip re-render, security-first HTML hardening, math/mermaid/code plugins |
| [Streaming UI patterns that don't break](https://thepromptbench.com/ai-product-ux/streaming-ui-patterns-that-dont-break/) | Debounce parsing to reading rate (≈50–100 ms), near-bottom-only autoscroll plus a jump-to-bottom pill, CSS containment against layout thrash, partial-JSON buffering, real cancellation of the upstream call |
| [Regenerate, Undo, Branch — Conversation Mechanics](https://thepromptbench.com/ai-product-ux/regenerate-undo-branch-conversation-mechanics/) | The minimum mechanics set: regenerate replays the last turn in place, edit-and-resubmit discards what followed, undo steps back, branch forks. Avoid the "irreversible log" mental model |
| [Command palette UI design: 8 states, 10 teardowns](https://www.setproduct.com/blog/command-palette-ui-design-guide) + [Command Palette pattern](https://uxpatterns.dev/patterns/advanced/command-palette) | Empty → show recents; loading → skeleton rows; no results → offer exits; rows 40–48 px; fixed group order; boxed keycaps; preview pane above ~900 px; enter animation 150–200 ms; keep focus order logical; the whole flow must be completable by keyboard |
| [Best practices for coding with agents](https://cursor.com/blog/agent-best-practices) | Plan-first, let the agent find context rather than manual tagging, watch the work in a diff view, review before commit |
| [Context Engineering for AI Agents — Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) | Stable prompt prefix, append-only context, deterministic serialisation, use the file system as context, recitation of the todo list, "mask, don't remove" unavailable actions, keep the wrong stuff in |
| [LLM inference latency](https://clickhouse.com/resources/engineering/llm-inference-latency), [TTFT glossary](https://www.cerebras.ai/glossary/what-is-time-to-first-token), [TokenFlow](https://arxiv.org/html/2510.02758v1) | TTFT and inter-token latency are the two numbers that shape the experience; end-to-end latency is not the metric the user feels |
| [Prompt caching production guide](https://www.developersdigest.tech/blog/prompt-caching-claude-api-production-guide), [deep dive](https://dev.to/whoffagents/prompt-caching-deep-dive-when-it-helps-when-it-hurts-and-the-270s-cliff-291j) | Cached prefixes are reported at ~90 % input-cost and up to ~80 % latency reduction on long repeated prefixes — and they break on any non-deterministic prefix |
| [ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions), [token-by-token announcement bug report](https://github.com/openclaw/openclaw/issues/65538) | A polite live region fed every token floods a screen reader; the accepted pattern is to silence the region while streaming and announce once at completion |
| [IME: Enter triggers send instead of confirming composition](https://forum.cursor.com/t/critical-i18n-ime-enter-key-triggers-unintended-submission-in-chat-and-askquestion-completely-breaks-cjk-input-for-1-5-billion-users/154276), [Discourse](https://meta.discourse.org/t/ime-composition-enter-key-triggers-message-send-instead-of-confirming-input/385840), [the half-fix pattern](https://dev.to/mahirhir/your-main-input-handles-ime-composition-the-rename-box-next-to-it-doesnt-26ci) | A headline-breaking bug class in every AI text box; guard `isComposing` on **every** input, not just the main one |
| [overflow-anchor / scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-anchor), [opt-out guide](http://udn.realityripple.com/docs/Web/CSS/overflow-anchor/Guide_to_scroll_anchoring) | The browser will move the viewport under you unless anchoring is understood and deliberately configured |
| [Optimal line length](https://baymard.com/research-articles/line-length-readability), [USWDS typography](https://designsystem.digital.gov/components/typography/) | 45–75–90 characters per line for sustained reading; a fixed 800 px palette with side gutters is near the edge of that |
| [The 5 Qualities of Site-Specific AI Chatbots](https://www.nngroup.com/articles/dimensions-of-ai-chatbots/) | Handoff willingness, flexibility, proactivity, emotional responsiveness, transparency — including "never gatekeep when the user asks for a human" |
| [Measuring the UX of AI](https://measuringu.com/measuring-the-ux-of-ai/), [UX metrics in the AI era](https://www.adrenalin.co/insights/measuring-ux), [arXiv: rethinking evaluation metrics](https://arxiv.org/pdf/2605.05600) | SUS/NPS/completion were built for deterministic software; AI UX needs quality-of-output and reliance measures |
| [Session management in AI chat apps](https://thefrontkit.com/blogs/session-management-in-ai-chat-applications), [VS Code agent sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions), [goose sessions](https://goose-docs.ai/docs/guides/sessions/session-management/) | Naming, search, pin, filter, archive, export (JSON and Markdown) as the expected history surface |
| [AI Chat UI best practices for 2026](https://thefrontkit.com/blogs/ai-chat-ui-best-practices), [10 UX patterns](https://dev.to/greedy_reader/ai-chat-ui-best-practices-designing-better-llm-interfaces-18jj) | Cross-check list: streaming with a correct live region, buffered markdown, inline `[n]` citations, tiered feedback, keyboard navigation |

One honest caveat: `Guidelines for Human-AI Interaction` is behind a PDF the fetcher could not parse, and secondary pages paraphrase its 18 titles differently. Quote guideline *numbers and titles* from the ACM page, not from a blog summary. Everything else above was read in this session.

## 3. Evidence: what the code actually does today

All of this was read in this session; Appendix A carries the greps to re-derive each line.

### 3.1 Controls that render without a truth behind them

| Control | Where | What it actually does |
|---|---|---|
| `Search the web` toggle + `Ctrl+Shift+W` + the globe badge | `AskModeExpanded.tsx` local `webSearchEnabled`; passed only into `UnifiedCommandBar` | **Never crosses IPC.** `sendMessage(content, files)` → `chat.sendStreamMessage(content, sessionId, attachmentPaths)`. Whether a web search happens is decided by the AskGraph router, not the user. The toggle is decoration |
| Model chip reading `Qwen` with a caret | `UnifiedCommandBar.tsx`, `hasSent && <span className="model-select-inline">` | Hard-coded string inside an `aria-hidden` span. Not a control, and not the configured model — the real value comes from `process.env.MODEL` in `chat-handlers.ts` |
| `Recent Chats` dropdown (compact Ask mode) | `ChatHistoryDropdown.tsx` default parameter `history` | **Four invented titles** ("Optimize Electron cold start", "React 19 best practices", …) as a default prop; `SearchBar.tsx` never passes `history`. Selecting one calls `onSelect(title)` and only logs |
| Browser/desktop **Pause / Resume** | `handlePauseBrowser` / `handleResumeBrowser` in `AskModeExpanded.tsx` | `dispatch({type:'SET_PAUSED'})` and a log line. There is no pause channel — the grep for `browser.pause|resume` returns nothing. The panel says Paused while the agent keeps running |
| Desktop mode toggle `Ctrl+Shift+D` | `handleToggleDesktopMode` | Local reducer flip plus a log. No IPC. The comment above its effect says desktop events arrive through the chat stream — which is true, but the toggle then controls nothing |
| `Confidence: n%` in the automation panels | `AskModeExpanded.tsx` `metrics={{ …, confidence: Math.max(70, 100 - Math.floor(elapsedMs / 1000)) }}` | Derived from the wall clock. Monotonic decay of a made-up number, rendered as `Confidence: <b>n</b>%` by `BrowserProgressPanel.tsx` |
| `estimatedTokens: Math.floor(elapsedMs / 100)` | same | Tokens from elapsed time |
| Per-step `confidence: 85` | `chat-handlers.ts`, the `reasoning` block in the terminal chunk | A literal. The payload is folded into the message by `useChatSession.ts` (`data.reasoning`) and **never rendered** — `ChatMessage` has no `reasoning` field. So a fabricated number crosses IPC into an object nothing reads |
| `tokensUsed = fullResponse.length / 4`, `inputTokens = 0.3 ×`, `outputTokens = 0.7 ×`, `estimatedCost = tokens × 0.0002 / 1000` | `chat-handlers.ts` metrics block | Character-length arithmetic dressed as accounting, then priced against `MODEL_PRICING` in `utils/costCalculator.ts` and displayed in `Transparency/TaskMetrics.tsx` as a token and cost breakdown |
| `verified` / "Verified" badge | `chat-handlers.ts` sets `verificationSkipped: finalConfidence >= 0.8`; `useChatSession.ts` maps `verified: !data.verificationSkipped` | Inverted presentation: a *high-confidence* answer (which skipped the verify step) is the one that is **not** labelled Verified, while a low-confidence run that did run verification earns the label. Three different scales also coexist for `confidence`: 0–1 from graph state, 85 as a literal percent, and 70–100 from elapsed time |
| `GenerativeUISkeleton` + `GenerativeUIProgress` | `ChatMessageBubble.tsx` `GenerativePayloads`, driven by `uiPayloadPending` / `uiGenerationProgress` / `uiProgressMessage` | The DOX drift list in `src/main/ipc/AGENTS.md` records that main's senders for these were deleted: the fields are read nine times and written by nobody. The skeleton/progress branch is inert |
| `RelatedQuestions` chips | `ChatMessageBubble.tsx`, rendered from `message.relatedQuestions` | No producer. Repo-wide grep for `relatedQuestions:` / `suggestedQuestions` / `follow_up` returns **nothing** outside the type declaration and the render |
| `AgentIndicator` while loading | `ChatMessagesList.tsx` `{isLoading && activeAgent && …}` | `AskModeExpanded.tsx` never passes `activeAgent`, so the default `null` holds and the live agent pill cannot appear — even though `chat:agent-change` is subscribed and folded onto `message.agent` for the finished turn |
| Toasts | `contexts/ToastContext.tsx` (`showToast`), `hooks/useToast.ts` | Mounted by `AskModeExpanded`, zero call sites repo-wide. So "Copy" succeeds in silence: `handleCopy` only calls `logInfo` |
| `ContextUsageIndicator.tsx` | dead file per `src/renderer/AGENTS.md` | The one component that would have told the user how full the context is is unreferenced |

### 3.2 The answer renderer cannot render answers

`ChatMessageBubble.tsx` hand-rolls markdown: `parseMarkdownBlocks` (fences, `#{1,4}` headings, flat bullet/ordered lists, paragraphs) and `renderInlineMarkdownWithCitations` (inline code spans, `[n]` citations, `**bold**`). Package.json carries **no** markdown, sanitiser, highlighter or virtualisation dependency (grep for `react-markdown|markdown-it|marked|remark|rehype|shiki|highlight|dompurify|react-window` → no matches). Consequences a user can see in one answer:

- `[title](https://url)` renders as literal `[title](https://url)` — **links do not work**. Every answer that cites a page in prose shows raw markdown. This is the single most visible defect in the surface.
- No GFM tables, no blockquotes, no italics, no strikethrough, no task lists, no images, no nested lists (the parser flattens indentation), no horizontal rules, no footnote syntax, no math.
- `CodeBlock.tsx` renders `<pre><code>{code}</code></pre>` with a copy button and a language dot. **No syntax highlighting**, no line numbers, no wrap toggle, no horizontal scroll affordance, and the `Apply` button only exists if a caller passes `onApply` — `AssistantAnswer` does not, so it never renders.
- A list item containing a colon-separated sentence is fine, but a numbered list immediately followed by an indented continuation is silently re-flowed into paragraphs.
- The incremental-parse work is real and good (`utils/markdownBlocks.ts` `splitAtSettledBlock`, memoised `SettledMarkdown`, rAF-batched chunk append in `useChatSession.ts`). The problem is the parser's grammar, not the streaming architecture.

### 3.3 Transcript mechanics

- **Regenerate appends.** `handleRegenerate` re-sends the last user message through `handleSendMessage`, so the transcript grows a second copy of the question and both answers. `handleRetry` is identical. There is no in-place replace, no version list ("response 2 of 3"), no branch.
- **No message editing.** `handleEditQuery` and `ArrowUp` on an empty box copy the last user message into the input; submitting it appends. The user's own turns are immutable.
- **The bubble memo comparator is lossy.** `ChatMessageBubble`'s custom equality ignores `relatedQuestions`, `metrics`, `selfCorrected`, `qualityScore`, `iterationsUsed` and `uiPayloads` content (it compares only `uiPayloads?.length`). Anything that arrives in the terminal chunk but did not change a compared field can be skipped — a real class of "it streamed but the panel never appeared" reports, and it will bite every new post-turn surface added below.
- **Scroll**: near-bottom stickiness (`BOTTOM_STICK_PX`) and instant-follow-while-streaming are implemented correctly. What is missing is the **jump-to-bottom pill** when the user has scrolled up while an answer streams, and the transcript has no anchor navigation. There is no `overflow-anchor` handling and no `contain`/`content-visibility` in any ask-mode stylesheet (grep → no matches), and no virtualisation: the whole session renders as live DOM.
- **History chrome inside a conversation** is one `New Chat` button. `messages-header` has no title, no rename, no session search, no export; the only real session list is `RecentChatsInline` on the welcome screen, capped at ten (`sessions.slice(0, 10)` in `AskModeExpanded.tsx`).
- `ChatWelcomeState` renders its four suggestion tiles as raw `<button className="suggestion-card">`, and one of them ("Search the web") advertises the dead toggle from §3.1.

### 3.4 Context and cost are unbounded and unmeasured

- The send-stream handler in `src/main/ipc/chat-handlers.ts` replays `history.messages … .slice(-10)` into every turn, then clamps the array again to `MAX_MESSAGES`. Turn eleven of a conversation silently forgets turns one through ten; nothing in the UI says so. There is no summarisation, no compaction, no context meter, and no pinning of important earlier turns.
- There is **no instrumentation of any kind in the ask path**: no timestamps for turn start, first chunk, chunk cadence, terminal chunk. The root rail already concedes the <500 ms cold-start target is "aspirational, never measured". So every latency claim in §4 has to start with a measurement, not an optimisation.
- `GRAPH_TIMEOUT_MS` and turn cancellation exist and work — stop retains the partial text and ends the turn as completed rather than errored, which is the correct behaviour and worth keeping.

### 3.5 Already good — do not regress

- rAF-batched chunk append; settled/tail markdown split; instant-only follow during streaming; `auto-animate` controller destroyed on cleanup.
- A graded, measured motion/spacing/contrast system with real gates (`docs/design-system-audit.md`), 40 px rows, 32 px target floor, semantic-token colour law, reduced-motion resets.
- Security posture that matters here: every model-authored URL passes `safeExternalUrl` before reaching an `href`; `rel="noopener noreferrer"`; the window denies new windows. Any change to markdown rendering must not widen this.
- `utils/errorClassifier.ts` classifies errors and `ChatErrorBanner` offers retry / edit / new chat; `chat:initialize` returns a `retryable` flag and the renderer only offers "Try again" when main says it can work.
- Turn attribution (`{threadId, sessionId, seq}`), one chat pump, `chat:sessions-changed` push so the renderer never polls, and the ordered bounded quit path.

## 4. INCLUDE — what must be added

Complexity is stated honestly (S/M/L/XL) and no item is deferred for being hard. "Gate" is the check that must go green, per root `AGENTS.md ## Live Verification` and `scripts/harness/AGENTS.md`.

### P0 — Stop lying. Trust floor (S–M each; do these first)

1. **Delete or wire every dead control.** For each item in §3.1 the rule is binary: either the toggle/chip/button drives a real state change that the user can observe, or it is removed. Concretely: remove the hard-coded `Qwen` chip (or replace it with the real `MODEL` value and a working switcher, item 12); remove `ChatHistoryDropdown`'s default fake `history` array and feed it the pushed session list, or remove the control; remove `Confidence: n%` and `estimatedTokens` from the browser/desktop panels, or send real values; delete the inert `GenerativeUISkeleton`/`GenerativeUIProgress` path (this is recorded as open debt in `src/main/ipc/AGENTS.md`); delete `RelatedQuestions` or give it a producer (item 14); pass `activeAgent` so the live pill works or delete the branch. **Gate:** a new grep gate that fails if any ask-mode control's state name has no IPC/props producer — see §8.
2. **Cost and token honesty.** Use the provider's `usage_metadata` on the assistant message when the response carries it; when it does not, label the number "estimated from length" in the UI and keep it out of a currency-formatted total. Remove the fabricated `0.3 / 0.7` split and the `0.0002` price constant unless it is genuinely the model's price. Pattern: **Cost Transparency** and **Running Meters** — a meter is allowed to be an estimate only if it says so. **Gate:** a unit test on the metrics builder asserting that an absent `usage_metadata` never produces a currency string.
3. **Replace confidence with provenance.** The 39-principles finding is blunt: confidence numbers can raise trust in a wrong answer, and the AAAI citation study found trust rose even for *random* citations. So: delete `ConfidenceBadge`'s percentage framing and the inverted `verified` mapping; keep only what is a fact — "used 6 sources", "pixel-verified", "retried after a failed check", "the verify step was skipped". Show the evidence, let the user judge. **Gate:** no user-visible string in ask-mode contains the word confidence unless it is attached to a measured, documented quantity.
4. **Fix `isComposing`.** `useKeyboard.ts` already guards `event.isComposing`; `UnifiedCommandBar.handleKeyDown` does not, so Enter during CJK composition sends a half-converted string — the exact bug still unfixed in a major editor. Guard every keydown that submits, including any future rename box, form preview, MCP modal input and attachment picker. **Gate:** a component test for the textarea: a `keydown` with `isComposing: true` must not call `onSend`.
5. **Give "Copy" a visible consequence** by wiring `showToast` (or an inline "Copied" state like `CodeBlock` already does). Silent success is indistinguishable from failure in a transient overlay window.

### P1 — The answer surface (L–XL; this is where "world class" is actually won)

6. **Real markdown.** Replace the hand-rolled parser with a streaming-aware renderer (Streamdown, or `react-markdown` + `remark-gfm` + a sanitiser plus the same block-memoisation split this repo already has). Requirements it must satisfy at once: GFM tables, working links, nested lists, blockquotes, images, task lists, headings; incomplete syntax at the tail must not flicker or mis-render; parse at reading rate, not per token; **and every link `href` still passes `safeExternalUrl`** — a renderer that emits anchors from model text is a new injection surface in a renderer that holds `command:execute`, so sanitise (`javascript:`/`data:` dropped) *and* keep the allowlist. This is a dependency decision and needs explicit approval (root rail: no new dependency without a request). **Complexity: L. Gate:** fixture transcripts (a table, a nested list, a fence opened mid-stream, a `[x](javascript:…)`, a CJK answer) rendered and asserted; plus a live drive of one streamed answer.
7. **Syntax highlighting and code ergonomics.** Highlighted blocks with a language label, copy that reports success, wrap toggle, horizontal scroll with a shadow cue, long-block collapse, and for repo answers an **Insert at cursor / Open in editor / Copy path** action if a file target is known. The `onApply` prop already exists in `CodeBlock.tsx` and is never passed — that is the seam. **Complexity: M. Gate:** visual check in both themes plus contrast of the token palette (a highlight theme must clear the same 4.5:1 gate).
8. **Citations that are verifiable, not decorative.** Per-claim chips → hover/focus preview card (title, domain, favicon, fetched-at, the exact passage) → an in-panel **Source Browser** with the retrieved text, and a keyboard path to open in the default browser. Never footnote-only (that is the named anti-pattern). Persist the retrieved excerpt with the message so the preview still works after a restart — the persistence layer exists (`sql.js`, `src/main/services/database/AGENTS.md`). **Complexity: XL. Gate:** a citation opened live from a real web answer, and the `javascript:` URL row asserted inert.
9. **Answer layout tuned to the measure.** 45–75 characters per line for prose is the readability band; an 800 px palette minus gutters is at the top of it. Add a real prose rhythm (heading scale already exists), a readable-measure cap that is *used* (`--measure-readable` is applied to `.answer` — verify the computed character count, don't assume), sticky-collapsed Thinking steps, and progressive disclosure for the long tail of an answer: the first block of substance visible, the rest on demand. **Complexity: M. Gate:** `node tmp/live-style.mjs`-style computed read of the live answer's line box, reported in characters not pixels.
10. **Jump-to-bottom pill and transcript anchors.** When the user scrolls up during a stream, show a floating "↓ Latest" pill (the stickiness state already exists in `pinnedToBottomRef`); add a per-turn rail so a long session can be scanned; set `overflow-anchor` deliberately rather than leaving it to the browser. **Complexity: S–M. Gate:** scroll up mid-stream, verify the pill appears, click it, verify the bottom lands and the tween is instant while streaming.
11. **Virtualise or bound the transcript.** A 200-turn session as live DOM with `auto-animate` observing every child is a jank machine. Either virtualise the list or cap rendered turns with "load earlier turns" (history already comes from main). **Complexity: L. Gate:** a scripted 150-message session, measured scroll and first-token paint.

### P2 — Conversation mechanics (M–L)

12. **Model switching that exists.** A real chip from `MODEL`/`FAST_MODEL` via `api-config:*`, a keyboard-openable picker listing available models with a plain speed/quality trade-off (**Model Selection UI**), persisted through `preferences` — remembering `preferences.ts` does a *shallow* merge, so an `llm` write replaces the whole object. **Complexity: M. Gate:** switch model live, answer, verify the transcript's model label and the log agree.
13. **Regenerate in place; edit and resubmit; undo; branch.** Follow the mechanics contract: regenerate replaces the last assistant turn (older versions reachable via "‹ 2/3 ›"); editing a user turn discards everything after it and offers undo; both must be main-side session mutations, so this is new IPC — budget five sites per channel, not four, while `src/renderer/types.d.ts` still wins for the channels it declares. **Complexity: L. Gate:** drive it with real keystrokes and assert the transcript, not the code.
14. **Follow-ups with a producer, feedback with a sink.** Either emit `relatedQuestions` from the graph's terminal node (it already streams structured payloads) or delete the chips. Add tiered feedback — thumbs plus a reason taxonomy, persisted to the existing trajectory/failure tables — with acknowledgement so it does not vanish (**Feedback Loops** anti-pattern). **Complexity: M. Gate:** a stored row readable back from the database.
15. **Session surface worth having.** Real titles (generated from the first turn), rename, pin, delete-with-undo, search over session content in the palette's own fuzzy search, resume-where-you-were after relaunch, and export to Markdown/JSON (the pattern every current agent product ships). All of it reachable from inside a conversation, not only from the welcome screen. **Complexity: L. Gate:** keyboard-only: summon → search a past session → open → continue typing.
16. **Multi-turn context that does not amnesiate by eleven.** Replace `.slice(-10)` with an explicit policy: summarise-and-compact older turns, keep pinned turns verbatim, keep the prompt prefix stable and append-only (the Manus rule; also the precondition for prompt caching), and surface a **context meter** so the user can see the window fill and choose to compact or start fresh. **Complexity: XL, and it is the item most likely to also fix perceived speed** (cached prefixes are reported at large input-cost and latency reductions). **Gate:** a 30-turn scripted conversation where a turn-2 fact is still used at turn 28, plus measured TTFT with and without the cache.

### P3 — The agent surface (M–XL)

17. **Tool-visible trace, not fake reasoning.** Keep `ThinkingSteps` as an *action* log — which tool ran, what it returned, what changed — with a collapsed-by-default detail. Do not paraphrase chain-of-thought; the transport already carries a fabricated `confidence: 85` and renders nothing. Per principle 18, a visible plan lets the user stop a wrong path early: show the plan when the graph has one, and the current step while it runs. **Complexity: M. Gate:** a browser run observed live with the trace expanded once.
18. **Make Pause mean Pause, and Stop mean Stop.** Either add real `browser:pause` / `browser:resume` channels (five sites each) or remove the buttons; `Interrupt and Resume` is the pattern, and "avoid fake continuity" is its named anti-pattern. Cancellation already works end to end for a turn (`chat:cancelTurn`, plus the `abortPiDesktopRun()` in the pump's `finally`) — the gap is only browser/desktop pausing. **Complexity: M. Gate:** pause a live browser session and observe the page stop navigating.
19. **Autonomy, reversibility, checkpoints.** The HITL approval gate was deliberately deleted at the Pi cutover and `docs/diagrams/desktop-hitl.mmd` is historical, so this is a product decision, not a gap: for destructive desktop actions the researched answer is bound autonomy by reversibility (**Autonomy Budgets**, **Per-Action Autonomy**, **Checkpoints and Restore**, **Smart Diff**) — a visible action preview and one-click restore, rather than a yes/no modal. Reintroducing an interrupt needs the payload source decided up front, because the previous implementation read a LangGraph field that is never populated. **Complexity: XL. Gate:** an action previewed, executed, and restored on a real window.
20. **Attachments that behave like context.** Paste/drop an image and get a thumbnail with a progress and failure state; show what was actually read (a 3 MB `.docx` that yielded 400 characters must say so — `services/utils/document-loader.ts` decides that today in silence); a folder chip with a file count; and `@`-mention completion over workspace files so context is typed, not picked through a dialog. The `onAddFile`/`type:'folder'` plumbing and `fileTypeIcons` already exist. **Complexity: L. Gate:** attach a real file, ask about it, verify the answer uses it and the chip shows the parsed size.
21. **Web-search routing that is real.** Decide whether the globe toggles a *requirement* (force web routing) or a *preference*, plumb it through `chat:sendStreamMessage` as a typed field in `src/shared/ipc/` (the shared-types exception to the four-site rule), and reflect the outcome: "no web results" and "web disabled" must not look identical. **Complexity: M. Gate:** toggle on, ask a current-events question, observe `web_search` in the trace; toggle off, observe it absent.

### P4 — The host itself (XL; the honest ceiling)

22. **A long answer does not live well in an always-on-top, frameless, width-locked overlay at 800 px with main owning every pixel of height.** Every item above improves the surface inside that box; the box is the remaining ceiling. The researched comparison is consistent: **Chat Artifacts** puts generated documents, tables, code and dashboards in a dedicated panel because "the thread stays readable", and palettes above ~900 px gain a preview split. Options to evaluate explicitly: (a) an artifact/result panel that widens the window into a second column, (b) a separate, taskbar-eligible conversation window for long sessions, (c) keep the launcher and accept short answers by design. Each collides with a documented invariant — main is the *sole* owner of mode geometry, `--container-*-height` tokens were deleted for exactly that reason, and the width lock is attached per window instance — so this needs a decision, not a patch. **Complexity: XL. Gate:** `harness:selftest` must still pass (it pins the tween and the mode heights) plus a re-derived geometry report from `who`/`state`/`modeSettled`.
23. **Instrument, then optimise.** Emit per-turn timings (request received, first chunk, chunk count, inter-token p50/p95, terminal chunk, cancellation) into the existing logger/database surface, publish TTFT and ITL as the metrics they are, and only then touch cold start. The rail's <500 ms claim must stop being quoted as a result until this exists. **Complexity: M. Gate:** one number, reported from the running app, with the command that produced it.
24. **Accessibility, properly this time.** Silence the transcript's live region while streaming and announce completion once; make the jump-to-bottom pill, source previews, feedback and follow-ups keyboard-reachable; fix the known unfixed defect from `docs/design-system-audit.md` (focus stranded on `<body>` after a dialog closes, which breaks the very next keystroke); add a first real component test since **no test mounts an ask-mode component today**. **Complexity: L. Gate:** drive a whole turn by keyboard and with a screen reader recording; run the audit's ladder again (open → Escape → type → query appears → Escape clears).
25. **Measure reliance, not usage.** Regenerate rate, stop rate, copy rate, citation-open rate, time-to-first-visible-token, error banner rate — the AI-era metric set. Without them, "world class" is a taste claim. **Complexity: M. Gate:** a printed per-session table from the local database.

## 5. EXCLUDE — what must not be in it

- **Any number the system did not measure.** Confidence percentages from elapsed time, tokens from time, 85 as a step confidence, `0.3/0.7` token splits. Also the `📄` emoji `icon` still set in `useFileSearch.ts` — emoji are not a design language and the repo's own icon system exists.
- **The raw-JSON fallback as a user-visible outcome.** `GenerativeUI`'s JSON branch is a developer panic path; if a payload cannot render, say so in one line and offer the source, per **Failure Disclosure**.
- **A progress meter for something nobody reports.** The generative-UI skeleton/progress path is fabricated-by-omission: delete it rather than invent a fake percentage.
- **Re-introducing the HITL confirm modal** without first deciding where the paused-turn payload comes from (the old implementation read a field LangGraph never populates).
- **Paraphrased chain-of-thought** as "reasoning shown to the user". Show actions and evidence.
- **Personality theatrics that imply a mind**: no typing "personality", no confetti on completion, no "I feel / I think", no apology loops. NN/g's transparency dimension and principle 9 both say represent the AI's nature honestly.
- **Proactive interruptions inside a launcher** (principle 22: time interventions to attention). The palette is summoned; it should not volunteer.
- **Product scope that belongs to someone else**: voice mode, image generation, shared session links, live presence, collaborative comment threads, commerce patterns, mobile/viewport breakpoints (the audit already recorded that breakpoints would invent a requirement the product does not have), and a browser-embedded webview inside the palette.
- **Structural violations of the DOX:** no IPC inside `src/renderer/components/ask-mode/`, no new stylesheet, no raw pixel/OKLCH literals, no `dark:` sprinkles, no second owner of window height, no patching `components/ui/` primitives, no `AbortController` in the renderer tree. If an item above appears to need one, the item is specified wrong.

## 6. UPDATE — repairs to existing surfaces

1. `ChatMessageBubble`'s memo comparator: compare the fields the UI actually renders (`metrics`, `relatedQuestions`, `selfCorrected`, `qualityScore`, `iterationsUsed`, payload content identity), or drop the custom comparator and use field-level `React.memo` on the sub-views. Silent non-update is worse than a re-render.
2. `SourcesPanel`: show domain + favicon and the access timestamp; stop appending a literal `...` to an excerpt shorter than the cap; make the panel's collapsed state a real affordance (it is a `<details>` — give it a count-driven label that reads like a result, not a debug line).
3. `ChatWelcomeState`: replace raw `<button className="suggestion-card">` with `ui/Button` composition like the rest of the folder; make the tiles reflect what the product can actually do *now* (drop "Search the web" until item 21 lands); keep the "From Your Search" chips — that is the one genuinely good idea in the empty state, and it is real (`CommandPaletteBody.tsx` feeds it).
4. `UnifiedCommandBar`: send-intent clarity (Enter sends, Shift+Enter newline — show it, don't assume it); attachments visible in expanded mode *while* a reply is being typed; stop hiding the context chips row behind `hasSent` logic that also hides the web toggle.
5. `handleExplain` / `handleShowCode`: the `content.slice(0, 200)` truncation silently changes the ask. Either operate on a selected text range (real text selection in the transcript is the missing primitive) or send the whole block being referred to.
6. `messages-header`: put the session title, history control, model chip and context meter here; it currently carries one `New Chat` button while every other surface in ask-mode is scrolled past.
7. Rename `ask-mode-perplexity.css` or split it by the sections it actually holds — a 2999-line file named after a competitor's product is a maintenance smell, and the dual-styling law means every new class must land in one of two files.

## 7. Sequencing

- **Slice A (a day or two, no dependency):** §4 items 1–5 + §6 items 1, 4, 6. The surface stops lying. Everything else is measured against this baseline.
- **Slice B (the answer itself):** 6, 7, 9, 10 — markdown, highlighting, prose measure, jump-to-bottom. This is the biggest perceptual jump per unit of work.
- **Slice C (trust):** 8, 17, 21 — citations with provenance, action-visible trace, real web routing.
- **Slice D (mechanics):** 12, 13, 14, 15, 20 — model switch, regenerate/edit/undo, feedback, sessions, attachments.
- **Slice E (the machine):** 16, 18, 22, 23, 24, 25 — context policy and caching, real pause, the host geometry decision, instrumentation, a11y, metrics.
Do not start E before A: measuring an experience whose controls lie produces numbers about the lies.

## 8. Gates and how to prove any of this

Existing gates apply unchanged: `npm run typecheck`, `npm run lint` (the 44-warning baseline must not grow), `npm run test`, `npm run harness:preflight` + `npm run harness:selftest` (16 steps, must stay 16/16 after any window/palette/hook/tween change), `node tmp/token-refs.mjs`, `node tmp/motion-tokens-check.mjs`, `node tmp/contrast-full.mjs --strict`, and `scripts/capture-ui.mjs` to regenerate `docs/assets/screenshots/` after any UI change.

New gates this research implies (each exists because a defect class already shipped):

- **Producer gate:** for every `useState`/prop that renders a control in ask-mode, a test asserting a producer writes it. The same shape as the existing logger-registry and node-registry gates, which is how the repo already proves "cannot silently drift". This is the one that prevents §3.1 from regrowing.
- **Rendered-markdown fixtures:** a corpus with a table, nested list, unterminated fence, `[x](javascript:alert(1))`, and a CJK paragraph; assertions are character-level and include "the javascript: anchor does not exist".
- **IME test:** composing + Enter must not send.
- **Metrics-honesty test:** no currency string without measured usage.
- **Component tests for the transcript:** the first `*.test.tsx` under `ask-mode/` needs no config change (`vitest.config.ts` already has jsdom, the `.tsx` include and the `@/` alias).
- **Live drive, reported in observed numbers:** summon → ask → watch first visible token → scroll up mid-stream → pill → cite → open source → stop → regenerate → edit → copy → close a dialog and type immediately. Report heights, frame counts, `hidden`, row counts and timings — not what the code should do.

## 9. Constraints a roadmap item will collide with (so nobody is surprised)

- **Geometry:** main owns mode height; the renderer must not gain a `transition-[height]`, `min-h-[…]` or a mirrored height token. Any artifact panel/side column is a `MODE_CONFIGS` change plus a `windowManager` sizing path, and `harness/driver.mjs` `MODE_HEIGHTS` (compact 74, expanded 603) is a measured contract that would move.
- **IPC:** a new channel is four sites, five while `src/renderer/types.d.ts` declares it. Shared payload types go in `src/shared/ipc/`.
- **Ask-mode styling:** a new BEM class must be added to `globals.css` or `ask-mode-perplexity.css` in the same change that references it, or it renders as raw left-aligned text — the documented failure that produced unstyled loading states once already.
- **Resources:** anything new that acquires a process, handle, timer or subscription registers its disposer in the same change (`lifecycle.ts`, `buildShutdownSteps`), and renderer timers need the `isMountedRef` idiom.
- **Docs:** `docs/desktop-agent-gap-analysis.md` is a roadmap and `docs/design-system-audit.md` is history; neither is current-behaviour authority. This file is roadmap too.

## Appendix A — re-derive these claims

```bash
# dead controls / fabricated state
grep -rn "webSearchEnabled" src/renderer src/main                      # renderer-only; no main consumer
grep -rn "Math.max(70, 100 -" src/renderer/components/AskModeExpanded.tsx
grep -rn "confidence: 85" src/main/ipc/chat-handlers.ts
grep -rn "estimatedTokens: Math.floor(elapsedMs" src/renderer/components/AskModeExpanded.tsx
grep -rn "Optimize Electron cold start" src/renderer                 # fake default history
grep -rn "showToast" src/renderer --include=*.tsx --include=*.ts     # provider definition + useToast docstring; zero call sites
grep -rn "relatedQuestions" src/main                                 # empty: no producer exists
grep -rn "Optimize Electron cold start" src/renderer                  # ChatHistoryDropdown default + dead data/mockAskData.ts
# streaming / input / layout gaps
grep -rn "isComposing" src/renderer                                  # useKeyboard only, not the ask input
grep -rn "overflow-anchor\|content-visibility\|contain:" src/renderer/styles
grep -E "react-markdown|markdown-it|remark|rehype|shiki|dompurify|react-window|virtua" package.json   # empty
grep -rn "slice(-10)\|MAX_MESSAGES" src/main/ipc/chat-handlers.ts
grep -rn "activeAgent" src/renderer/components                          # declared, never passed
# counts cited in §3
grep -cE "^\s*name: '[a-z_]+'" src/main/services/pi/toolbox.ts         # 32 desktop tools
grep -rn "window.electronAPI" src/renderer/components/ask-mode          # empty by contract
```

## Appendix B — decisions needed from the owner before implementation

1. New dependency for markdown/highlighting (item 6/7) — yes/no, and which.
2. §4 item 22: does ask-mode stay a launcher answer surface, or does it get a second column / conversation window? This bounds every other layout decision.
3. Is the web-search toggle a requirement or a preference (item 21), and should `ChatWelcomeState` keep advertising it?
4. Autonomy posture: preview-and-restore (researched) versus the deleted confirm modal (item 19).
5. Whether `verified`/pixel-verification is user-visible at all, and on what condition (item 3).
6. Time budget for item 16 (context policy + caching) — it is the largest single engineering item and the only one that changes both quality *and* latency.

## Appendix C — related records

`docs/design-system-audit.md` (history — the visual/interaction half, already fixed and measured), `docs/desktop-agent-gap-analysis.md` (roadmap — the agent capability half), `docs/architecture.md` (live — the runtime and IPC surface), `docs/windows-ui-harness.md` (live — how to drive this UI with real input), `src/renderer/components/ask-mode/AGENTS.md` (contract — how to change this folder without breaking it).
