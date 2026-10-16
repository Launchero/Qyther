import { describe, it, expect, beforeEach, vi } from "vitest";

// Fresh import per case keeps the stubbed env from leaking between them; the
// provider itself no longer depends on load order (see the env-reading comment
// in provider.ts), which the last case in this file pins.
async function loadProvider(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  vi.resetModules();
  return await import("./provider");
}

const BASE = "https://example.invalid/v1";

describe("pi provider bootstrap", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a chat model for a custom OpenAI-compatible baseURL", async () => {
    const p = await loadProvider({ MODEL: "qwen3.6-plus", API_KEY: "sk-test", BASE_URL: BASE });
    const model = p.getPiModel();
    expect(model).toBeDefined();
    // openai-completions, NOT openai-responses — the endpoint is Chat Completions only.
    expect(model!.api).toBe("openai-completions");
    expect(model!.id).toBe("qwen3.6-plus");
    expect(model!.baseUrl).toBe(BASE);
  });

  it("reports unconfigured without a key and baseURL", async () => {
    const p = await loadProvider({ MODEL: "", API_KEY: undefined, BASE_URL: undefined });
    expect(p.isPiConfigured()).toBe(false);
  });

  it("declares the non-OpenAI compat flags the endpoint cannot honour", async () => {
    const p = await loadProvider({ MODEL: "m", API_KEY: "k", BASE_URL: BASE });
    const compat = p.getPiModel()!.compat;
    expect(compat?.supportsStore).toBe(false);
    expect(compat?.supportsDeveloperRole).toBe(false);
    expect(compat?.supportsStrictMode).toBe(false);
  });

  it("falls back to the repo's default model when MODEL is unset", async () => {
    const p = await loadProvider({ MODEL: "", API_KEY: "k", BASE_URL: BASE });
    expect(p.getPiModel()!.id).toBe("qwen3.6-plus");
  });

  it("returns a stable streamFn across calls", async () => {
    const p = await loadProvider({ MODEL: "m", API_KEY: "k", BASE_URL: BASE });
    expect(p.getPiStreamFn()).toBe(p.getPiStreamFn());
  });

  it("reads env at the call, not at module evaluation", async () => {
    // The shipped defect: `main.ts` runs dotenv after this module had already
    // captured `process.env` at import time, so a correctly configured machine
    // reported "no model is configured". Importing with no env and populating it
    // afterwards is exactly that order.
    const p = await loadProvider({ MODEL: undefined, API_KEY: undefined, BASE_URL: undefined });
    expect(p.isPiConfigured()).toBe(false);

    vi.stubEnv("API_KEY", "sk-late");
    vi.stubEnv("BASE_URL", BASE);
    vi.stubEnv("MODEL", "qwen3.6-plus");

    expect(p.isPiConfigured()).toBe(true);
    expect(p.getPiModel()?.baseUrl).toBe(BASE);
  });
});