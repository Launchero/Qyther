import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { Subtask } from './types';
import { createLogger } from '../../utils/logger';

const log = createLogger('DesktopPlanner');

const subtaskSchema = z.object({
  description: z.string().optional(),
  subtask: z.string().optional(),
  precondition: z.string().optional(),
  postcondition: z.string(),
  maxSteps: z.number().int().min(1).max(15),
});

const subtaskArraySchema = z.array(subtaskSchema);

/**
 * Generates a unique ID for a subtask.
 */
function generateSubtaskId(index: number): string {
  return `subtask-${Date.now()}-${index}`;
}

/**
 * Maps LLM output subtask fields to the runtime Subtask interface.
 */
function toSubtask(raw: z.infer<typeof subtaskSchema>, index: number): Subtask {
  const description = raw.description ?? raw.subtask ?? '';
  return {
    id: generateSubtaskId(index),
    description,
    precondition: raw.precondition || 'none',
    postcondition: raw.postcondition,
    maxSteps: raw.maxSteps,
    status: 'pending',
    requiresBrowser: isBrowserTask(description),
  };
}

/**
 * Detects tasks that can be executed directly without LLM planning.
 * Window management actions (minimize, maximize, restore, close, focus)
 * are deterministic Win32 API calls that don't benefit from decomposition.
 */
const WINDOW_MANAGEMENT_KEYWORDS = [
  /^minimize\s+(the\s+)?window/i,
  /^maximize\s+(the\s+)?window/i,
  /^restore\s+(the\s+)?window/i,
  /^close\s+(the\s+)?window/i,
  /^focus\s+(the\s+)?window/i,
  /^unminimize/i,
  /window.*minimize/i,
  /window.*maximize/i,
  /window.*restore/i,
  /window.*close/i,
  /window.*focus/i,
];

function isSimpleWindowTask(task: string): boolean {
  const cleaned = task.replace(/^Execute subtask:\s*/i, '').replace(/\s*\.?\s*Postcondition:.*$/i, '').trim();
  return WINDOW_MANAGEMENT_KEYWORDS.some(re => re.test(cleaned));
}

/**
 * Heuristic patterns that indicate a subtask requires browser interaction.
 * These include URLs, web-specific actions, and common web task descriptions.
 */
const BROWSER_TASK_PATTERNS = [
  /https?:\/\//i,
  /www\.\w/i,
  /\.(com|org|io|net|gov|edu|app|dev|co\b)/i,
  /\b(navigate\s+to|open\s+(the\s+)?url|go\s+to\s+(the\s+)?url|browse|visit\s+(the\s+)?website)\b/i,
  /\b(web|browser|chrome|edge|firefox|safari)\b/i,
  /\b(download|scrape|extract)\b.*\b(from\s+(the\s+)?web|online|website|site|page|url)\b/i,
  /\b(log\s*in|sign\s*in|authenticate|oauth|login)\b.*\b(to\s+(the\s+)?|on\s+(the\s+)?|website|site|portal|app)\b/i,
  /\b(fill|submit)\b.*\b(form|web\s*form|online\s*form|registration)\b/i,
  /\b(web\s*(search|searching|scrape|scraping|data|automation))\b/i,
  /\b(fetch|retrieve|get)\b.*\b(web\s*page|web\s*content|from\s+url|from\s+website)\b/i,
];

/**
 * Detects whether a subtask description indicates it requires browser automation.
 * Used by the desktop planner to flag subtasks for cross-agent delegation.
 */
export function isBrowserTask(description: string): boolean {
  return BROWSER_TASK_PATTERNS.some(pattern => pattern.test(description));
}

export class DesktopPlanner {
  private model: ChatOpenAI;

  constructor(model?: ChatOpenAI) {
    this.model =
      model ??
      new ChatOpenAI({
        model: process.env.MODEL || 'qwen3.6-plus',
        apiKey: process.env.API_KEY,
        configuration: { baseURL: process.env.BASE_URL },
        temperature: 0.3,
      });
  }

