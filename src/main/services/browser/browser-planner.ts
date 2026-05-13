import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createLogger } from "../../utils/logger";
import type { BrowserSubtask } from "./types";

const log = createLogger("BrowserPlanner");

const plannerModel = new ChatOpenAI({
  model: process.env.MODEL || "qwen3.6-plus",
  apiKey: process.env.API_KEY,
  configuration: { baseURL: process.env.BASE_URL },
  temperature: 0.2,
});

const subtaskSchema = z.object({
  id: z.string().describe("Unique identifier for the subtask (e.g., 'navigate', 'fill-form', 'extract-data')"),
  description: z.string().describe("Clear, actionable description of what to do"),
  preconditions: z.string().describe("What must be true before this subtask can execute"),
  postcondition: z.string().describe("What must be true after this subtask completes (used for verification)"),
  assignedSkill: z.string().optional().describe("Skill name to use for this subtask (e.g., 'web-navigation', 'form-filling')"),
});

const planOutputSchema = z.object({
  subtasks: z.array(subtaskSchema).describe("Ordered list of subtasks to execute"),
});

export class BrowserPlannerService {
  async plan(task: string, memoryContext: string, skillContext: string): Promise<BrowserSubtask[]> {
    // Fast-path for simple single-step tasks
    if (this.isSimpleTask(task)) {
      log.info("[BrowserPlanner] Fast-path: simple task, single subtask plan");
      return [this.createSingleSubtask(task)];
    }

    const structuredModel = plannerModel.withStructuredOutput(planOutputSchema, {
      name: "browserPlan",
      method: "jsonMode",
    });

    const skillInstructions = skillContext
      ? `\n\nAVAILABLE SKILLS:\n${skillContext}\n\nUse the assignedSkill field to assign relevant skills to each subtask.`
      : "";

    const memorySection = memoryContext
      ? `\n\n${memoryContext}`
      : "";

    const prompt = new SystemMessage(`You are a browser automation planner. Break the user's task into ordered subtasks with clear preconditions and postconditions.

GUIDELINES:
- Keep subtasks atomic and verifiable
- Each subtask should be completable in 1-5 browser actions
- Postconditions must be checkable (e.g., "page title contains 'Gmail'", "form field 'email' has value")
- Assign skills only when a skill clearly matches the subtask type
- Maximum 10 subtasks total

SKILL ASSIGNMENT HINTS:
- Navigating to URLs → "web-navigation"
- Filling forms, login, signup → "form-filling"  
- Extracting data from page → "data-extraction"
- Scraping multiple pages/lists → "web-scraping"
- Login with credentials → "authentication"
- Screenshots, visual checks → "visual-interaction"
${skillInstructions}${memorySection}

Return ONLY the structured plan object.`);

    try {
      const result = await structuredModel.invoke([
        prompt,
        new HumanMessage(task),
      ]);

      log.info(`[BrowserPlanner] Generated plan: ${result.subtasks.length} subtasks`);
      return result.subtasks.map(s => ({
        ...s,
        maxRetries: 2,
      }));
    } catch (error) {
      log.error("[BrowserPlanner] Planning failed, falling back to single subtask:", error);
      return [this.createSingleSubtask(task)];
    }
  }

  validatePlan(subtasks: BrowserSubtask[]): boolean {
    if (subtasks.length === 0) return false;
    if (subtasks.some(s => !s.description || !s.postcondition)) return false;
    if (subtasks.length > 50) return false; // Sanity limit
    return true;
  }

  private isSimpleTask(task: string): boolean {
    const words = task.split(/\s+/).length;
    return words < 10 && !/\b(then|after|next|finally|first|second|also|and then)\b/i.test(task);
  }

  private createSingleSubtask(task: string): BrowserSubtask {
    return {
      id: "execute-task",
      description: task,
      preconditions: "Browser is ready",
      postcondition: "Task is completed and results are reported to the user",
      maxRetries: 2,
    };
  }
}

export const browserPlanner = new BrowserPlannerService();
