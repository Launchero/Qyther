import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { AskState, AskStateType, Source, ReasoningStep, UIPayload, DesktopAction } from "./state";
import { webSearchTool } from "./tools";
import { z } from "zod";
import { statefulBrowserAgent } from "../browser/stateful-browser-agent";
import { browserSessionManager } from "../browser/browser-session-manager";
import path from "path";
import { app } from "electron";
import { createLogger, withTiming } from "../../utils/logger";

const log = createLogger("Graph");

const chatModel = new ChatOpenAI({
  model: process.env.MODEL || "qwen3.5-plus",
  apiKey: process.env.API_KEY,
  configuration: {
    baseURL: process.env.BASE_URL,
  },
  temperature: 0.7,
  streaming: true,
});

// Cheap, fast model for classification/routing only
const routerModel = new ChatOpenAI({
  model: process.env.FAST_MODEL || process.env.MODEL || "qwen3.5-plus",
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
  temperature: 0,
  maxTokens: 10,
  streaming: false,
});

// Separate model for verification — lower temperature for analytical, critical evaluation
const verifierModel = new ChatOpenAI({
  model: process.env.FAST_MODEL || process.env.MODEL || "qwen3.5-plus",
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
  temperature: 0.1,
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
  date: (() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    return `Today is **${dateStr}**.\n\nThe current day of the week is ${dayOfWeek}.`;
  })(),
  time: (() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `The current time is **${timeStr}**.`;
  })(),
};

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

// LangGraph compiled graph - types are highly dynamic due to StateGraph complexity
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGraph: any = null;