  /**
   * Decompose a desktop task into an ordered list of subtasks.
   * Uses LangChain structured output (withStructuredOutput) with a Zod schema.
   * Falls back to a single-subtask plan if parsing fails.
   * For simple window management tasks, skips LLM entirely.
   */
  async plan(task: string, memoryContext: string): Promise<Subtask[]> {
    if (isSimpleWindowTask(task)) {
      log.info('[Planner] Task detected as simple window management, skipping LLM');
      return this.fallbackPlan(task);
    }

    const memoryPreview =
      memoryContext.length > 200
        ? memoryContext.slice(0, 200) + '...'
        : memoryContext;
    log.info(
      `[Planner] Memory context injected (${memoryContext.length} chars): "${memoryPreview}"`
    );

    const systemPrompt = `Decompose this desktop task into ordered subtasks. Each subtask should be independently executable via GUI automation.

Guidelines:
- 1-5 subtasks maximum
- Each subtask must have a clear postcondition that can be verified
- Subtasks should be ordered (later subtasks may depend on earlier ones)
- maxSteps: 10 for simple subtasks, 15 for complex ones
- Return only valid JSON, no other text`;

    const userPrompt = `Memory context: ${memoryContext}\nTask: ${task}`;

    const structuredLlm = this.model.withStructuredOutput(subtaskArraySchema, {
      name: 'subtask_plan',
    });

    const start = Date.now();

    let rawOutput: unknown;
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Planner LLM call timed out after 30s')), 30000)
      );
      rawOutput = await Promise.race([
        structuredLlm.invoke([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]),
        timeoutPromise,
      ]);
    } catch (err) {
      log.error(
        `[Planner] LLM call failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return this.fallbackPlan(task);
    }

    const latency = Date.now() - start;
    log.info(`[Planner] LLM call completed in ${latency}ms`);

    log.info(
      `[Planner] Raw LLM response: ${JSON.stringify(rawOutput).slice(0, 500)}${JSON.stringify(rawOutput).length > 500 ? '...' : ''}`
    );

    const subtasks = this.parseResponse(rawOutput, task);
    log.info(
      `[Planner] Generated ${subtasks.length} subtasks for "${task.slice(0, 60)}"`
    );

    subtasks.forEach((st, i) => {
      log.info(
        `[Planner] Subtask ${i + 1}/${subtasks.length}: "${st.description}" - precondition: ${st.precondition}, postcondition: "${st.postcondition}"`
      );
    });

    return subtasks;
  }

  /**
   * Validate that a plan is well-formed.
   * Checks max total steps <= 50 and that each subtask has non-empty
   * description and postcondition.
   */
  validatePlan(subtasks: Subtask[]): boolean {
    if (subtasks.length === 0) {
      log.warn('[Planner] Plan validation: FAILED (empty plan)');
      return false;
    }

    let totalSteps = 0;
    for (let i = 0; i < subtasks.length; i++) {
      const st = subtasks[i];

      if (!st.description.trim()) {
        log.warn(
          `[Planner] Plan validation: FAILED (subtask ${i + 1} has empty description)`
        );
        return false;
      }

      if (!st.postcondition.trim()) {
        log.warn(
          `[Planner] Plan validation: FAILED (subtask ${i + 1} has empty postcondition)`
        );
        return false;
      }

      totalSteps += st.maxSteps;
    }

    if (totalSteps > 50) {
      log.warn(
        `[Planner] Plan validation: FAILED (total steps ${totalSteps} exceeds limit of 50)`
      );
      return false;
    }

    log.info(
      `[Planner] Plan validation: PASSED (total steps=${totalSteps}, chain OK)`
    );
    return true;
  }

  // ── Private helpers ─────────────────────────────────────────────

  private parseResponse(raw: unknown, task: string): Subtask[] {
    try {
      const parsed = subtaskArraySchema.parse(raw);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return this.fallbackPlan(task);
      }

      return parsed.map((item, index) => toSubtask(item, index));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch {
      log.info(
        `[Planner] Parse failed, falling back to single subtask: raw output was "${JSON.stringify(raw).slice(0, 500)}"`
      );
      return this.fallbackPlan(task);
    }
  }

  private fallbackPlan(task: string): Subtask[] {
    log.info(
      `[Planner] Fallback: wrapping original task as single subtask`
    );
    const cleanTask = this.extractCleanTask(task);
    return [
      {
        id: generateSubtaskId(0),
        description: cleanTask,
        precondition: 'none',
        postcondition: `Task "${cleanTask.slice(0, 80)}" is completed`,
        maxSteps: 15,
        status: 'pending',
        requiresBrowser: isBrowserTask(cleanTask),
      },
    ];
  }

  /**
   * Extracts the clean task description from potentially bloated input
   * that includes conversation context or other prefixes.
   */
  private extractCleanTask(raw: string): string {
    // Handle "Execute subtask: ... . Postcondition: ..." wrapper
    if (raw.startsWith('Execute subtask:')) {
      const withoutPrefix = raw.slice('Execute subtask:'.length).trim();
      const postconditionIdx = withoutPrefix.indexOf('. Postcondition:');
      const inner = postconditionIdx !== -1
        ? withoutPrefix.slice(0, postconditionIdx).trim()
        : withoutPrefix.trim();
      return this.stripConversationContext(inner);
    }
    return this.stripConversationContext(raw);
  }

  /**
   * Strips "CONVERSATION CONTEXT (for reference):..." and "TASK: ..." prefixes.
   */
  private stripConversationContext(raw: string): string {
    const taskMatch = raw.match(/TASK:\s*(.+)$/);
    if (taskMatch) {
      return taskMatch[1].trim();
    }
    const conversationIdx = raw.indexOf('CONVERSATION CONTEXT');
    if (conversationIdx !== -1) {
      const afterContext = raw.slice(conversationIdx);
      const taskMatch = afterContext.match(/TASK:\s*(.+)$/);
      if (taskMatch) {
        return taskMatch[1].trim();
      }
    }
    return raw.trim();
  }
}

/**
 * Singleton instance of the DesktopPlanner.
 */
export const desktopPlanner = new DesktopPlanner();
