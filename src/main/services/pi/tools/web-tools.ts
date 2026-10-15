/**
 * Pi-native web toolbox: the `web` family (`search_web`, `fetch_page`).
 *
 * Thin Pi wrappers over the already-migrated `services/web/` substrate, which stays
 * Electron-free and LangChain-free — this file imports only its public barrel
 * (`searchWeb`, `fetchWebPage`, `formatSearchForModel`, `formatFetchForModel`).
 *
 * Contract, matching the old `externalSearchNode` behaviour the graph had:
 * - a provider failure is a model-facing note, never a throw (`searchWeb` returns
 *   `provider: 'none'` with notes; that text is returned as-is, not as an error);
 * - every source the chain actually returned rides in `details.sources` so the chat
 *   pump can ship citations (`ask-events.ts` reads it off `tool_execution_end`);
 * - the caller's `AbortSignal` is threaded through, and an abort surfaces as readable
 *   text rather than a throw — tools never throw.
 */
import { Type, StringEnum } from "@earendil-works/pi-ai";

import type { Source } from "../../../../shared/ipc/source";
import { fetchWebPage, formatFetchForModel, formatSearchForModel, searchWeb } from "../../web";
import type { SearchSource } from "../../web";
import { fail, text, type PiTool } from "../toolbox";

/** `SearchSource` → the wire `Source` the renderer's `SourcesPanel` reads. */
function toSources(sources: SearchSource[]): Source[] {
  return sources.map((s) => ({ url: s.url, title: s.title, excerpt: s.snippet.slice(0, 200) }));
}

export function searchWebTool(): PiTool {
  return {
    name: "search_web",
    label: "Web search",
    description:
      "Search the live web for current events, documentation, prices, or anything past training cutoff. Returns ranked sources with snippets. Prefer reading the page with fetch_page over answering from snippets.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      limit: Type.Optional(Type.Number({ description: "Max sources to return (default: 5)" })),
      recency: Type.Optional(
        StringEnum(["day", "week", "month", "year"], { description: "Freshness window for time-sensitive queries" }),
      ),
    }),
    async execute(_id, params, signal) {
      const { query, limit, recency } = (params ?? {}) as { query?: string; limit?: number; recency?: "day" | "week" | "month" | "year" };
      try {
        if (typeof query !== "string" || query.trim().length === 0) {
          return fail("Web search failed", new Error("query must be a non-empty string"));
        }
        const response = await searchWeb({ query, limit: limit ?? 5, recency, signal });
        return text(formatSearchForModel(response), "complete", { sources: toSources(response.sources) });
      } catch (e) {
        if (signal?.aborted) return text("Web search cancelled.", "error");
        return fail("Web search failed", e);
      }
    },
  };
}

export function fetchPageTool(): PiTool {
  return {
    name: "fetch_page",
    label: "Fetch page",
    description:
      "Read one web page and return its text. Use after search_web to read what a result actually says rather than answering from its snippet.",
    parameters: Type.Object({
      url: Type.String({ description: "The http(s) URL to read" }),
    }),
    async execute(_id, params, signal) {
      const { url } = (params ?? {}) as { url?: string };
      try {
        if (typeof url !== "string" || url.trim().length === 0) {
          return fail("Fetch failed", new Error("url must be a non-empty string"));
        }
        const page = await fetchWebPage(url, { signal });
        const sources: Source[] =
          page.method === "failed"
            ? []
            : [{ url: page.finalUrl, title: page.finalUrl, excerpt: page.text.slice(0, 200) }];
        return text(formatFetchForModel(page), "complete", { sources });
      } catch (e) {
        if (signal?.aborted) return text("Fetch cancelled.", "error");
        return fail("Fetch failed", e);
      }
    },
  };
}

/** The `web` family: exactly the two names `ask-prompt.ts` advertises. */
export function createPiWebToolbox(): PiTool[] {
  return [searchWebTool(), fetchPageTool()];
}