export async function getAskGraph() {
  if (cachedGraph) return cachedGraph;

  const compileStart = Date.now();

  const dbPath = path.join(app.getPath("userData"), "langgraph.db");

  const checkpointer = await SqliteSaver.fromConnString(dbPath);

  const workflow = new StateGraph(AskState)
    .addNode("classify", classifyNode)
    .addNode("fastPath", fastPathNode)
    .addNode("internalKnowledge", internalKnowledgeNode)
    .addNode("externalSearchFanOut", externalSearchFanOutNode)
    .addNode("synthesizeWithSelfCheck", synthesizeWithSelfCheckNode)
    .addNode("quickVerify", quickVerifyNode)
    .addNode("replan", replanNode)
    .addNode("fallbackSearch", fallbackSearchNode)
    .addNode("generalChat", generalChatNode)
    .addNode("comparisonNode", comparisonNode)
    .addNode("formNode", formNode)
    .addNode("chartNode", chartNode)
    .addNode("browserAgent", browserAgentNode)
    .addNode("desktopConfirmation", desktopConfirmationNode)
    .addEdge("__start__", "classify")
    .addConditionalEdges("classify", routeAfterClassify, {
      fast: "fastPath",
      internal: "internalKnowledge",
      external: "externalSearchFanOut",
      general: "generalChat",
      browser: "browserAgent",
      comparison: "comparisonNode",
      form: "formNode",
      chart: "chartNode",
    })
    .addEdge("fastPath", END)
    .addConditionalEdges("internalKnowledge", routeAfterInternalKnowledge, {
      high: END,
      medium: "quickVerify",
      low: "externalSearchFanOut",
    })
    .addConditionalEdges("externalSearchFanOut", routeAfterFanOut, {
      has_results: "synthesizeWithSelfCheck",
      no_results: "fallbackSearch",
    })
    .addConditionalEdges("synthesizeWithSelfCheck", routeAfterSynthesis, {
      high: END,
      medium: "quickVerify",
      low: "replan",
    })
    .addConditionalEdges("quickVerify", routeAfterQuickVerify, {
      pass: END,
      fail: "replan",
    })
    .addEdge("replan", "externalSearchFanOut")
    .addEdge("fallbackSearch", "synthesizeWithSelfCheck")
    .addEdge("generalChat", END)
    .addEdge("comparisonNode", END)
    .addEdge("formNode", END)
    .addEdge("chartNode", END)
    .addEdge("browserAgent", "desktopConfirmation")
    .addEdge("desktopConfirmation", END);

  cachedGraph = workflow.compile({ checkpointer });

  const compileMs = Date.now() - compileStart;
  log.info(`Compilation complete in ${compileMs}ms`);
  if (compileMs > 5000) {
    log.warn(`Slow compilation detected: ${compileMs}ms`);
  }

  log.debug("Compiled workflow with nodes:", Object.keys(workflow.nodes).join(", "));
  log.debug("Edge structure:", JSON.stringify(Array.from(workflow.edges).map((e: [string, string]) => ({
    source: e[0],
    target: e[1],
  })), null, 2));

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
    const reasoningStep: ReasoningStep = {
      step: "classify",
      status: "completed",
      detail: `Fast-path: ${fastPath}`,
    };
    return { intent: "general", complexityScore: "simple", reasoningSteps: [reasoningStep] };
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
If this is a followup to a comparison, form, or browser request, preserve the previous intent.

Intents:
- research: Requires current facts, news, or information not reliably in training data
- general: Conversational, creative writing, or training-data knowledge
- browser: Requires interactive web page navigation

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

    const validIntents = ["research", "general", "browser"];
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

function routeAfterClassify(state: AskStateType): string {
  const { intent, complexityScore, attachments, userQuery } = state;
  const route = (() => {
    // Always use the LLM when files are attached — never fast-path
    if (attachments && attachments.length > 0) {
      return "general"; // generalChatNode uses state.messages which includes file context
    }
    // Detect comparison queries EARLY — before other routing
    if (/\b(compare|vs\.?|versus|difference\s+between)\b/i.test(userQuery)) {
      return "comparison";
    }
    // Detect form generation queries
    if (/\b(generate\s+(a|the)?\s*(form|config|configuration|settings)|create\s+(a|the)?\s*(form|config|configuration|settings))\b/i.test(userQuery)) {
      return "form";
    }
    // Detect chart/visualization queries
    if (/\b(chart|graph|visuali[sz]e|plot|show.*data|show.*graph|bar chart|line chart|pie chart)\b/i.test(userQuery)) {
      return "chart";
    }
    // Only fast-path when the query actually matches a known fast pattern.
    // This prevents incomplete queries like "what can you" from getting a canned greeting.
    if (complexityScore === "simple" && intent === "general" && detectFastPath(userQuery)) {
      return "fast";
    }
    if (intent === "research" && complexityScore === "simple") {
      return "internal";
    }
    if (intent === "research" && (complexityScore === "medium" || complexityScore === "complex")) {
      return "external";
    }
    if (intent === "general" && complexityScore !== "simple") {
      return "internal";
    }
    if (intent === "browser") {
      return "browser";
    }
    return "internal";
  })();

  log.debug("classify →", route, `(intent=${intent}, complexity=${complexityScore})`);
  return route;
}

// === FAST PATH NODE ===

async function fastPathNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const fastPath = detectFastPath(state.userQuery);

  // Guard: if somehow called without a matching pattern, fall back to general chat
  if (!fastPath) {
    const reasoningStep: ReasoningStep = {
      step: "fastPath",
      status: "error",
      detail: "No fast-path pattern matched — falling back to general chat",
    };

    return {
      finalResponse: "",
      confidence: 0,
      reasoningSteps: [reasoningStep],
    };
  }

  const response = FAST_RESPONSES[fastPath];

  const reasoningStep: ReasoningStep = {
    step: "fastPath",
    status: "completed",
    detail: `Heuristic match: ${fastPath}`,
  };

  return {
    finalResponse: response,
    confidence: 1.0,
    reasoningSteps: [reasoningStep],
  };
}

// === INTERNAL KNOWLEDGE NODE ===

async function internalKnowledgeNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const reasoningStep: ReasoningStep = {
    step: "internalKnowledge",
    status: "in_progress",
    detail: "Answering from training knowledge",
  };

  return withTiming(log, "internalKnowledge", async () => {
    const messages = safeMessages(state);
    const attachmentContext = state.attachments.length > 0
      ? `\n\nThe user has attached the following files as reference:\n${state.attachments.map(a => `\n--- ${a.name} ---\n${a.content}\n--- End: ${a.name} ---`).join('')}\n\nReference the attached file contents above when answering. The files are provided as context, not something you need to read from your training data.`
      : '';

    const recentHistory = messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-6)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 400)}`)
      .join("\n");

    const contextInstruction = messages.length > 1
      ? `\n\nCONVERSATION CONTEXT: The current query may reference earlier messages. Use the conversation history below to resolve pronouns and references.\n\nConversation History:\n${recentHistory}`
      : "";

    const response = await chatModel.invoke([
      new SystemMessage(`Answer the user's question from your training knowledge.${contextInstruction}${attachmentContext}

