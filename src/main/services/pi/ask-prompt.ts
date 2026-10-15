/**
 * The Ask-mode system prompt. **This text is the router.**
 *
 * `langgraph/research-agent.ts` had `classifyNode` (an LLM call into one of five intents),
 * `routeAfterClassify` (three conditional edges), a complexity score, and a
 * `detectFastPath` regex gate — roughly 300 lines whose only job was deciding which
 * subgraph to enter. All of that is gone. The model is given one prompt describing every
 * capability it has, and Pi's loop lets it call whichever tool the request needs. That
 * trade is the whole point of the migration: a classifier that is wrong is a turn routed
 * to the wrong agent, and there is no longer a classifier to be wrong.
 *
 * What the prompt therefore owes the model:
 *  - a description of every capability family, so it can pick one;
 *  - the desktop tool-priority order **composed** from `prompt.ts` rather than restated,
 *    because that order is a stated contract with `toolbox.ts`;
 *  - explicit instructions for the generative-UI tools, which are how structured results
 *    are produced now that `withStructuredOutput(..., jsonMode)` is gone — a tool's
 *    `parameters` schema *is* the structured output.
 */
import { screen } from "electron";

import { desktopPromptSections } from "./prompt";
import { buildBrowserSkillSection } from "../browser/browser-skill-loader";
import type { ToolFamily } from "./families";

/**
 * One entry per family the agent can reach. A family with no tools bound is dropped
 * rather than advertised, so the prompt never tells the model about a capability that is
 * not in the toolbox — the cheapest possible guard against a hallucinated tool call, and
 * the replacement for the `RESPONSE_NODE_SET` whitelist's actual job.
 */
const FAMILY_GUIDANCE: Record<ToolFamily, string> = {
  desktop: `DESKTOP AUTOMATION (tools: screenshot, search_elements, invoke_element, click, type_text, key_combo, launch_app, execute_command, file_operations, clipboard, and more).
Use for anything on the Windows machine: opening and driving apps, reading the screen, keyboard and mouse work, file and shell operations. There is NO confirmation step — every tool runs immediately, so only take actions the user actually asked for.`,
  browser: `WEB BROWSER AUTOMATION (tools prefixed browser_, e.g. browser_navigate, browser_click, browser_snapshot, browser_type).
Use for driving a real Chromium session: filling forms, clicking through flows, reading rendered pages that need JavaScript. Prefer these over fetch_page when the page requires interaction or the content is behind a login.`,
  document: `DOCUMENT GENERATION (tools: create_docx, create_pptx, create_xlsx, read_document, modify_document).
Use when the deliverable is a real office file on disk. Each tool writes an actual .docx/.pptx/.xlsx and verifies it by re-parsing, so pass real content — do not describe the document, create it. Files are written to the user's Documents folder.`,
  web: `WEB RESEARCH (tools: search_web, fetch_page).
search_web ranks live results; fetch_page reads one page and returns its text. For any question about current events, documentation, prices, or anything after your training cutoff, search first and cite what you actually read. Prefer reading the page over answering from snippets.`,
  ui: `STRUCTURED OUTPUT (tools: create_table, create_comparison, create_form, create_chart, create_list).
Call these when the answer has a shape: several comparable rows (table), two or more options against shared criteria (comparison), fields a user needs to fill in (form), numeric series over categories (chart), or a plain ordered set (list). Each one renders as an interactive component above the transcript. Exactly what you pass to the tool is what renders — validate every value yourself, because there is no schema check between you and the screen. Call the tool rather than writing the data out as prose or as a markdown table.`,
  mcp: `CONNECTED MCP TOOLS.
Servers configured in mcp-config.json contribute extra tools. Their descriptions say what they do. Use them when they fit the request.`,
};

/** Answer shape. The renderer's transcript is markdown plus the UI components above. */
const answering = `ANSWERING RULES:
- Answer the user's question directly. If you can answer from your own knowledge and the question is not time-sensitive, do so without searching.
- You may combine capabilities in one turn: search the web for facts, then write them into a document; drive the browser to log in, then read a page.
- Never describe an action you did not take. If a tool failed, say so.
- Use the structured-output tools instead of writing data as prose when a shape above fits the answer.`;

const closingAsk = `There is no separate "research" or "browse" mode you must enter first — decide from the request and call the right tool. Do not ask the user which mode to use unless the request is genuinely ambiguous.`;

/**
 * Build the prompt for the families actually bound this turn.
 *
 * `toolExecution` is sequential, so the model sees one tool result at a time; the
 * priority order below is therefore an instruction about *which* tool, not about batching.
 */
export function buildAskSystemPrompt(sessionId: string, bound: readonly ToolFamily[] = [], query = ""): string {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const sections = [
    `You are Qyther's assistant, running inside a Windows command palette. You can see the desktop, drive a browser, search and read the web, create real office documents, and render structured results — all in one turn, using the tools you are given.`,
    // Desktop sections come from `prompt.ts` so the tool-priority order cannot drift.
    ...desktopPromptSections({ screenWidth: width, screenHeight: height, sessionId, hasScreenshot: false }),
  ];

  // Only advertise a family whose toolbox is non-empty.
  for (const family of bound) {
    const guidance = FAMILY_GUIDANCE[family];
    if (guidance) sections.push(guidance);
  }

  sections.push(answering, closingAsk, `Current session: ${sessionId}`);

  /**
   * On-disk `SKILL.md` material, matched against this turn's query. This replaces the
   * browser subgraph's `skillRouter` → `loadSkills` pair, which loaded them as graph state
   * before the planner ran. Same material, read at the point it is useful, and it only
   * reaches the prompt when it matches something.
   */
  const skills = bound.includes("browser") ? buildBrowserSkillSection(query) : "";
  if (skills) sections.push(`SKILLS RELEVANT TO THIS REQUEST:\n${skills}`);

  return sections.join("\n\n");
}