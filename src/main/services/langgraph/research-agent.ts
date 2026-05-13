import { StateGraph, END, MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { AskState, AskStateType, Source, ReasoningStep, UIPayload } from "./state";
import { webSearchTool } from "./tools";
import { z } from "zod";
import { executeBrowserSubgraph } from "../browser/browser-subgraph";
import { executeDesktopSubgraph } from "../desktop/desktop-subgraph";
import { executeDocumentSubgraph } from "../document/document-subgraph";
import { createLogger, withTiming } from "../../utils/logger";
import { mcpService } from "../mcp/client";
import { getMCPToolsForIntent, detectRelevantTools } from "../mcp/tool-router";

const log = createLogger("Graph");

const chatModel = new ChatOpenAI({
  model: process.env.MODEL || "qwen3.6-plus",
  apiKey: process.env.API_KEY,
  configuration: {
    baseURL: process.env.BASE_URL,
  },
  temperature: 0.7,
  streaming: true,
});

// Cheap, fast model for classification/routing only
const routerModel = new ChatOpenAI({
  model: process.env.FAST_MODEL || process.env.MODEL || "qwen3.6-plus",
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
  temperature: 0,
  maxTokens: 10,
  streaming: false,
});

// Dedicated model for query rewriting — needs more tokens than routerModel (10) for complex rewrites
const rewriteModel = new ChatOpenAI({
  model: process.env.FAST_MODEL || process.env.MODEL || "qwen3.6-plus",
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
  temperature: 0,
  maxTokens: 100,
  streaming: false,
});

// Lightweight heuristic to detect queries that can use fast-path (no LLM needed)
const FAST_PATTERNS = {
  greeting: /^\s*(hi|hello|hey|greetings|howdy|sup|yo|hola|what'?s? up|good\s*(morning|afternoon|evening)|g'day)\s*$/i,
  thanks: /^\s*(thanks?|thank\s*you|ty|thx|cheers|appreciate\s*it)\s*$/i,
  acknowledgement: /^\s*(ok|okay|sure|yep|yeah|yup|nope|nah|no|got\s*it|alright|cool)\s*$/i,
  farewell: /^\s*(bye|goodbye|see\s*you|cya|later|take\s*care)\s*$/i,
  date: /\b(what('?s| is)?\s+(today('?s| is)?\s+)?(the\s+)?date|today('?s| is)?\s+(the\s+)?date|current\s+date|what\s+day|day\s+of\s+week|what\s+day\s+is\s+it)\b/i,
  time: /\b(what('?s| is)?\s+(the\s+)?time|current\s+time|what\s+time|tell\s+me\s+the\s+time)\b/i,
};

const FAST_RESPONSES: Record<string, string> = {
  greeting: "Hey! How can I help you today?",
  thanks: "You're welcome! Let me know if you need anything else.",
  acknowledgement: "Got it! What would you like to do next?",
  farewell: "Goodbye! Feel free to come back anytime.",
  date: "__DYNAMIC__",
  time: "__DYNAMIC__",
};

function getFastPathResponse(type: string): string {
  if (type === "date") {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    return `Today is **${dateStr}**.\n\nThe current day of the week is ${dayOfWeek}.`;
  }
  if (type === "time") {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `The current time is **${timeStr}**.`;
  }
  return FAST_RESPONSES[type] || "";
}

function detectFastPath(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return null;

  // Check for date/time queries first — these need to work even with question marks
  if (FAST_PATTERNS.date.test(trimmed)) return 'date';
  if (FAST_PATTERNS.time.test(trimmed)) return 'time';

  // For other fast paths, reject if it has a question mark
  if (/[?]/.test(trimmed)) return null;

  for (const [type, pattern] of Object.entries(FAST_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return type;
    }
  }

  return null;
}

function assessComplexity(query: string): "simple" | "medium" | "complex" {
  const trimmed = query.trim();

  if (trimmed.length < 30 && !/\?/.test(trimmed)) return "simple";
  if (trimmed.length < 100 && trimmed.split(/\s+/).length < 15) return "medium";
  if (trimmed.length > 300 || /```/.test(trimmed) || /\b(compare|analyze|explain\s+in\s+depth|step\s*by\s*step)\b/i.test(trimmed)) return "complex";

  return "medium";
}

const MAX_RETRIES = 2;
const CONFIDENCE_HIGH = 0.8;
const CONFIDENCE_MEDIUM = 0.5;
const MAX_STATE_MESSAGES = 20;

// Defensive slice for state.messages to prevent context window overflow
function safeMessages(state: AskStateType): AskStateType['messages'] {
  return state.messages.slice(-MAX_STATE_MESSAGES);
}

// === STRUCTURED OUTPUT SCHEMAS FOR GENERATIVE UI ===

const attributePairSchema = z.object({
  key: z.string().describe("Attribute name (e.g., 'Performance', 'Cost')"),
  value: z.string().describe("Attribute value (concise, 1-3 words)"),
});

const comparisonItemSchema = z.object({
  name: z.string().describe("Name of the item being compared"),
  attributes: z.array(attributePairSchema).describe("List of attribute key-value pairs for this item"),
});

const comparisonCriteriaSchema = z.object({
  key: z.string().describe("Attribute key that matches items[].attributes[].key"),
  label: z.string().describe("Human-readable label for display"),
});

const comparisonOutputSchema = z.object({
  title: z.string().optional().describe("Short title for the comparison table (e.g., 'Apples vs Oranges')"),
  criteria: z.array(comparisonCriteriaSchema).describe("List of comparison criteria/columns"),
  items: z.array(comparisonItemSchema).describe("Items being compared with their attributes"),
});

const formFieldSchema = z.object({
  name: z.string().describe("Field key name (e.g., 'apiEndpoint', 'logLevel')"),
  label: z.string().describe("Human-readable label for display"),
  type: z.enum(["text", "email", "number", "textarea", "select", "checkbox"]).describe("Input type"),
  value: z.union([z.string(), z.number(), z.boolean()]).describe("Default or pre-filled value"),
  options: z.array(z.string()).optional().describe("Options for select fields"),
  required: z.boolean().optional().describe("Whether the field is required"),
});

const formOutputSchema = z.object({
  title: z.string().optional().describe("Short title for the form (e.g., 'Deployment Configuration')"),
  targetUrl: z.string().optional().describe("File path or URL where form data will be saved"),
  fields: z.array(formFieldSchema).describe("Form fields to render"),
});

const chartDataPointSchema = z.object({
  name: z.string().describe("Label for x-axis or pie slice"),
  value: z.number().describe("Numeric value"),
  category: z.string().optional().describe("Optional category for grouped/stacked charts"),
});

const chartOutputSchema = z.object({
  title: z.string().optional().describe("Short title for the chart"),
  chartType: z.enum(["bar", "line", "area", "pie"]).describe("Chart visualization type"),
  description: z.string().optional().describe("Short explanation of what the chart shows"),
  data: z.array(chartDataPointSchema).describe("Data points to visualize"),
  xKey: z.string().optional().default("name"),
  yKey: z.string().optional().default("value"),
});

// LangGraph compiled graph
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGraph: any = null;
let cachedGraphEnvKey: string | null = null;

function getGraphEnvCacheKey(): string {
  return [
    process.env.MODEL || "qwen3.6-plus",
    process.env.FAST_MODEL || "",
    process.env.BASE_URL || "",
    process.env.API_KEY ? process.env.API_KEY.slice(0, 8) : "",
  ].join("|");
}

export function clearGraphCache(): void {
  cachedGraph = null;
  cachedGraphEnvKey = null;
}

// === MCP TOOL INTEGRATION ===

function getMCPModelForIntent(intent: string, query: string) {
  if (!mcpService.isInitialized() || mcpService.getTools().length === 0) {
    return chatModel;
  }

  // Get tools by intent
  const intentTools = getMCPToolsForIntent(intent, mcpService.getTools());

  // Also get tools by query keyword detection
  const keywordPrefixes = detectRelevantTools(query);
  const keywordTools = mcpService.getTools().filter(tool => {
    const name = tool.name ?? "";
    return keywordPrefixes.some(p =>
      name.startsWith(p) || name.includes(p.replace("_", "-")) || name.includes(p.replace("-", "_"))
    );
  });

  // Merge and deduplicate tools
  const allTools = [...intentTools, ...keywordTools].filter(
    (tool, i, arr) => arr.findIndex(t => t.name === tool.name) === i
  );

  if (allTools.length === 0) {
    return chatModel;
  }

  return chatModel.bindTools(allTools as any);
}

export async function getAskGraph() {
  const envKey = getGraphEnvCacheKey();
  if (cachedGraph && cachedGraphEnvKey === envKey) return cachedGraph;

  if (cachedGraphEnvKey && cachedGraphEnvKey !== envKey) {
    log.debug("Graph cache invalidated: env vars changed");
  }
  cachedGraphEnvKey = envKey;

  const compileStart = Date.now();

  const checkpointer = new MemorySaver();

  const workflow = new StateGraph(AskState)
    .addNode("classify", classifyNode)
    .addNode("browserSubgraph", browserSubgraphNode)
    .addNode("desktopSubgraph", desktopSubgraphNode)
    .addNode("documentSubgraph", documentSubgraphNode)
    .addNode("postProcessNode", postProcessNode)
    .addEdge("__start__", "classify")
    .addConditionalEdges("classify", routeAfterClassify, {
      browser: "browserSubgraph",
      desktop: "desktopSubgraph",
      document: "documentSubgraph",
    })
    .addEdge("browserSubgraph", "postProcessNode")
    .addEdge("desktopSubgraph", "postProcessNode")
    .addEdge("documentSubgraph", "postProcessNode")
    .addEdge("postProcessNode", END);

  cachedGraph = workflow.compile({ checkpointer });

  const compileMs = Date.now() - compileStart;
  log.info(`Compilation complete in ${compileMs}ms`);
  if (compileMs > 5000) {
    log.warn(`Slow compilation detected: ${compileMs}ms`);
  }

  log.debug("Compiled workflow with nodes:", Object.keys(workflow.nodes).join(", "));

  return cachedGraph;
}

// === CLASSIFICATION NODE (replaces quickRoute + classifyIntent) ===

function isContextualFollowup(query: string): boolean {
  const contextualPatterns = [
    /\b(add|append|include|show|give|display|put|insert|add more|add some)\b.*\b(this|these|that|those|it|them)\b/i,
    /\b(this|these|that|those|it)\b.*\b(add|append|include|show|give|display|put|insert|more|niche|also)\b/i,
    /\b(also|too|as well|more|additional|extra|niche|moreover|furthermore)\b/i,
    /\b(change|update|modify|fix|adjust|improve|make)\b.*\b(this|that|it)\b/i,
    /^\s*(yes|yeah|yep|sure|ok|okay|do it|go ahead)\s*$/i,
    /\b(what about|how about|and\s+\w+)\s*/i,
    /\b(exclude|remove|filter\s*out)\b.*\b(this|that|those)\b/i,
    // Format/presentation followups: "show in graphs", "show as table", "make it a chart"
    /\b(show|display|render|format|convert)\b.*\b(in|as|into|to)\b/i,
    /\b(make|turn)\b.*\b(into|a)\b.*\b(graph|chart|table|list|pie|bar)\b/i,
  ];
  return contextualPatterns.some(p => p.test(query));
}

async function classifyNode(state: AskStateType): Promise<Partial<AskStateType>> {
  log.debug("Query:", state.userQuery);
  log.debug("Previous intent:", state.previousIntent);
  log.debug("Message count:", state.messages.length);

  const fastPath = detectFastPath(state.userQuery);
  if (fastPath) {
    log.debug("Fast-path detected:", fastPath);
    const complexity = assessComplexity(state.userQuery);
    const reasoningStep: ReasoningStep = {
      step: "classify",
      status: "completed",
      detail: `Fast-path: ${fastPath}`,
    };
    return { intent: "general", complexityScore: complexity, reasoningSteps: [reasoningStep] };
  }

  const complexity = assessComplexity(state.userQuery);
  log.debug("Heuristic complexity:", complexity);

  const followup = isContextualFollowup(state.userQuery);
  log.debug("Contextual followup detected:", followup);

  return withTiming(log, "classify", async () => {
    const messages = safeMessages(state);
    const recentHistory = messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-4)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 300)}`)
      .join("\n");

    let classificationPrompt: SystemMessage;

    if (followup && messages.length > 1) {
      classificationPrompt = new SystemMessage(`You are an intent and complexity classifier. Classify the user's query.

This is a CONTEXTUAL FOLLOWUP — the user is referring to previous conversation content. Use the conversation history to understand what "this/that/it/them" refers to, then classify the intent based on the original topic.

CRITICAL: If this is a followup to a chart/visualization request, classify as "research" (the chart node will be reached via keyword detection in routing).
If this is a followup to a comparison, form, browser, desktop, or document request, preserve the previous intent.

Intents:
- research: Requires current facts, news, or information not reliably in training data
- general: Conversational, creative writing, or training-data knowledge
- browser: Requires interactive web page navigation
- desktop: Requires interaction with the desktop, opening applications, clicking/typing on screen, or system operations
- document: Requires creating, editing, or managing documents (Word, PowerPoint, Excel, PDF) — reports, presentations, spreadsheets, proposals

Complexity:
- simple: Short, single-concept queries (<30 chars, no question marks)
- medium: Standard questions with clear scope
- complex: Multi-part questions, code blocks, analysis requests, or 300+ chars

Previous intent: ${state.previousIntent}

Conversation History:
${recentHistory}

Return ONLY: intent/complexity (e.g., "research/complex" or "general/simple")`);
    } else {
      classificationPrompt = new SystemMessage(`You are an intent and complexity classifier. Classify the user's query:

Intents:
- research: Requires current facts, news, or information not reliably in training data
- general: Conversational, creative writing, or training-data knowledge
- browser: Requires interactive web page navigation
- desktop: Requires interaction with the desktop, opening applications, clicking/typing on screen, or system operations
- document: Requires creating, editing, or managing documents (Word, PowerPoint, Excel, PDF) — reports, presentations, spreadsheets, proposals

Complexity:
- simple: Short, single-concept queries (<30 chars, no question marks)
- medium: Standard questions with clear scope
- complex: Multi-part questions, code blocks, analysis requests, or 300+ chars

Return ONLY: intent/complexity (e.g., "research/complex" or "general/simple")`);
    }

    const messagesToClassify: (SystemMessage | HumanMessage)[] = [classificationPrompt];
    if (followup && messages.length > 1) {
      messagesToClassify.push(
        new HumanMessage(`Conversation context:\n${recentHistory}\n\nCurrent query: ${state.userQuery}`)
      );
    } else {
      messagesToClassify.push(new HumanMessage(state.userQuery));
    }

    const response = await routerModel.invoke(messagesToClassify);

    const content = (response.content as string).toLowerCase().trim();
    log.debug("Raw model output:", content);

    const [rawIntent, rawComplexity] = content.split("/");

    const validIntents = ["research", "general", "browser", "desktop", "document"];
    const intent = validIntents.includes(rawIntent) ? rawIntent : "general";
    const validComplexity = ["simple", "medium", "complex"];
    const complexityScore = validComplexity.includes(rawComplexity) ? rawComplexity : assessComplexity(state.userQuery);

    if (!validIntents.includes(rawIntent)) {
      log.debug("Invalid intent fallback:", rawIntent, "→ general");
    }
    if (!validComplexity.includes(rawComplexity)) {
      log.debug("Invalid complexity fallback:", rawComplexity, "→", complexityScore);
    }

    const reasoningStep: ReasoningStep = {
      step: "classify",
      status: "completed",
      detail: `Intent: ${intent}, Complexity: ${complexityScore}${followup ? " (contextual followup)" : ""}`,
    };

    log.debug("Final classification:", { intent, complexityScore, followup });

    return {
      intent,
      complexityScore,
      previousIntent: intent,
      reasoningSteps: [reasoningStep],
    };
  });
}

// === ROUTER: classify → next node ===

function routeAfterClassify(state: AskStateType): "browser" | "desktop" | "document" {
  const { intent } = state;

  // Route ALL queries through 3 subgraphs only
  if (intent === "desktop") {
    return "desktop";
  }
  if (intent === "document") {
    return "document";
  }
  // All other intents (research, general, browser) go through browserSubgraph
  return "browser";
}

// Resolve anaphora in followup queries by rewriting against conversation history
async function rewriteQueryWithContext(state: AskStateType): Promise<string> {
  const messages = safeMessages(state);
  if (messages.length <= 1) return state.userQuery;

  const recentHistory = messages
    .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
    .slice(-6)
    .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 400)}`)
    .join("\n");

  const rewrittenPrompt = new SystemMessage(`You are a query rewriter for a search system. The user's query contains pronouns or references ("this", "that", "it", "them", "those") that refer to earlier conversation content. Rewrite the query into a standalone, self-contained search query that resolves all references.

CRITICAL:
- Return ONLY the rewritten query, nothing else
- Preserve the user's core intent
- Make the query specific and search-friendly
- If the query is already standalone, return it unchanged

Conversation History:
${recentHistory}

Current query: ${state.userQuery}

Rewritten query:`);

  try {
    const response = await rewriteModel.invoke([rewrittenPrompt]);
    const rewritten = (response.content as string).trim();
    log.debug("Query rewritten:", state.userQuery, "→", rewritten);
    return rewritten || state.userQuery;
  } catch (error) {
    log.warn("Query rewrite failed, using original:", error);
    return state.userQuery;
  }
}

// === BROWSER SUBGRAPH NODE ===
// Smart wrapper: handles fast-path, comparison, form, chart, external search, internal knowledge, general chat inline.
// Only delegates to executeBrowserSubgraph for actual browser intent.

async function browserSubgraphNode(state: AskStateType): Promise<Partial<AskStateType>> {
  return withTiming(log, "browserSubgraph", async () => {
    // 1. Fast-path (greeting/date/time)
    const fastPath = detectFastPath(state.userQuery);
    if (fastPath) {
      const response = getFastPathResponse(fastPath);
      log.debug("Fast-path:", fastPath);
      return {
        finalResponse: response,
        confidence: 1.0,
        reasoningSteps: [{ step: "browserSubgraph", status: "completed", detail: `Fast-path: ${fastPath}` }],
        uiPayloads: [],
      };
    }

    // 2. Comparison queries
    if (/\b(compare|vs\.?|versus|difference\s+between)\b/i.test(state.userQuery)) {
      return comparisonNode(state);
    }

    // 3. Form queries
    if (/\b(generate\s+(a|the)?\s*(form|config|configuration|settings)|create\s+(a|the)?\s*(form|config|configuration|settings))\b/i.test(state.userQuery)) {
      return formNode(state);
    }

    // 4. Chart queries
    if (/\b(chart|graph|visuali[sz]e|plot|show.*data|show.*graph|bar chart|line chart|pie chart)\b/i.test(state.userQuery)) {
      return chartNode(state);
    }

    // 5. External search (research intent with medium/complex complexity)
    if (state.intent === "research" && (state.complexityScore === "medium" || state.complexityScore === "complex")) {
      return externalSearchNode(state);
    }

    // 6. Internal knowledge (research intent, simple complexity)
    if (state.intent === "research" && state.complexityScore === "simple") {
      return internalKnowledgeNode(state);
    }

    // 7. General/internal queries (fallback)
    if (state.intent === "general") {
      return generalChatNode(state);
    }

    // 8. Browser automation (actual browser intent)
    log.info(`[BrowserSubgraph] Starting browser automation: "${state.userQuery.substring(0, 120)}${state.userQuery.length > 120 ? '...' : ''}"`);

    const inProgressStep: ReasoningStep = {
      step: "browserSubgraph",
      status: "in_progress",
      detail: "Initializing hierarchical browser subgraph (memory -> skillRouter -> planner -> executor -> verifier -> store)",
    };

    const nodeStart = Date.now();
    const sessionId = `browser-${Date.now()}`;

    const recentHistory = state.messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-4)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 400)}`)
      .join("\n");

    const taskWithHistory = state.messages.length > 1
      ? `CONVERSATION CONTEXT (for reference):\n${recentHistory}\n\nTASK: ${state.userQuery}`
      : state.userQuery;

    let fullResponse = "";
    let actions: Array<{ type: string; description: string; success: boolean }> = [];
    let executionTrace: Array<{ node: string; durationMs: number; inputSummary: string; outputSummary: string }> = [];
    let browserResult: Awaited<ReturnType<typeof executeBrowserSubgraph>> | null = null;

    try {
      browserResult = await executeBrowserSubgraph(taskWithHistory, sessionId);
      fullResponse = browserResult.finalResponse;
      actions = browserResult.actions;
      executionTrace = browserResult.executionTrace;
    } catch (err) {
      log.error(`[BrowserSubgraph] [${sessionId}] Subgraph error after ${Date.now() - nodeStart}ms:`, err instanceof Error ? err.message : 'Unknown error');
      fullResponse = `Browser automation failed: ${err instanceof Error ? err.message : "Unknown error"}`;
    }

    if (executionTrace.length > 0) {
      const traceLine = executionTrace.map(e => `${e.node}(${e.durationMs}ms)`).join(' -> ');
      log.info(`[BrowserSubgraph] Trace: ${traceLine} -> END`);
    }

    const completedStep: ReasoningStep = {
      step: "browserSubgraph",
      status: "completed",
      detail: `Browser subgraph complete: ${actions.length} action(s), ${executionTrace.length} nodes traced`,
    };

    return {
      finalResponse: fullResponse,
      confidence: 0.85,
      uiPayloads: browserResult?.uiPayloads ?? [],
      reasoningSteps: [inProgressStep, completedStep],
    };
  });
}