At the END of your response, on a new line, add: Confidence: <0.0-1.0>

Use 0.9+ for well-established facts, 0.7-0.8 for nuanced topics, below 0.5 if you're uncertain.`),
      new HumanMessage(state.userQuery),
    ]);

    const content = response.content as string;
    const confidenceMatch = content.match(/Confidence:\s*([0-9.]+)/i);
    const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.7;
    const cleanContent = content.replace(/Confidence:\s*[0-9.]+\s*$/i, "").trim();

    log.debug("Confidence extracted:", confidence);
    if (!confidenceMatch) {
      log.warn("No confidence found in response, using default 0.7");
    }

    const completedStep: ReasoningStep = {
      step: "internalKnowledge",
      status: "completed",
      detail: `Answer from knowledge (confidence: ${(confidence * 100).toFixed(0)}%)`,
    };

    return {
      finalResponse: cleanContent,
      confidence,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === EXTERNAL SEARCH FAN-OUT NODE ===

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
    const response = await routerModel.invoke([rewrittenPrompt]);
    const rewritten = (response.content as string).trim();
    log.debug("Query rewritten:", state.userQuery, "→", rewritten);
    return rewritten || state.userQuery;
  } catch (error) {
    log.warn("Query rewrite failed, using original:", error);
    return state.userQuery;
  }
}

async function externalSearchFanOutNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const effectiveQuery = await rewriteQueryWithContext(state);
  const queries = [effectiveQuery];

  if (state.intent === "research") {
    queries.push(`${effectiveQuery} 2025 2026`);
  }

  log.debug("Fan-out queries:", queries);

  const reasoningStep: ReasoningStep = {
    step: "externalSearchFanOut",
    status: "completed",
    detail: `Searching with ${queries.length} queries: ${queries.join(", ")}`,
  };

  let allSources: Source[] = [];
  let allResults: string[] = [];

  for (const query of queries) {
    try {
      log.debug("Executing:", query);
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

      log.debug("Results for", query, ":", sources.length, "sources");

      allResults.push(searchResult);
      allSources.push(...sources);
    } catch (error) {
      log.error("Search failed for query:", query, error);
      allResults.push(JSON.stringify({ error: "Search failed for query", query, details: String(error) }));
    }
  }

  const deduplicatedSources = allSources.filter(
    (s, i, arr) => arr.findIndex((other) => other.url === s.url) === i
  );

  log.debug("Deduplicated:", allSources.length, "→", deduplicatedSources.length, "unique sources");

  const completedStep: ReasoningStep = {
    step: "externalSearchFanOut",
    status: "completed",
    detail: `Found ${deduplicatedSources.length} unique sources across ${queries.length} searches`,
  };

  return {
    researchResults: allResults,
    sources: deduplicatedSources,
    searchQueries: queries,
    reasoningSteps: [reasoningStep, completedStep],
  };
}

// === ROUTER: after fan-out ===

function routeAfterFanOut(state: AskStateType): "has_results" | "no_results" {
  const result = state.sources.length > 0 ? "has_results" : "no_results";
  log.debug("fanOut →", result, `(sources=${state.sources.length})`);
  return result;
}

// === SYNTHESIZE WITH SELF-CHECK NODE ===

async function synthesizeWithSelfCheckNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const isRetry = state.retryCount > 0;
  log.debug(isRetry ? `Retry attempt ${state.retryCount + 1}` : "Initial synthesis",
    "sources:", state.sources.length, "results:", state.researchResults.length);

  return withTiming(log, "synthesize", async () => {
    const reasoningStep: ReasoningStep = {
      step: "synthesizeWithSelfCheck",
      status: "in_progress",
      detail: isRetry
        ? `Re-synthesizing (attempt ${state.retryCount + 1}/${MAX_RETRIES + 1})`
        : "Synthesizing research results",
    };

    const sourcesText = state.sources
      .map((s, i) => `[${i + 1}] ${s.title} - ${s.url}\n${s.excerpt}`)
      .join("\n\n");

    const attachmentContext = state.attachments.length > 0
      ? `\n\nAttached Files:\n${state.attachments.map(a => `--- ${a.name} ---\n${a.content}\n--- End: ${a.name} ---`).join('\n')}`
      : '';

    let synthesizePrompt: SystemMessage;

    if (isRetry && state.validationCritique) {
      synthesizePrompt = new SystemMessage(`You are a research synthesizer. Your previous attempt had quality issues. Improve the response based on the validation feedback.

Validation Feedback: ${state.validationCritique}
Previous Response: ${state.finalResponse}

Guidelines:
- Address ALL issues mentioned in the validation feedback
- Use clear, concise language
- Cite sources using [1], [2], etc. format
- If results conflict, note the discrepancy
- Structure the answer with headers and bullet points where appropriate
- Be factual and cite specific sources

At the END of your response, on a new line, add: Confidence: <0.0-1.0>

Research Results:
${state.researchResults.join("\n\n---\n\n")}

Sources:
${sourcesText}

User Query: ${state.userQuery}${attachmentContext}`);
    } else {
      synthesizePrompt = new SystemMessage(`You are a research synthesizer. Create a comprehensive, well-structured answer based on the provided research results.

Guidelines:
- Use clear, concise language
- Cite sources using [1], [2], etc. format
- If results conflict, note the discrepancy
- Structure the answer with headers and bullet points where appropriate
- Be factual and cite specific sources

At the END of your response, on a new line, add: Confidence: <0.0-1.0>

Use 0.9+ when sources strongly support the answer, 0.7-0.8 when sources are good but partial, below 0.5 when sources are weak or conflicting.

Research Results:
${state.researchResults.join("\n\n---\n\n")}

Sources:
${sourcesText}

User Query: ${state.userQuery}${attachmentContext}`);
    }

    const response = await chatModel.invoke([
      synthesizePrompt,
      ...safeMessages(state).filter(m => m instanceof HumanMessage || m instanceof AIMessage).slice(-4),
    ]);

    const content = response.content as string;
    const confidenceMatch = content.match(/Confidence:\s*([0-9.]+)/i);
    const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.7;
    const cleanContent = content.replace(/Confidence:\s*[0-9.]+\s*$/i, "").trim();

    if (!confidenceMatch) {
      log.warn("No confidence found in response, using default 0.7");
    }
    log.debug("Confidence:", confidence, "content length:", cleanContent.length);

    const completedStep: ReasoningStep = {
      step: "synthesizeWithSelfCheck",
      status: "completed",
      detail: isRetry
        ? `Answer re-synthesized (attempt ${state.retryCount + 1}), confidence: ${(confidence * 100).toFixed(0)}%`
        : `Answer synthesized, confidence: ${(confidence * 100).toFixed(0)}%`,
    };

    // Detect markdown tables in content for Generative UI
    const uiPayloads: UIPayload[] = [];
    const tableRegex = /\|(.+)\|[\s\S]*?\n\|[-\s|:]+\|[\s\S]*?\n((?:\|.+\|\n?)+)/g;
    const tableMatch = tableRegex.exec(cleanContent);
    if (tableMatch) {
      const columns = tableMatch[1].split('|').filter(Boolean).map(c => c.trim());
      const rows = tableMatch[2].trim().split('\n').map(row => {
        const cells = row.split('|').filter(Boolean).map(c => c.trim());
        const obj: Record<string, string> = {};
        columns.forEach((col, i) => { obj[col] = cells[i] || ''; });
        return obj;
      });
      uiPayloads.push({
        type: 'table',
        title: 'Extracted Data',
        data: { columns: columns.map(c => ({ key: c, label: c })), rows },
        node: 'synthesizeWithSelfCheck',
      });
    }

    return {
      finalResponse: cleanContent,
      confidence,
      sources: state.sources,
      uiPayloads,
      qualityScore: 0,
      validationScore: 0,
      validationCritique: "",
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === ROUTER: after synthesis ===

function routeAfterSynthesis(state: AskStateType): "high" | "medium" | "low" {
  const { confidence, qualityScore, retryCount } = state;
  const effectiveScore = qualityScore > 0
    ? (confidence * 0.3 + qualityScore * 0.7)
    : confidence;

  const route = (() => {
    if (effectiveScore >= CONFIDENCE_HIGH) {
      return "high";
    }
    if (retryCount >= MAX_RETRIES) {
      return "medium";
    }
    if (effectiveScore >= CONFIDENCE_MEDIUM) {
      return "medium";
    }
    return "low";
  })();

  log.debug("synthesize →", route, `(confidence=${confidence}, qualityScore=${qualityScore}, effective=${effectiveScore.toFixed(2)}, retries=${retryCount})`);
  return route;
}

// === QUICK VERIFY NODE ===

async function quickVerifyNode(state: AskStateType): Promise<Partial<AskStateType>> {
  if (!state.finalResponse) {
    log.warn("No finalResponse to verify");
    return { verified: false, confidence: 0, qualityScore: 0 };
  }

  log.debug("Verifying response length:", state.finalResponse.length, "sources:", state.sources.length);

  return withTiming(log, "quickVerify", async () => {
    const reasoningStep: ReasoningStep = {
      step: "quickVerify",
      status: "in_progress",
      detail: "Quality verification check",
    };

    const messages = safeMessages(state);
    const recentHistory = messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-4)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 300)}`)
      .join("\n");

    const contextHint = messages.length > 1
      ? `\n\nConversation History (for reference resolution):\n${recentHistory}`
      : "";

    const verificationPrompt = new SystemMessage(`You are a quality verifier. Score this response 0.0-1.0.

Respond with ONLY a number followed by a brief reason.
Examples: "0.9 - Directly answers the query with clear, factual information"
          "0.3 - Vague and does not address the core question"

User Query: ${state.userQuery}
Response: ${state.finalResponse}
${state.sources.length > 0 ? `Sources: ${state.sources.length} sources available` : "No sources available"}${contextHint}`);

    const response = await verifierModel.invoke([verificationPrompt]);
    const content = (response.content as string).trim();
    const scoreMatch = content.match(/^([0-9]*\.?[0-9]+)/);
    const qualityScore = scoreMatch ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1]))) : 0.5;
    const passed = qualityScore >= 0.6;

    log.debug("Quality score:", qualityScore, "passed:", passed, "model output:", content.slice(0, 100));

    const completedStep: ReasoningStep = {
      step: "quickVerify",
      status: "completed",
      detail: passed ? `Quality score: ${(qualityScore * 100).toFixed(0)}% — passed` : `Quality score: ${(qualityScore * 100).toFixed(0)}% — failed: ${content.slice(0, 200)}`,
    };

    return {
      verified: passed,
      qualityScore,
      validationScore: qualityScore,
      // Pass the full verifier output as critique when quality is low, so retry can improve
      validationCritique: passed ? "" : content.slice(0, 500),
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === ROUTER: after quick verify ===

function routeAfterQuickVerify(state: AskStateType): "pass" | "fail" {
  if (state.qualityScore > 0) {
    return state.qualityScore >= 0.6 ? "pass" : "fail";
  }
  return state.verified ? "pass" : "fail";
}

// === ROUTER: after internal knowledge ===

function routeAfterInternalKnowledge(state: AskStateType): "high" | "medium" | "low" {
  const { confidence, qualityScore } = state;
  const effectiveScore = qualityScore > 0
    ? (confidence * 0.3 + qualityScore * 0.7)
    : confidence;

  if (effectiveScore >= CONFIDENCE_HIGH) {
    return "high";
  }
  if (effectiveScore >= CONFIDENCE_MEDIUM) {
    return "medium";
  }
  return "low";
}

// === FALLBACK SEARCH NODE ===

async function fallbackSearchNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const reasoningStep: ReasoningStep = {
    step: "fallbackSearch",
    status: "in_progress",
    detail: "Trying alternative search approach",
  };

  const refinedQuery = state.userQuery.replace(/\b(latest|recent|current|new)\b/gi, "").trim() || state.userQuery;

  const contextAwareQuery = state.messages.length > 1
    ? await rewriteQueryWithContext(state)
    : refinedQuery;

  try {
    const searchResult = await webSearchTool.invoke({
      query: contextAwareQuery,
      maxResults: 5,
    });

    const parsed = JSON.parse(searchResult);
    const sources: Source[] = parsed.results?.map((r: { url: string; title: string; snippet: string }) => ({
      url: r.url,
      title: r.title,
      excerpt: r.snippet,
    })) || [];

    const completedStep: ReasoningStep = {
      step: "fallbackSearch",
      status: "completed",
      detail: `Fallback search found ${sources.length} sources`,
    };

    return {
      researchResults: [searchResult],
      sources,
      reasoningSteps: [reasoningStep, completedStep],
    };
  } catch (error) {
    const errorStep: ReasoningStep = {
      step: "fallbackSearch",
      status: "error",
      detail: error instanceof Error ? error.message : "Fallback search failed",
    };
    return {
      researchResults: [JSON.stringify({ error: "Fallback search failed", details: String(error) })],
      reasoningSteps: [reasoningStep, errorStep],
    };
  }
}

async function generalChatNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const reasoningStep: ReasoningStep = {
    step: "General Response",
    status: "in_progress",
    detail: "Generating response",
  };

  let fullContent = "";
  const stream = await chatModel.stream(safeMessages(state));
  for await (const chunk of stream) {
    fullContent += chunk.content as string;
  }

  const completedStep: ReasoningStep = {
    step: "General Response",
    status: "completed",
    detail: "Response generated",
  };

  return {
    finalResponse: fullContent,
    reasoningSteps: [reasoningStep, completedStep],
  };
}

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

    // withStructuredOutput already guarantees correct schema; convert attributes array
    // to Record<string, string> for the frontend ComparisonTable component
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
      node: "comparisonNode",
    };

    const textSummary = itemsAsRecord
      .map((item) => {
        const attrs = Object.entries(item.attributes).map(([k, v]) => `${k}: ${v}`).join(", ");
        return `**${item.name}**: ${attrs}`;
      })
      .join("\n\n");

    log.debug("Normalized output:", JSON.stringify(normalizedResponse).slice(0, 300));

    return {
      finalResponse: `Here's a comparison of ${itemsAsRecord.map((i) => i.name).join(", ")}:\n\n${textSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

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

    // Normalize field names to camelCase
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
      node: "formNode",
    };

    const fieldSummary = normalizedFields.map((f) => `${f.label}: ${JSON.stringify(f.value)}`).join(", ");

    log.debug("Normalized output:", JSON.stringify(normalizedResponse).slice(0, 300));

    return {
      finalResponse: `Here's a configuration form with ${normalizedFields.length} fields:\n\n${fieldSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

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

    // Validate data values are finite numbers
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
      node: "chartNode",
    };

    const dataSummary = validData
      .map((d) => `${d.name}: ${d.value}`)
      .join(", ");

    log.debug("Normalized chart output:", JSON.stringify(normalizedResponse).slice(0, 300));

    return {
      finalResponse: `Here's a ${parsed.chartType} chart showing ${validData.length} data points:\n\n${dataSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

async function browserAgentNode(state: AskStateType): Promise<Partial<AskStateType>> {
  log.debug("Starting browser automation for:", state.userQuery);

  const inProgressStep: ReasoningStep = {
    step: "browserAgent",
    status: "in_progress",
    detail: "Initializing browser automation",
  };

  return withTiming(log, "browserAgent", async () => {
    if (!statefulBrowserAgent.isReady()) {
      log.debug("Initializing browser agent...");
      await statefulBrowserAgent.initialize();
    }

    const sessionId = await browserSessionManager.createSession();
    log.debug("Created browser session:", sessionId);

    const recentHistory = state.messages
      .filter(m => m instanceof HumanMessage || m instanceof AIMessage)
      .slice(-4)
      .map(m => `${m instanceof HumanMessage ? "User" : "Assistant"}: ${(m.content as string).substring(0, 400)}`)
      .join("\n");

    const taskWithHistory = state.messages.length > 1
      ? `CONVERSATION CONTEXT (for reference):\n${recentHistory}\n\nTASK: ${state.userQuery}`
      : state.userQuery;

    let fullResponse = "";
    let error: unknown = null;

    try {
      const stream = statefulBrowserAgent.executeTaskStream(taskWithHistory, sessionId);

      for await (const chunk of stream) {
        fullResponse += chunk;
      }
    } catch (err) {
      error = err;
    } finally {
      try {
        await statefulBrowserAgent.closeSession(sessionId);
        await browserSessionManager.closeSession();
        log.debug("Browser session cleaned up:", sessionId);
      } catch (cleanupError) {
        log.warn('Browser session cleanup error:', cleanupError);
      }
    }

    if (error) {
      const errorStep: ReasoningStep = {
        step: "browserAgent",
        status: "error",
        detail: error instanceof Error ? error.message : "Browser automation failed",
      };

      log.error("Browser agent error:", { sessionId, error });

      return {
        finalResponse: fullResponse || `Browser automation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0,
        reasoningSteps: [inProgressStep, errorStep],
      };
    }

    const completedStep: ReasoningStep = {
      step: "browserAgent",
      status: "completed",
      detail: "Browser automation complete",
    };

    log.debug("Browser task complete, response length:", fullResponse.length);

    return {
      finalResponse: fullResponse,
      confidence: 0.85,
      reasoningSteps: [inProgressStep, completedStep],
    };
  });
}

// === REPLAN NODE ===

async function replanNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const reasoningStep: ReasoningStep = {
    step: "replan",
    status: "in_progress",
    detail: `Low confidence — refining search approach (attempt ${state.retryCount + 1}/${MAX_RETRIES})`,
  };

  let refinedQuery: string;
  if (state.messages.length > 1) {
    refinedQuery = await rewriteQueryWithContext(state);
  } else if (state.researchResults.length > 0) {
    refinedQuery = `${state.userQuery} more details`;
  } else {
    refinedQuery = state.userQuery;
  }

  const retryCount = state.retryCount + 1;

  const completedStep: ReasoningStep = {
    step: "replan",
    status: "completed",
    detail: `Refined query: "${refinedQuery}"`,
  };

  return {
    userQuery: refinedQuery,
    retryCount,
    researchResults: [],
    sources: [],
    reasoningSteps: [reasoningStep, completedStep],
  };
}

// === DESKTOP CONFIRMATION NODE (HITL) ===
// NOTE: This node is dormant until a preceding node produces `desktopActions`.
// Currently, `browserAgentNode` and all other nodes return only `finalResponse`
// and `confidence` without populating `desktopActions`, so the interrupt path
// is unreachable in normal use. Future work should wire explicit destructive
// actions into `state.desktopActions` before relying on this HITL flow.
// Per LangGraph docs: code before interrupt() reruns on resume, so any
// side effects must be idempotent.

async function desktopConfirmationNode(state: AskStateType): Promise<Partial<AskStateType>> {
  // If no pending desktop actions, pass through
  if (!state.desktopActions || state.desktopActions.length === 0) {
    return { desktopActions: [] };
  }

  // Call interrupt to pause graph and wait for user confirmation
  const confirmationPayload = {
    type: 'desktop_confirmation',
    action: state.desktopActions[0].type,
    description: state.desktopActions[0].description,
    actions: state.desktopActions,
  };

  // This pauses graph execution and waits for resume with Command({ resume: { confirmed: boolean } })
  const resumeValue = interrupt(confirmationPayload) as { confirmed: boolean } | undefined;

  const confirmed = resumeValue?.confirmed ?? false;
  const logResult = createLogger("Graph");

  if (confirmed) {
    logResult.debug("Desktop action confirmed");
    const confirmedActions: DesktopAction[] = state.desktopActions.map(a => ({
      ...a,
      success: true,
    }));
    return { desktopActions: confirmedActions };
  } else {
    logResult.debug("Desktop action cancelled by user");
    const cancelledActions: DesktopAction[] = state.desktopActions.map(a => ({
      ...a,
      success: false,
    }));
    return { desktopActions: cancelledActions };
  }
}
