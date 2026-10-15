// @vitest-environment node
/**
 * `web-tools.ts` imports production code only: both factories, the real `text`/`fail`
 * result builders (via the tools), and the real `formatSearchForModel`/`formatFetchForModel`
 * output shape through the mocked barrel. `electron` is mocked because `toolbox.ts`
 * imports `clipboard` at module scope; `services/web` is mocked so no socket opens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  clipboard: { readText: vi.fn(), writeText: vi.fn(), clear: vi.fn() },
}));

vi.mock("../../web", () => ({
  searchWeb: vi.fn(),
  fetchWebPage: vi.fn(),
  formatSearchForModel: vi.fn(),
  formatFetchForModel: vi.fn(),
}));

import type { TextContent } from "@earendil-works/pi-ai";
import { searchWeb, fetchWebPage, formatSearchForModel, formatFetchForModel } from "../../web";
import type { FetchPage, SearchResponse } from "../../web";
import { createPiWebToolbox } from "./web-tools";

const mockedSearch = vi.mocked(searchWeb);
const mockedFetch = vi.mocked(fetchWebPage);
const mockedFormatSearch = vi.mocked(formatSearchForModel);
const mockedFormatFetch = vi.mocked(formatFetchForModel);

const SEARCH_OK: SearchResponse = {
  provider: "exa",
  sources: [{ title: "Example", url: "https://example.com/a", snippet: "s".repeat(300) }],
  notes: [],
};

const FETCH_OK: FetchPage = {
  url: "https://example.com/a",
  finalUrl: "https://example.com/a",
  contentType: "text/html",
  method: "reader",
  text: "page body",
  truncated: false,
  notes: [],
};

function bodyOf(result: { content: Array<{ type: string }> }): string {
  return (result.content[0] as TextContent).text;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSearch.mockResolvedValue(SEARCH_OK);
  mockedFetch.mockResolvedValue(FETCH_OK);
  mockedFormatSearch.mockImplementation((r) => `mocked search via ${r.provider}`);
  mockedFormatFetch.mockImplementation((p) => `mocked fetch ${p.finalUrl}`);
});

describe("Pi web toolbox", () => {
  it("exposes exactly search_web and fetch_page, with no duplicates", () => {
    const tools = createPiWebToolbox();
    expect(tools.map((t) => t.name).sort()).toEqual(["fetch_page", "search_web"]);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it("puts search results in details.sources shaped { url, title, excerpt }", async () => {
    const tool = createPiWebToolbox().find((t) => t.name === "search_web")!;
    const result = await tool.execute("1", { query: "electron release notes" });
    expect(result.details.sources).toEqual([{ url: "https://example.com/a", title: "Example", excerpt: "s".repeat(200) }]);
    expect(bodyOf(result)).toBe("mocked search via exa");
  });

  it("propagates an already-aborted signal on fetch_page and returns rather than throwing", async () => {
    const seen: Array<AbortSignal | undefined> = [];
    mockedFetch.mockImplementation(async (_url, options) => {
      seen.push(options?.signal);
      return FETCH_OK;
    });
    const controller = new AbortController();
    controller.abort();
    const tool = createPiWebToolbox().find((t) => t.name === "fetch_page")!;
    const result = await tool.execute("1", { url: "https://example.com/a" }, controller.signal);
    expect(seen[0]?.aborted).toBe(true);
    expect(result.details.status).toBeTruthy();
    expect(bodyOf(result)).toContain("mocked fetch");
  });

  it("reports a cancelled search as readable text rather than throwing", async () => {
    mockedSearch.mockImplementation(async (req) => {
      if (req.signal?.aborted) throw new Error("aborted");
      return SEARCH_OK;
    });
    const controller = new AbortController();
    controller.abort();
    const tool = createPiWebToolbox().find((t) => t.name === "search_web")!;
    const result = await tool.execute("1", { query: "news" }, controller.signal);
    expect(bodyOf(result).toLowerCase()).toContain("cancel");
  });

  it("never throws on bad search input — missing or empty query is an isError result", async () => {
    const tool = createPiWebToolbox().find((t) => t.name === "search_web")!;
    for (const params of [{}, { query: "" }, { query: "   " }, { query: 42 }]) {
      const result = await tool.execute("1", params);
      expect(result.isError).toBe(true);
      expect(bodyOf(result).toLowerCase()).toContain("query");
    }
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("never throws on bad fetch input — missing or empty url is an isError result", async () => {
    const tool = createPiWebToolbox().find((t) => t.name === "fetch_page")!;
    for (const params of [{}, { url: "" }, { url: "   " }, { url: 42 }]) {
      const result = await tool.execute("1", params);
      expect(result.isError).toBe(true);
      expect(bodyOf(result).toLowerCase()).toContain("url");
    }
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