// === INLINE COMPARISON NODE ===

async function comparisonNode(state: AskStateType): Promise<Partial<AskStateType>> {
  log.debug("Generating structured comparison for:", state.userQuery);

  const reasoningStep: ReasoningStep = {
    step: "comparisonNode",
    status: "in_progress",
    detail: "Generating structured comparison",
  };

  const sourcesText = state.sources.length > 0
    ? state.sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}\n${s.excerpt}`).join("\n\n")
    : "";

  const lastAssistantMessage = state.messages
    .filter(m => m instanceof AIMessage)
    .slice(-1)[0];
  const previousResponse = lastAssistantMessage
    ? (lastAssistantMessage.content as string).substring(0, 500)
    : "";

  const lastComparisonPayload = state.uiPayloads.filter(p => p.type === "comparison").slice(-1)[0];
  const previousComparisonData = lastComparisonPayload
    ? JSON.stringify(lastComparisonPayload.data)
    : "";

  return withTiming(log, "comparisonNode", async () => {
    const structuredModel = chatModel.withStructuredOutput(comparisonOutputSchema, {
      name: "comparisonOutput",
      method: "jsonMode",
    });

    const followupHint = state.messages.length > 1
      ? "\n\nIMPORTANT: This may be a followup request. Check the 'Previous Response' and 'Previous Comparison Data' sections. If the user is asking to add/remove/modify items, merge their request with the existing data. Preserve all existing items and criteria unless told otherwise."
      : "";

    const contextSection = (() => {
      const parts: string[] = [];
      if (previousResponse) {
        parts.push(`Previous Response:\n${previousResponse}`);
      }
      if (previousComparisonData) {
        parts.push(`Previous Comparison Data JSON:\n${previousComparisonData}`);
      }
      if (sourcesText) {
        parts.push(`Sources:\n${sourcesText}`);
      }
      if (parts.length === 0) {
        return "Use your knowledge.";
      }
      return parts.join("\n\n");
    })();

    const parsed = await structuredModel.invoke([
      new SystemMessage(`You are a JSON comparison engine. Return a structured comparison object.

