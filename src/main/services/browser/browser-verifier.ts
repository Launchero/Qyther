import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createLogger } from "../../utils/logger";
import { statefulBrowserAgent } from "./stateful-browser-agent";
import type { BrowserSubtask, BrowserVerificationResult } from "./types";

const log = createLogger("BrowserVerifier");

const verifierModel = new ChatOpenAI({
  model: process.env.MODEL || "qwen3.6-plus",
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
  temperature: 0.1,
});

const verificationSchema = z.object({
  passed: z.boolean().describe("Whether the postcondition is met"),
  score: z.number().min(0).max(1).describe("Confidence score 0-1"),
  signals: z.array(z.string()).describe("Evidence signals supporting the verdict"),
  message: z.string().describe("Brief explanation of the verification result"),
});

export class BrowserVerifierService {
  async verifyPostcondition(
    subtask: BrowserSubtask,
    _sessionId: string,
  ): Promise<BrowserVerificationResult> {
    log.info(`[BrowserVerifier] Verifying postcondition for subtask: "${subtask.description}"`);
    log.info(`[BrowserVerifier] Postcondition: "${subtask.postcondition}"`);

    // Step 1: Get current page state via browser_snapshot
    let snapshotContent = "";
    try {
      const allTools = await statefulBrowserAgent.getMcpTools();
      const snapshotTool = allTools.find((t: any) => t.name === "browser_snapshot");
      if (snapshotTool) {
        const snapshotResult = await snapshotTool.invoke({});
        snapshotContent = typeof snapshotResult === "string" ? snapshotResult : JSON.stringify(snapshotResult);
        log.info(`[BrowserVerifier] Snapshot retrieved: ${snapshotContent.length} chars`);
      }
    } catch (error) {
      log.warn("[BrowserVerifier] Failed to get snapshot, using empty context:", error);
    }

    // Step 2: LLM-based verification against postcondition
    const structuredModel = verifierModel.withStructuredOutput(verificationSchema, {
      name: "browserVerification",
      method: "jsonMode",
    });

    const prompt = new SystemMessage(`You are a browser automation verifier. Given the current page state (ARIA snapshot) and the expected postcondition, determine if the subtask completed successfully.

POSTCONDITION: ${subtask.postcondition}

Evaluate the page state against the postcondition. Consider:
- If the postcondition mentions specific text, check if it appears in the snapshot
- If it mentions a page state (e.g., "logged in"), look for indicators
- If it mentions a form field, check its value

Respond with structured verification result.`);

    try {
      const result = await structuredModel.invoke([
        prompt,
        new HumanMessage(`Current page state (ARIA snapshot):\n\n${snapshotContent}\n\nExpected postcondition: ${subtask.postcondition}`),
      ]);

      log.info(`[BrowserVerifier] Verification: passed=${result.passed}, score=${result.score.toFixed(2)}`);

      return {
        passed: result.passed,
        score: result.score,
        signals: result.signals,
        message: result.message,
      };
    } catch (error) {
      log.error("[BrowserVerifier] Verification failed, returning conservative result:", error);
      // Conservative fallback: assume partial success
      return {
        passed: false,
        score: 0.4,
        signals: ["Verification failed due to error"],
        message: `Could not verify postcondition: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}

export const browserVerifier = new BrowserVerifierService();
