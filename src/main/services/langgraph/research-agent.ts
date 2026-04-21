import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { AskState, AskStateType, Source, ReasoningStep, UIPayload } from "./state";
import { webSearchTool } from "./tools";
import { z } from "zod";
import { statefulBrowserAgent } from "../browser/stateful-browser-agent";
import { browserSessionManager } from "../browser/browser-session-manager";
import path from "path";
import { app } from "electron";

// === DEBUG CONFIGURATION ===
const DEBUG_GRAPH = process.env.DEBUG_GRAPH === "true" || false;

function graphLog(scope: string, ...args: unknown[]): void {
  if (DEBUG_GRAPH) {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
    console.log(`[Graph ${timestamp}] [${scope}]`, ...args);
  }
}

function graphError(scope: string, error: unknown): void {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.error(`[Graph ${timestamp}] [${scope}] ERROR:`, error);
}

function timed<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  if (!DEBUG_GRAPH) return fn();
  const start = Date.now();
  return fn().then(
    (result) => {
      graphLog(scope, `Completed in ${Date.now() - start}ms`);
      return result;
    },
    (err) => {
      graphLog(scope, `Failed after ${Date.now() - start}ms:`, err);
      throw err;
    }
  );
}

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

// Lightweight heuristic to detect queries that can use fast-path (no LLM needed)
const FAST_PATTERNS = {
  greeting: /^\s*(hi|hello|hey|greetings|howdy|sup|yo|hola|what'?s? up|good\s*(morning|afternoon|evening)|g'day)\s*$/i,
  thanks: /^\s*(thanks?|thank\s*you|ty|thx|cheers|appreciate\s*it)\s*$/i,
  acknowledgement: /^\s*(ok|okay|sure|yep|yeah|yup|nope|nah|no|got\s*it|alright|cool)\s*$/i,
  farewell: /^\s*(bye|goodbye|see\s*you|cya|later|take\s*care)\s*$/i,
};

const FAST_RESPONSES: Record<string, string> = {
  greeting: "Hey! How can I help you today?",
  thanks: "You're welcome! Let me know if you need anything else.",
  acknowledgement: "Got it! What would you like to do next?",
  farewell: "Goodbye! Feel free to come back anytime.",
};