CRITICAL:
- criteria is array of {key, label} objects
- items have {name, attributes} where attributes is array of {key, value}
- Every attribute key must match a criteria key
- Use lowercase snake_case for keys
- Values: 1-3 words
- 3-5 criteria

${contextSection}${followupHint}`),
      new HumanMessage(state.userQuery),
    ]);

    const criteriaWithKeys = parsed.criteria.map((c) => ({
      key: c.key.toLowerCase().replace(/[\s+/]+/g, '_'),
      label: c.label,
    }));

    const itemsAsRecord = parsed.items.map((item) => {
      const attrs: Record<string, string> = {};
      for (const a of item.attributes) {
        const normKey = a.key.toLowerCase().replace(/[\s+/]+/g, '_');
        attrs[normKey] = a.value;
      }
      return { name: item.name, attributes: attrs };
    });

    const normalizedResponse = {
      title: parsed.title || 'Comparison',
      criteria: criteriaWithKeys,
      items: itemsAsRecord,
    };

    const completedStep: ReasoningStep = {
      step: "comparisonNode",
      status: "completed",
      detail: `Generated comparison: ${itemsAsRecord.length} items, ${criteriaWithKeys.length} criteria`,
    };

    const uiPayload: UIPayload = {
      type: "comparison",
      title: normalizedResponse.title,
      data: normalizedResponse,
      node: "browserSubgraph",
    };

    const textSummary = itemsAsRecord
      .map((item) => {
        const attrs = Object.entries(item.attributes).map(([k, v]) => `${k}: ${v}`).join(", ");
        return `**${item.name}**: ${attrs}`;
      })
      .join("\n\n");

    return {
      finalResponse: `Here's a comparison of ${itemsAsRecord.map((i) => i.name).join(", ")}:\n\n${textSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === INLINE FORM NODE ===

