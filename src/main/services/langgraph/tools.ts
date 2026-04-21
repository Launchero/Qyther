import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const webSearchTool = tool(
  async ({ query, maxResults }) => {
    try {
      const url = new URL("https://html.duckduckgo.com/html/");
      url.searchParams.set("q", query);
      
      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      if (!response.ok) {
        return JSON.stringify({ error: "Search failed", status: response.status });
      }
      
      const html = await response.text();
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gis;
      let match;
      
      while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        results.push({
          title: match[2].replace(/<[^>]*>/g, "").trim(),
          url: match[1],
          snippet: match[3].replace(/<[^>]*>/g, "").trim(),
        });
      }
      
      if (results.length === 0) {
        const altRegex = /<a[^>]*href="\/l\/\?uddg=([^"&]*)/gi;
        while ((match = altRegex.exec(html)) !== null && results.length < maxResults) {
          const titleEl = html.substring(match.index).match(/class="result__a"[^>]*>(.*?)<\/a>/i);
          const snippetEl = html.substring(match.index).match(/class="result__snippet"[^>]*>(.*?)<\/a>/is);
          
          results.push({
            title: titleEl ? titleEl[1].replace(/<[^>]*>/g, "").trim() : "Unknown",
            url: decodeURIComponent(match[1]),
            snippet: snippetEl ? snippetEl[1].replace(/<[^>]*>/g, "").trim() : "",
          });
        }
      }
      
      return JSON.stringify({
        query,
        resultsCount: results.length,
        results,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown search error",
        query,
      });
    }
  },
  {
    name: "web_search",
    description: "Search the web for current information. Use this to find current facts, news, or information not in your training data.",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().default(5).describe("Maximum number of results to return"),
    }),
  }
);
