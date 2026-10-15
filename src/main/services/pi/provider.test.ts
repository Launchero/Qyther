import { describe, it, expect, beforeEach, vi } from "vitest";

// The provider reads env at module load, so it must be imported fresh per case.
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
});