async function formNode(state: AskStateType): Promise<Partial<AskStateType>> {
  log.debug("Generating structured form for:", state.userQuery);

  const reasoningStep: ReasoningStep = {
    step: "formNode",
    status: "in_progress",
    detail: "Generating configuration form schema",
  };

  const attachmentContext = state.attachments.length > 0
    ? `\n\nAttached files:\n${state.attachments.map(a => `--- ${a.name} ---\n${a.content}`).join("\n")}`
    : "";

  const lastAssistantMessage = state.messages
    .filter(m => m instanceof AIMessage)
    .slice(-1)[0];
  const previousResponse = lastAssistantMessage
    ? (lastAssistantMessage.content as string).substring(0, 500)
    : "";

  const lastFormPayload = state.uiPayloads.filter(p => p.type === "form").slice(-1)[0];
  const previousFormData = lastFormPayload
    ? JSON.stringify(lastFormPayload.data)
    : "";

  return withTiming(log, "formNode", async () => {
    const structuredModel = chatModel.withStructuredOutput(formOutputSchema, {
      name: "formOutput",
      method: "jsonMode",
    });

    const followupHint = state.messages.length > 1
      ? "\n\nIMPORTANT: This may be a followup request. Check the 'Previous Response' and 'Previous Form Data' sections. If the user is asking to add/remove/modify fields, merge their request with the existing form. Preserve all existing fields unless told otherwise."
      : "";

    const contextSection = (() => {
      const parts: string[] = [];
      if (previousResponse) {
        parts.push(`Previous Response:\n${previousResponse}`);
      }
      if (previousFormData) {
        parts.push(`Previous Form Data JSON:\n${previousFormData}`);
      }
      if (attachmentContext) {
        parts.push(`Use attached files for context:${attachmentContext}`);
      }
      if (parts.length === 0) {
        return "Use your knowledge to infer sensible defaults.";
      }
      return parts.join("\n\n");
    })();

    const parsed = await structuredModel.invoke([
      new SystemMessage(`You are a JSON form schema generator. Analyze the user's request and generate a structured configuration form. Return valid JSON only.

CRITICAL:
- fields is array of {name, label, type, value} objects
- name: lowercase camelCase key (e.g., 'apiEndpoint', 'logLevel')
- type: one of 'text', 'email', 'number', 'textarea', 'select', 'checkbox'
- value: appropriate default for the field type (string, number, or boolean)
- options: for 'select' type, provide 2-5 choices
- required: true only for essential fields
- 3-8 fields total
- Use reasonable defaults based on common conventions

${contextSection}${followupHint}`),
      new HumanMessage(state.userQuery),
    ]);

    const normalizedFields = parsed.fields.map((f) => ({
      name: f.name.toLowerCase().replace(/[\s-]+/g, "_").replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      label: f.label,
      type: f.type,
      value: f.value,
      ...(f.options && f.options.length > 0 && { options: f.options }),
      ...(f.required !== undefined && { required: f.required }),
    }));

    const normalizedResponse = {
      title: parsed.title || "Configuration Form",
      ...(parsed.targetUrl && { targetUrl: parsed.targetUrl }),
      fields: normalizedFields,
    };

    const completedStep: ReasoningStep = {
      step: "formNode",
      status: "completed",
      detail: `Generated form: ${normalizedFields.length} fields`,
    };

    const uiPayload: UIPayload = {
      type: "form",
      title: normalizedResponse.title,
      data: normalizedResponse,
      node: "browserSubgraph",
    };

    const fieldSummary = normalizedFields.map((f) => `${f.label}: ${JSON.stringify(f.value)}`).join(", ");

    return {
      finalResponse: `Here's a configuration form with ${normalizedFields.length} fields:\n\n${fieldSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === INLINE CHART NODE ===

async function chartNode(state: AskStateType): Promise<Partial<AskStateType>> {
  log.debug("Generating chart visualization for:", state.userQuery);

  const reasoningStep: ReasoningStep = {
    step: "chartNode",
    status: "in_progress",
    detail: "Generating chart visualization",
  };

  const sourcesText = state.sources.length > 0
    ? state.sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}\n${s.excerpt}`).join("\n\n")
    : "";

  const lastAssistantMessage = state.messages
    .filter(m => m instanceof AIMessage)
    .slice(-1)[0];
  const previousResponse = lastAssistantMessage
    ? (lastAssistantMessage.content as string).substring(0, 2000)
    : "";

  const lastChartPayload = state.uiPayloads.length > 0
    ? JSON.stringify(state.uiPayloads[state.uiPayloads.length - 1].data)
    : "";

  return withTiming(log, "chartNode", async () => {
    const structuredModel = chatModel.withStructuredOutput(chartOutputSchema, {
      name: "chartOutput",
      method: "jsonMode",
    });

    const contextSection = (() => {
      const parts: string[] = [];
      if (previousResponse) {
        parts.push(`Previous Assistant Response (context for followup requests):\n${previousResponse}`);
      }
      if (lastChartPayload) {
        parts.push(`Previous Chart Data JSON:\n${lastChartPayload}`);
      }
      if (sourcesText) {
        parts.push(`Use these sources for data:\n${sourcesText}`);
      }
      if (parts.length === 0) {
        return "Use your knowledge to generate reasonable sample data.";
      }
      return parts.join("\n\n");
    })();

    const followupHint = state.messages.length > 1
      ? "\n\nIMPORTANT: This may be a followup to a previous chart/visualization request OR a request to show previous data as a chart. If the user says 'show in graphs', 'show as chart', 'plot this', or similar, extract the relevant numeric data from the 'Previous Assistant Response' and create a chart from it. If there is existing chart data in 'Previous Chart Data JSON', merge the user's request with it. Preserve the original chartType and all original data points unless the user explicitly asks to replace them."
      : "";

    const parsed = await structuredModel.invoke([
      new SystemMessage(`You are a JSON chart data generator. Analyze the user's request and return structured chart data. Return valid JSON only.

CRITICAL:
- data is array of {name, value} objects (category is optional)
- name: label for the data point (e.g., "Q1", "Product A")
- value: numeric value only (no strings)
- 3-12 data points
- chartType: one of "bar", "line", "area", "pie"
- Choose chartType based on data: use "bar" for comparisons, "line" for trends, "pie" for proportions, "area" for cumulative trends
- xKey and yKey should match the data field names

${contextSection}${followupHint}`),
      new HumanMessage(state.userQuery),
    ]);

    const validData = parsed.data.filter(
      (d) => typeof d.value === "number" && isFinite(d.value)
    );

    const normalizedResponse = {
      title: parsed.title || "Chart Visualization",
      chartType: parsed.chartType,
      description: parsed.description || "",
      data: validData,
      xKey: parsed.xKey || "name",
      yKey: parsed.yKey || "value",
    };

    const completedStep: ReasoningStep = {
      step: "chartNode",
      status: "completed",
      detail: `Generated ${parsed.chartType} chart: ${validData.length} data points`,
    };

    const uiPayload: UIPayload = {
      type: "chart",
      title: normalizedResponse.title,
      data: normalizedResponse,
      node: "browserSubgraph",
    };

    const dataSummary = validData
      .map((d) => `${d.name}: ${d.value}`)
      .join(", ");

    return {
      finalResponse: `Here's a ${parsed.chartType} chart showing ${validData.length} data points:\n\n${dataSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === INLINE EXTERNAL SEARCH NODE ===

async function externalSearchNode(state: AskStateType): Promise<Partial<AskStateType>> {
  log.debug("External search", "queries for:", state.userQuery);

  return withTiming(log, "externalSearch", async () => {
    const effectiveQuery = state.messages.length > 1
      ? await rewriteQueryWithContext(state)
      : state.userQuery;

    const queries = [effectiveQuery];
    if (state.intent === "research") {
      queries.push(`${effectiveQuery} 2025 2026`);
    }

    let allSources: Source[] = [];
    let allResults: string[] = [];

    for (const query of queries) {
      try {
        const searchResult = await webSearchTool.invoke({
          query,
          maxResults: 5,
        });
        const parsed = JSON.parse(searchResult);
        const sources: Source[] = parsed.results?.map((r: { url: string; title: string; snippet: string }) => ({
          url: r.url,
          title: r.title,
          excerpt: r.snippet,
        })) || [];
        allResults.push(searchResult);
        allSources.push(...sources);
      } catch (error) {
        log.error("Search failed for query:", query, error);
        allResults.push(JSON.stringify({ error: "Search failed", query, details: String(error) }));
      }
    }

    const deduplicatedSources = allSources.filter(
      (s, i, arr) => arr.findIndex((other) => other.url === s.url) === i
    );

    const sourcesText = deduplicatedSources
      .map((s, i) => `[${i + 1}] ${s.title} - ${s.url}\n${s.excerpt}`)
      .join("\n\n");

    const attachmentContext = state.attachments.length > 0
      ? `\n\nAttached Files:\n${state.attachments.map(a => `--- ${a.name} ---\n${a.content}\n--- End: ${a.name} ---`).join('\n')}`
      : '';

    const synthesizePrompt = new SystemMessage(`You are a research synthesizer. Create a comprehensive, well-structured answer based on the provided research results.

Guidelines:
- Use clear, concise language
- Cite sources using [1], [2], etc. format
- If results conflict, note the discrepancy
- Structure the answer with headers and bullet points where appropriate
- Be factual and cite specific sources

At the END of your response, on a new line, add: Confidence: <0.0-1.0>

Use 0.9+ when sources strongly support the answer, 0.7-0.8 when sources are good but partial, below 0.5 when sources are weak or conflicting.

Research Results:
${allResults.join("\n\n---\n\n")}

Sources:
${sourcesText}

User Query: ${state.userQuery}${attachmentContext}`);

    const response = await getMCPModelForIntent(state.intent, state.userQuery).invoke([
      synthesizePrompt,
      ...safeMessages(state).filter(m => m instanceof HumanMessage || m instanceof AIMessage).slice(-4),
    ]);

    const content = response.content as string;
    const confidenceMatch = content.match(/Confidence:\s*([0-9.]+)/i);
    const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.7;
    const cleanContent = content.replace(/Confidence:\s*[0-9.]+\s*$/i, "").trim();

    return {
      finalResponse: cleanContent,
      confidence,
      sources: deduplicatedSources,
      searchQueries: queries,
      uiPayloads: [],
      reasoningSteps: [{ step: "externalSearch", status: "completed", detail: `Found ${deduplicatedSources.length} sources, confidence: ${(confidence * 100).toFixed(0)}%` }],
    };
  });
}

// === INLINE INTERNAL KNOWLEDGE NODE ===

async function internalKnowledgeNode(state: AskStateType): Promise<Partial<AskStateType>> {
  return withTiming(log, "internalKnowledge", async () => {
    const messages = safeMessages(state);
    const attachmentContext = state.attachments.length > 0
      ? `\n\nThe user has attached the following files as reference:\n${state.attachments.map(a => `\n--- ${a.name} ---\n${a.content}\n--- End: ${a.name} ---`).join('')}\n\nReference the attached file contents above when answering.`
      : '';

    const recentHistory = messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-6)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 400)}`)
      .join("\n");

    const contextInstruction = messages.length > 1
      ? `\n\nCONVERSATION CONTEXT: The current query may reference earlier messages. Use the conversation history below to resolve pronouns and references.\n\nConversation History:\n${recentHistory}`
      : "";

    const response = await getMCPModelForIntent(state.intent, state.userQuery).invoke([
      new SystemMessage(`Answer the user's question from your training knowledge.${contextInstruction}${attachmentContext}

At the END of your response, on a new line, add: Confidence: <0.0-1.0>

Use 0.9+ for well-established facts, 0.7-0.8 for nuanced topics, below 0.5 if you're uncertain.`),
      new HumanMessage(state.userQuery),
    ]);

    const content = response.content as string;
    const confidenceMatch = content.match(/Confidence:\s*([0-9.]+)/i);
    const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.7;
    const cleanContent = content.replace(/Confidence:\s*[0-9.]+\s*$/i, "").trim();

    return {
      finalResponse: cleanContent,
      confidence,
      uiPayloads: [],
      reasoningSteps: [{ step: "internalKnowledge", status: "completed", detail: `Answer from knowledge (confidence: ${(confidence * 100).toFixed(0)}%)` }],
    };
  });
}

// === INLINE GENERAL CHAT NODE ===

async function generalChatNode(state: AskStateType): Promise<Partial<AskStateType>> {
  let fullContent = "";
  const model = getMCPModelForIntent(state.intent, state.userQuery);
  const stream = await model.stream(safeMessages(state));
  for await (const chunk of stream) {
    fullContent += chunk.content as string;
  }

  return {
    finalResponse: fullContent,
    uiPayloads: [],
    reasoningSteps: [{ step: "generalChat", status: "completed", detail: "Response generated" }],
  };
}

// === DESKTOP SUBGRAPH NODE ===
// If intent is NOT desktop, handles via inline LLM. Otherwise executes desktop subgraph.

async function desktopSubgraphNode(state: AskStateType): Promise<Partial<AskStateType>> {
  // If intent is not desktop, handle via inline LLM
  if (state.intent !== "desktop") {
    return generalChatNode(state);
  }

  log.info(`[DesktopSubgraph] Starting desktop automation: "${state.userQuery.substring(0, 120)}${state.userQuery.length > 120 ? '...' : ''}"`);

  const inProgressStep: ReasoningStep = {
    step: "desktopSubgraph",
    status: "in_progress",
    detail: "Initializing hierarchical desktop subgraph (memory -> planner -> executor -> verifier -> store)",
  };

  return withTiming(log, "desktopSubgraph", async () => {
    const nodeStart = Date.now();
    const sessionId = `desktop-${Date.now()}`;

    const recentHistory = state.messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-4)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 400)}`)
      .join("\n");

    const taskWithHistory = state.messages.length > 1
      ? `CONVERSATION CONTEXT (for reference):\n${recentHistory}\n\nTASK: ${state.userQuery}`
      : state.userQuery;

    let fullResponse = "";
    let actions: Array<{ type: string; description: string; success: boolean }> = [];
    let executionTrace: Array<{ node: string; durationMs: number; inputSummary: string; outputSummary: string }> = [];
    let desktopResult: Awaited<ReturnType<typeof executeDesktopSubgraph>> | null = null;

    try {
      desktopResult = await executeDesktopSubgraph(taskWithHistory, sessionId);
      fullResponse = desktopResult.finalResponse;
      actions = desktopResult.actions;
      executionTrace = desktopResult.executionTrace;
    } catch (err) {
      const isInterrupt = err instanceof Error &&
        (err.name === 'GraphInterrupt' || err.name === 'NodeInterrupt');
      if (isInterrupt) {
        log.info(`[DesktopSubgraph] [${sessionId}] Graph interrupt detected — graph will pause for HITL confirmation (elapsed: ${Date.now() - nodeStart}ms)`);
        throw err;
      }
      log.error(`[DesktopSubgraph] [${sessionId}] Subgraph error after ${Date.now() - nodeStart}ms:`, err instanceof Error ? err.message : 'Unknown error');
      fullResponse = `Desktop automation failed: ${err instanceof Error ? err.message : "Unknown error"}`;
    }

    if (executionTrace.length > 0) {
      const traceLine = executionTrace.map(e => `${e.node}(${e.durationMs}ms)`).join(' -> ');
      log.info(`[DesktopSubgraph] Trace: ${traceLine} -> END`);
    }

    const completedStep: ReasoningStep = {
      step: "desktopSubgraph",
      status: "completed",
      detail: `Desktop subgraph complete: ${actions.length} action(s), ${executionTrace.length} nodes traced`,
    };

    return {
      finalResponse: fullResponse,
      confidence: 0.85,
      desktopSessionId: sessionId,
      desktopActions: actions.map(a => ({
        type: a.type,
        description: a.description,
        success: a.success,
        result: a.success ? 'complete' : 'failed',
      })),
      desktopExecutionTrace: executionTrace.map(e => ({
        node: e.node,
        enterMs: 0,
        exitMs: e.durationMs,
        durationMs: e.durationMs,
        inputSummary: e.inputSummary,
        outputSummary: e.outputSummary,
      })),
      uiPayloads: desktopResult?.uiPayloads ?? [],
      reasoningSteps: [inProgressStep, completedStep],
    };
  });
}

// === DOCUMENT SUBGRAPH NODE ===
// If intent is NOT document, handles via inline LLM. Otherwise executes document subgraph.

async function documentSubgraphNode(state: AskStateType): Promise<Partial<AskStateType>> {
  // If intent is not document, handle via inline LLM
  if (state.intent !== "document") {
    return generalChatNode(state);
  }

  log.info(`[DocumentSubgraph] Starting document workflow: "${state.userQuery.substring(0, 120)}${state.userQuery.length > 120 ? '...' : ''}"`);

  const inProgressStep: ReasoningStep = {
    step: "documentSubgraph",
    status: "in_progress",
    detail: "Initializing hierarchical document subgraph (memory -> classifyAction -> planner -> executor -> verifier -> store)",
  };

  return withTiming(log, "documentSubgraph", async () => {
    const nodeStart = Date.now();
    const sessionId = `document-${Date.now()}`;

    const recentHistory = state.messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-4)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 400)}`)
      .join("\n");

    const taskWithHistory = state.messages.length > 1
      ? `CONVERSATION CONTEXT (for reference):\n${recentHistory}\n\nTASK: ${state.userQuery}`
      : state.userQuery;

    let fullResponse = "";
    let filePath = "";
    let actions: Array<{ type: string; description: string; success: boolean }> = [];
    let executionTrace: Array<{ node: string; durationMs: number; inputSummary: string; outputSummary: string }> = [];
    let planStatus = "failed";
    let documentResult: Awaited<ReturnType<typeof executeDocumentSubgraph>> | null = null;

    try {
      documentResult = await executeDocumentSubgraph(taskWithHistory, sessionId);
      fullResponse = documentResult.finalResponse;
      filePath = documentResult.filePath;
      actions = documentResult.actions;
      executionTrace = documentResult.executionTrace;
      planStatus = documentResult.planStatus;
    } catch (err) {
      const isInterrupt = err instanceof Error &&
        (err.name === 'GraphInterrupt' || err.name === 'NodeInterrupt');
      if (isInterrupt) {
        log.info(`[DocumentSubgraph] [${sessionId}] Graph interrupt detected — graph will pause for HITL confirmation (elapsed: ${Date.now() - nodeStart}ms)`);
        throw err;
      }
      log.error(`[DocumentSubgraph] [${sessionId}] Subgraph error after ${Date.now() - nodeStart}ms:`, err instanceof Error ? err.message : 'Unknown error');
      fullResponse = `Document workflow failed: ${err instanceof Error ? err.message : "Unknown error"}`;
    }

    if (executionTrace.length > 0) {
      const traceLine = executionTrace.map(e => `${e.node}(${e.durationMs}ms)`).join(' -> ');
      log.info(`[DocumentSubgraph] Trace: ${traceLine} -> END`);
    }

    const completedStep: ReasoningStep = {
      step: "documentSubgraph",
      status: planStatus === 'complete' ? "completed" : "error",
      detail: `Document subgraph complete: ${actions.length} action(s), file: ${filePath || 'none'}`,
    };

    return {
      finalResponse: fullResponse,
      confidence: planStatus === 'complete' ? 0.9 : 0.3,
      documentSessionId: sessionId,
      documentFilePath: filePath,
      documentPlanStatus: planStatus as "planning" | "executing" | "verifying" | "complete" | "failed" | "recovering",
      documentExecutionTrace: executionTrace.map(e => ({
        node: e.node,
        enterMs: 0,
        exitMs: e.durationMs,
        durationMs: e.durationMs,
        inputSummary: e.inputSummary,
        outputSummary: e.outputSummary,
      })),
      uiPayloads: documentResult?.uiPayloads ?? [],
      reasoningSteps: [inProgressStep, completedStep],
    };
  });
}

