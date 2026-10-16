import { createModels, createProvider, hasApi } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { createLogger } from "../../utils/logger";
import type { ApiKeyAuth, Model, MutableModels } from "@earendil-works/pi-ai";

const log = createLogger("Pi");

/**
 * Not "openai": the endpoint behind BASE_URL is a non-OpenAI OpenAI-compatible
 * server (Qwen by default). A distinct id keeps it addressable via
 * `models.getModel(PROVIDER_ID, id)` and out of Pi's built-in OpenAI catalog.
 */
export const PROVIDER_ID = "qyther";

/**
 * Env is read at the point of use, never at module evaluation.
 *
 * `main.ts` imports `dotenv/config` first precisely so that nothing reads
 * `process.env` before it is populated, but the bundled main process evaluates
 * module bodies in dependency order and this file is reached through
 * `handlers.ts → chat-handlers.ts → langchain/agent.ts`, which is not a guarantee.
 * A module-scope `const API_KEY = process.env.API_KEY` here measured `undefined`
 * while `process.env.API_KEY` was already set, so `isPiConfigured()` reported false
 * and Ask mode rendered its not-configured card on a correctly configured machine.
 */
const modelId = (): string => process.env.MODEL || "qwen3.6-plus";
const apiKey = (): string | undefined => process.env.API_KEY;
const baseUrl = (): string | undefined => process.env.BASE_URL;

/**
 * Qyther already resolves the key through its own api-config settings, so this
 * auth is ambient-only: no `login`, which would be a second config surface.
 */
const API_KEY_AUTH: ApiKeyAuth = {
  name: "Qyther endpoint API key",
  resolve: async ({ signal }) => {
    signal.throwIfAborted();
    const key = apiKey();
    if (!key) return undefined;
    return { auth: { apiKey: key }, source: "API_KEY" };
  },
};

/**
 * `openaiProvider()` in Pi returns Provider<"openai-responses"> — the Responses
 * API, which a Chat-Completions-only proxy does not speak. The completions path
 * is the `openai-completions` API, which is what deepseekProvider() uses.
 */
const buildProvider = () =>
  createProvider({
    id: PROVIDER_ID,
    name: "Qyther endpoint",
    baseUrl: baseUrl(),
    auth: { apiKey: API_KEY_AUTH },
    api: openAICompletionsApi(),
    models: [buildModel(modelId())],
  });

function buildModel(id: string) {
  return {
    id,
    name: id,
    api: "openai-completions" as const,
    provider: PROVIDER_ID,
    type: "chat" as const,
    // Model-level baseUrl is required by Model even though the provider also
    // carries one; it inherits the same env value.
    baseUrl: baseUrl() ?? "",
    reasoning: false,
    input: ["text"] as ("image" | "text")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // Unknown for a self-hosted endpoint. Generous so the loop never truncates on a
    // false ceiling; the agent loop's own maxSteps stays the real bound.
    contextWindow: 128000,
    maxTokens: 8192,
    // A non-OpenAI proxy implements none of these. Declaring them false keeps Pi
    // from sending `store`, the `developer` role, or `strict` tool schemas.
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsStrictMode: false,
      maxTokensField: "max_tokens" as const,
    },
  };
}

let models: ReturnType<typeof createModels> | null = null;
let streamFn: MutableModels["streamSimple"] | null = null;

/**
 * Lazily built, not a module-load side effect: importing this file must stay
 * free, because the Pi runtime is spike-gated and cold start is budgeted.
 */
export function getPiModels() {
  if (!models) {
    models = createModels();
    models.setProvider(buildProvider());
    log.info("Pi models ready", { provider: PROVIDER_ID, model: modelId(), hasKey: isPiConfigured() });
  }
  return models;
}

/** `getModel` is not narrowed by the provider's TApi, so narrow with `hasApi`. */
export function getPiModel(): Model<"openai-completions"> | undefined {
  const model = getPiModels().getModel(PROVIDER_ID, modelId());
  return model && hasApi(model, "openai-completions") ? model : undefined;
}

/**
 * Memoised, not just bound: `Agent` takes `streamFn` in its constructor, so handing
 * every instance a distinct function reference would defeat identity comparisons
 * (and any future per-transport memo keyed on it).
 */
export function getPiStreamFn() {
  if (!streamFn) streamFn = getPiModels().streamSimple.bind(getPiModels());
  return streamFn;
}

export function isPiConfigured(): boolean {
  return Boolean(apiKey() && baseUrl());
}