function detectFastPath(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return null;
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
const MAX_REPLANS = 1;
const CONFIDENCE_HIGH = 0.8;
const CONFIDENCE_MEDIUM = 0.5;

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

let cachedGraph: any = null;

export async function getAskGraph(): Promise<any> {
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
    .addNode("browserAgent", browserAgentNode)
    .addEdge("__start__", "classify")
    .addConditionalEdges("classify", routeAfterClassify, {
      fast: "fastPath",
      internal: "internalKnowledge",
      external: "externalSearchFanOut",
      general: "generalChat",
      browser: "browserAgent",
      comparison: "comparisonNode",
      form: "formNode",
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
    .addEdge("browserAgent", END);

  cachedGraph = workflow.compile({ checkpointer });

  const compileMs = Date.now() - compileStart;
  console.log(`[Graph] Compilation complete in ${compileMs}ms`);
  if (compileMs > 5000) {
    console.warn(`[Graph] Slow compilation detected: ${compileMs}ms`);
  }

  if (DEBUG_GRAPH) {
    const nodes = workflow.nodes;
    console.log("[Graph] Compiled workflow with nodes:", Object.keys(nodes).join(", "));
    console.log("[Graph] Edge structure:", JSON.stringify(Array.from(workflow.edges).map((e: any) => ({
      source: e[0],
      target: e[1],
      conditional: e[2],
    })), null, 2));
  }

  return cachedGraph;
}

// === CLASSIFICATION NODE (replaces quickRoute + classifyIntent) ===

async function classifyNode(state: AskStateType): Promise<Partial<AskStateType>> {
  graphLog("classify", "Query:", state.userQuery);

  const fastPath = detectFastPath(state.userQuery);
  if (fastPath) {
    graphLog("classify", "Fast-path detected:", fastPath);
    const reasoningStep: ReasoningStep = {
      step: "classify",
      status: "completed",
      detail: `Fast-path: ${fastPath}`,
    };
    return { intent: "general", complexityScore: "simple", reasoningSteps: [reasoningStep] };
  }

  const complexity = assessComplexity(state.userQuery);
  graphLog("classify", "Heuristic complexity:", complexity);

  return timed("classify", async () => {
    const classificationPrompt = new SystemMessage(`You are an intent and complexity classifier. Classify the user's query:

Intents:
- research: Requires current facts, news, or information not reliably in training data
- general: Conversational, creative writing, or training-data knowledge
- browser: Requires interactive web page navigation

Complexity:
- simple: Short, single-concept queries (<30 chars, no question marks)
- medium: Standard questions with clear scope
- complex: Multi-part questions, code blocks, analysis requests, or 300+ chars

Return ONLY: intent/complexity (e.g., "research/complex" or "general/simple")`);

    const response = await routerModel.invoke([
      classificationPrompt,
      new HumanMessage(state.userQuery),
    ]);

    const content = (response.content as string).toLowerCase().trim();
    graphLog("classify", "Raw model output:", content);

    const [rawIntent, rawComplexity] = content.split("/");

    const validIntents = ["research", "general", "browser"];
    const intent = validIntents.includes(rawIntent) ? rawIntent : "general";
    const validComplexity = ["simple", "medium", "complex"];
    const complexityScore = validComplexity.includes(rawComplexity) ? rawComplexity : assessComplexity(state.userQuery);

    if (!validIntents.includes(rawIntent)) {
      graphLog("classify", "Invalid intent fallback:", rawIntent, "→ general");
    }
    if (!validComplexity.includes(rawComplexity)) {
      graphLog("classify", "Invalid complexity fallback:", rawComplexity, "→", complexityScore);
    }

    const reasoningStep: ReasoningStep = {
      step: "classify",
      status: "completed",
      detail: `Intent: ${intent}, Complexity: ${complexityScore}`,
    };

    graphLog("classify", "Final classification:", { intent, complexityScore });

    return {
      intent,
      complexityScore,
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

  graphLog("route", "classify →", route, `(intent=${intent}, complexity=${complexityScore})`);
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

  return timed("internalKnowledge", async () => {
    const attachmentContext = state.attachments.length > 0
      ? `\n\nThe user has attached the following files as reference:\n${state.attachments.map(a => `\n--- ${a.name} ---\n${a.content}\n--- End: ${a.name} ---`).join('')}\n\nReference the attached file contents above when answering. The files are provided as context, not something you need to read from your training data.`
      : '';

    const response = await chatModel.invoke([
      new SystemMessage(`Answer the user's question from your training knowledge.${attachmentContext}

At the END of your response, on a new line, add: Confidence: <0.0-1.0>

Use 0.9+ for well-established facts, 0.7-0.8 for nuanced topics, below 0.5 if you're uncertain.`),
      new HumanMessage(state.userQuery),
    ]);

    const content = response.content as string;
    const confidenceMatch = content.match(/Confidence:\s*([0-9.]+)/i);
    const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.7;
    const cleanContent = content.replace(/Confidence:\s*[0-9.]+\s*$/i, "").trim();

    graphLog("internalKnowledge", "Confidence extracted:", confidence);
    if (!confidenceMatch) {
      graphLog("internalKnowledge", "WARN: No confidence found in response, using default 0.7");
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

async function externalSearchFanOutNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const queries = [state.userQuery];

  if (state.intent === "research") {
    queries.push(`${state.userQuery} 2025 2026`);
  }

  graphLog("search", "Fan-out queries:", queries);

  const reasoningStep: ReasoningStep = {
    step: "externalSearchFanOut",
    status: "completed",
    detail: `Searching with ${queries.length} queries: ${queries.join(", ")}`,
  };

  let allSources: Source[] = [];
  let allResults: string[] = [];

  for (const query of queries) {
    try {
      graphLog("search", "Executing:", query);
      const searchResult = await webSearchTool.invoke({
        query,
        maxResults: 5,
      });

      const parsed = JSON.parse(searchResult);
      const sources: Source[] = parsed.results?.map((r: any) => ({
        url: r.url,
        title: r.title,
        excerpt: r.snippet,
      })) || [];

      graphLog("search", "Results for", query, ":", sources.length, "sources");

      allResults.push(searchResult);
      allSources.push(...sources);
    } catch (error) {
      graphError("search", { query, error });
      allResults.push(JSON.stringify({ error: "Search failed for query", query, details: String(error) }));
    }
  }

  const deduplicatedSources = allSources.filter(
    (s, i, arr) => arr.findIndex((other) => other.url === s.url) === i
  );

  graphLog("search", "Deduplicated:", allSources.length, "→", deduplicatedSources.length, "unique sources");

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
  graphLog("route", "fanOut →", result, `(sources=${state.sources.length})`);
  return result;
}

// === SYNTHESIZE WITH SELF-CHECK NODE ===

async function synthesizeWithSelfCheckNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const isRetry = state.retryCount > 0;
  graphLog("synthesize", isRetry ? `Retry attempt ${state.retryCount + 1}` : "Initial synthesis",
    "sources:", state.sources.length, "results:", state.researchResults.length);

  return timed("synthesize", async () => {
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
      ...state.messages.filter(m => m instanceof HumanMessage || m instanceof AIMessage).slice(-4),
    ]);

    const content = response.content as string;
    const confidenceMatch = content.match(/Confidence:\s*([0-9.]+)/i);
    const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.7;
    const cleanContent = content.replace(/Confidence:\s*[0-9.]+\s*$/i, "").trim();

    if (!confidenceMatch) {
      graphLog("synthesize", "WARN: No confidence found in response, using default 0.7");
    }
    graphLog("synthesize", "Confidence:", confidence, "content length:", cleanContent.length);

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
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === ROUTER: after synthesis ===

function routeAfterSynthesis(state: AskStateType): "high" | "medium" | "low" {
  const { confidence, retryCount } = state;
  const route = (() => {
    if (confidence >= CONFIDENCE_HIGH) {
      return "high";
    }
    if (retryCount >= MAX_RETRIES) {
      return "medium";
    }
    if (confidence >= CONFIDENCE_MEDIUM) {
      return "medium";
    }
    return "low";
  })();

  graphLog("route", "synthesize →", route, `(confidence=${confidence}, retries=${retryCount})`);
  return route;
}

// === QUICK VERIFY NODE ===

async function quickVerifyNode(state: AskStateType): Promise<Partial<AskStateType>> {
  if (!state.finalResponse) {
    graphLog("quickVerify", "WARN: No finalResponse to verify");
    return { verified: false, confidence: 0 };
  }

  graphLog("quickVerify", "Verifying response length:", state.finalResponse.length, "sources:", state.sources.length);

  return timed("quickVerify", async () => {
    const reasoningStep: ReasoningStep = {
      step: "quickVerify",
      status: "in_progress",
      detail: "Quick verification check",
    };

    const verificationPrompt = new SystemMessage(`You are a quick quality verifier. Check if this response adequately answers the user's query.

Respond with ONLY "pass" or "fail" followed by a brief reason.

User Query: ${state.userQuery}
Response: ${state.finalResponse}
${state.sources.length > 0 ? `Sources: ${state.sources.length} sources available` : "No sources available"}`);

    const response = await chatModel.invoke([verificationPrompt]);
    const content = (response.content as string).toLowerCase().trim();

    const passed = content.startsWith("pass");
    graphLog("quickVerify", "Result:", passed ? "PASS" : "FAIL", "model output:", content.slice(0, 100));

    const completedStep: ReasoningStep = {
      step: "quickVerify",
      status: "completed",
      detail: passed ? "Quick verification passed" : `Quick verification failed: ${content.slice(0, 200)}`,
    };

    return {
      verified: passed,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

// === ROUTER: after quick verify ===

function routeAfterQuickVerify(state: AskStateType): "pass" | "fail" {
  return state.verified ? "pass" : "fail";
}

// === ROUTER: after internal knowledge ===

function routeAfterInternalKnowledge(state: AskStateType): "high" | "medium" | "low" {
  const { confidence } = state;

  if (confidence >= CONFIDENCE_HIGH) {
    return "high";
  }
  if (confidence >= CONFIDENCE_MEDIUM) {
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

  try {
    const searchResult = await webSearchTool.invoke({
      query: refinedQuery,
      maxResults: 5,
    });

    const parsed = JSON.parse(searchResult);
    const sources: Source[] = parsed.results?.map((r: any) => ({
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
  const stream = await chatModel.stream(state.messages);
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
  graphLog("comparisonNode", "Generating structured comparison for:", state.userQuery);

  const reasoningStep: ReasoningStep = {
    step: "comparisonNode",
    status: "in_progress",
    detail: "Generating structured comparison",
  };

  const sourcesText = state.sources.length > 0
    ? state.sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}\n${s.excerpt}`).join("\n\n")
    : "";

  return timed("comparisonNode", async () => {
    const structuredModel = chatModel.withStructuredOutput(comparisonOutputSchema, {
      name: "comparisonOutput",
      method: "jsonMode",
    });

    const parsed = await structuredModel.invoke([
      new SystemMessage(`You are a JSON comparison engine. Return a structured comparison object.

CRITICAL:
- criteria is array of {key, label} objects
- items have {name, attributes} where attributes is array of {key, value}
- Every attribute key must match a criteria key
- Use lowercase snake_case for keys
- Values: 1-3 words
- 3-5 criteria

${sourcesText ? `Use these sources:\n${sourcesText}` : "Use your knowledge."}`),
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

    graphLog("comparisonNode", "Normalized output:", JSON.stringify(normalizedResponse).slice(0, 300));

    return {
      finalResponse: `Here's a comparison of ${itemsAsRecord.map((i) => i.name).join(", ")}:\n\n${textSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

async function formNode(state: AskStateType): Promise<Partial<AskStateType>> {
  graphLog("formNode", "Generating structured form for:", state.userQuery);

  const reasoningStep: ReasoningStep = {
    step: "formNode",
    status: "in_progress",
    detail: "Generating configuration form schema",
  };

  const attachmentContext = state.attachments.length > 0
    ? `\n\nAttached files:\n${state.attachments.map(a => `--- ${a.name} ---\n${a.content}`).join("\n")}`
    : "";

  return timed("formNode", async () => {
    const structuredModel = chatModel.withStructuredOutput(formOutputSchema, {
      name: "formOutput",
      method: "jsonMode",
    });

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

${attachmentContext ? `Use attached files for context:${attachmentContext}` : "Use your knowledge to infer sensible defaults."}`),
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

    graphLog("formNode", "Normalized output:", JSON.stringify(normalizedResponse).slice(0, 300));

    return {
      finalResponse: `Here's a configuration form with ${normalizedFields.length} fields:\n\n${fieldSummary}`,
      uiPayloads: [uiPayload],
      confidence: 0.9,
      reasoningSteps: [reasoningStep, completedStep],
    };
  });
}

async function browserAgentNode(state: AskStateType): Promise<Partial<AskStateType>> {
  graphLog("browserAgent", "Starting browser automation for:", state.userQuery);

  const inProgressStep: ReasoningStep = {
    step: "browserAgent",
    status: "in_progress",
    detail: "Initializing browser automation",
  };

  return timed("browserAgent", async () => {
    if (!statefulBrowserAgent.isReady()) {
      graphLog("browserAgent", "Initializing browser agent...");
      await statefulBrowserAgent.initialize();
    }

    const sessionId = await browserSessionManager.createSession();
    graphLog("browserAgent", "Created browser session:", sessionId);

    let fullResponse = "";

    try {
      const stream = statefulBrowserAgent.executeTaskStream(state.userQuery, sessionId);

      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      const completedStep: ReasoningStep = {
        step: "browserAgent",
        status: "completed",
        detail: "Browser automation complete",
      };

      graphLog("browserAgent", "Browser task complete, response length:", fullResponse.length);

      return {
        finalResponse: fullResponse,
        confidence: 0.85,
        reasoningSteps: [inProgressStep, completedStep],
      };
    } catch (error) {
      const errorStep: ReasoningStep = {
        step: "browserAgent",
        status: "error",
        detail: error instanceof Error ? error.message : "Browser automation failed",
      };

      graphError("browserAgent", { sessionId, error });

      return {
        finalResponse: fullResponse || `Browser automation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0,
        reasoningSteps: [inProgressStep, errorStep],
      };
    }
  });
}

// === REPLAN NODE ===

async function replanNode(state: AskStateType): Promise<Partial<AskStateType>> {
  const reasoningStep: ReasoningStep = {
    step: "replan",
    status: "in_progress",
    detail: `Low confidence — refining search approach (attempt ${state.retryCount + 1}/${MAX_RETRIES})`,
  };

  const refinedQuery = state.researchResults.length > 0
    ? `${state.userQuery} more details`
    : state.userQuery;

  const retryCount = state.retryCount + 1;

  const completedStep: ReasoningStep = {
    step: "replan",
    status: "completed",
    detail: `Refined query: "${refinedQuery}"`,
  };

  return {
    userQuery: refinedQuery,
    retryCount,
    reasoningSteps: [reasoningStep, completedStep],
  };
}