// === POST-PROCESS NODE ===
// Detects markdown tables and converts them to UIPayloads
// Also detects comparison/form/chart patterns in text

async function postProcessNode(state: AskStateType): Promise<Partial<AskStateType>> {
  log.debug("Post-processing response for UI payloads");

  const uiPayloads: UIPayload[] = [...(state.uiPayloads || [])];
  const finalResponse = state.finalResponse;

  if (!finalResponse) {
    return { uiPayloads };
  }

  // Detect markdown tables in content for Generative UI
  const tableRegex = /\|(.+)\|[\s\S]*?\n\|[-\s|:]+\|[\s\S]*?\n((?:\|.+\|\n?)+)/g;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(finalResponse)) !== null) {
    const columns = tableMatch[1].split('|').filter(Boolean).map(c => c.trim());
    const rows = tableMatch[2].trim().split('\n').map(row => {
      const cells = row.split('|').filter(Boolean).map(c => c.trim());
      const obj: Record<string, string> = {};
      columns.forEach((col, i) => { obj[col] = cells[i] || ''; });
      return obj;
    });

    const existingTable = uiPayloads.find(p =>
      p.type === 'table' &&
      JSON.stringify(p.data.rows) === JSON.stringify(rows)
    );
    if (!existingTable) {
      uiPayloads.push({
        type: 'table',
        title: 'Extracted Data',
        data: { columns: columns.map(c => ({ key: c, label: c })), rows },
        node: 'postProcessNode',
      });
    }
  }

  // Detect comparison patterns in text (if no comparison UI payload exists)
  const hasComparisonPayload = uiPayloads.some(p => p.type === 'comparison');
  if (!hasComparisonPayload && /\b(vs\.?|versus|compared?\s+to|better\s+than|difference\s+between)\b/i.test(finalResponse)) {
    try {
      const structuredModel = chatModel.withStructuredOutput(comparisonOutputSchema, {
        name: "comparisonOutput",
        method: "jsonMode",
      });

      const parsed = await structuredModel.invoke([
        new SystemMessage(`Extract structured comparison data from the following text.`),
        new HumanMessage(finalResponse.slice(0, 2000)),
      ]);

      const criteriaWithKeys = parsed.criteria.map((c) => ({
        key: c.key.toLowerCase().replace(/[\s+/]+/g, '_'),
        label: c.label,
      }));

      const itemsAsRecord = parsed.items.map((item) => {
        const attrs: Record<string, string> = {};
        for (const a of item.attributes) {
          const normKey = a.key.toLowerCase().replace(/[\s+/]+/g, '_');
          attrs[normKey] = a.value;
        }
        return { name: item.name, attributes: attrs };
      });

      uiPayloads.push({
        type: 'comparison',
        title: parsed.title || 'Comparison',
        data: { title: parsed.title || 'Comparison', criteria: criteriaWithKeys, items: itemsAsRecord },
        node: 'postProcessNode',
      });
    } catch (err) {
      log.debug("Failed to extract comparison data from text:", err);
    }
  }

  // Detect form patterns in text (if no form UI payload exists)
  const hasFormPayload = uiPayloads.some(p => p.type === 'form');
  if (!hasFormPayload && /\b(form|config|configuration|settings|fields?)\b/i.test(finalResponse)) {
    try {
      const structuredModel = chatModel.withStructuredOutput(formOutputSchema, {
        name: "formOutput",
        method: "jsonMode",
      });

      const parsed = await structuredModel.invoke([
        new SystemMessage(`Extract structured form data from the following text.`),
        new HumanMessage(finalResponse.slice(0, 2000)),
      ]);

      const normalizedFields = parsed.fields.map((f) => ({
        name: f.name.toLowerCase().replace(/[\s-]+/g, "_").replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        label: f.label,
        type: f.type,
        value: f.value,
        ...(f.options && f.options.length > 0 && { options: f.options }),
        ...(f.required !== undefined && { required: f.required }),
      }));

      uiPayloads.push({
        type: 'form',
        title: parsed.title || 'Configuration Form',
        data: { title: parsed.title || 'Configuration Form', targetUrl: parsed.targetUrl, fields: normalizedFields },
        node: 'postProcessNode',
      });
    } catch (err) {
      log.debug("Failed to extract form data from text:", err);
    }
  }

  // Detect chart patterns in text (if no chart UI payload exists)
  const hasChartPayload = uiPayloads.some(p => p.type === 'chart');
  if (!hasChartPayload && /\b(chart|graph|data\s+points|statistics|metrics)\b/i.test(finalResponse)) {
    try {
      const structuredModel = chatModel.withStructuredOutput(chartOutputSchema, {
        name: "chartOutput",
        method: "jsonMode",
      });

      const parsed = await structuredModel.invoke([
        new SystemMessage(`Extract structured chart data from the following text.`),
        new HumanMessage(finalResponse.slice(0, 2000)),
      ]);

      const validData = parsed.data.filter(
        (d) => typeof d.value === "number" && isFinite(d.value)
      );

      uiPayloads.push({
        type: 'chart',
        title: parsed.title || 'Chart Visualization',
        data: {
          title: parsed.title || 'Chart Visualization',
          chartType: parsed.chartType,
          description: parsed.description || '',
          data: validData,
          xKey: parsed.xKey || 'name',
          yKey: parsed.yKey || 'value',
        },
        node: 'postProcessNode',
      });
    } catch (err) {
      log.debug("Failed to extract chart data from text:", err);
    }
  }

  return { uiPayloads };
}
