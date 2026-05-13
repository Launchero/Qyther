import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createLogger } from "../../utils/logger";
import type { BrowserSubtask, BrowserRecoveryAction, BrowserVerificationResult } from "./types";

const log = createLogger("BrowserRecovery");

const recoveryModel = new ChatOpenAI({
  model: process.env.MODEL || "qwen3.6-plus",
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
  temperature: 0.1,
});

const recoveryActionSchema = z.object({
  strategy: z.enum(["retry", "alternative", "replan", "skip", "abort"]).describe("Recovery strategy to use"),
  reason: z.string().describe("Explanation of why this strategy was chosen"),
  suggestedApproach: z.string().optional().describe("Optional suggested approach for the recovery"),
});

export class BrowserRecoveryService {
  async recover(
    failedSubtask: BrowserSubtask | undefined,
    error: string,
    verificationResult: BrowserVerificationResult | null,
    recoveryCount: number,
  ): Promise<BrowserRecoveryAction> {
    // Max recovery attempts: 3
    if (recoveryCount >= 3) {
      log.warn("[BrowserRecovery] Max recovery attempts reached, aborting");
      return {
        strategy: "abort",
        reason: `Max recovery attempts (${recoveryCount}) exceeded for subtask: ${failedSubtask?.description || "unknown"}`,
      };
    }

    // If no subtask, skip
    if (!failedSubtask) {
      return {
        strategy: "skip",
        reason: "No subtask available to recover",
      };
    }

    // For low recovery counts, prefer retry
    if (recoveryCount === 0) {
      log.info("[BrowserRecovery] First failure, retrying");
      return {
        strategy: "retry",
        reason: "First failure, retry with same approach",
      };
    }

    // Use LLM for more sophisticated recovery decisions
    const structuredModel = recoveryModel.withStructuredOutput(recoveryActionSchema, {
      name: "recoveryAction",
      method: "jsonMode",
    });

    const prompt = new SystemMessage(`You are a browser automation recovery specialist. Given a failed subtask, the error, and the current recovery count, recommend the best recovery strategy.

STRATEGIES:
- retry: Re-execute the same subtask (good for transient failures)
- alternative: Try a different approach/tools for the same goal
- replan: Re-plan the entire task from scratch
- skip: Skip this subtask and continue with the rest
- abort: Terminate the entire execution

Current recovery count: ${recoveryCount}
Subtask: ${failedSubtask.description}
Error: ${error}
Verification Result: ${verificationResult ? JSON.stringify(verificationResult) : "None"}

Recommend the most appropriate strategy.`);

    try {
      const result = await structuredModel.invoke([
        prompt,
        new HumanMessage(`Failed subtask: ${failedSubtask.description}\nError: ${error}`),
      ]);

      return result as BrowserRecoveryAction;
    } catch (error) {
      log.error("[BrowserRecovery] LLM recovery decision failed, falling back to retry:", error);
      // Conservative fallback: retry on second attempt, skip on third
      if (recoveryCount === 1) {
        return {
          strategy: "retry",
          reason: "Second failure, retrying once more",
        };
      }
      return {
        strategy: "skip",
        reason: "Third failure, skipping subtask",
      };
    }
  }
}

export const browserRecovery = new BrowserRecoveryService();
