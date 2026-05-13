/**
 * Document Agent Planner — LLM-based hierarchical planning for document tasks.
 *
 * Decomposes natural-language document requests into ordered subtasks with
 * format-specific postconditions and cross-agent delegation flags.
 */

import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { DocumentSubtask, DocumentFormat } from './types';
import { createLogger } from '../../utils/logger';

const log = createLogger('DocumentPlanner');

// ── Structured Output Schema ─────────────────────────────────────────────────

const documentSubtaskSchema = z.object({
  description: z.string(),
  postcondition: z.string(),
  format: z.enum(['docx', 'pptx', 'xlsx']),
  contentSpec: z.record(z.string(), z.unknown()).optional().describe("Format-specific content specification (sections for docx, slides for pptx, sheets for xlsx)"),
  requiresBrowser: z.boolean().describe("True if this subtask requires web research or online data"),
  requiresDesktop: z.boolean().describe("True if this subtask requires desktop app interaction (opening app, clicking, etc.)"),
  maxSteps: z.number().int().min(1).max(10),
});

const documentPlanSchema = z.array(documentSubtaskSchema);

type RawSubtask = z.infer<typeof documentSubtaskSchema>;

// ── Heuristic Detectors ──────────────────────────────────────────────────────

const BROWSER_NEEDED_PATTERNS = [
  /\b(research|find|look up|search|browse|online|web|website|current|latest|recent|today|now|trending)\b/i,
  /\b(data|information|stats|statistics|facts|figures)\b.*\b(from|about|on)\b.*\b(web|site|online|internet)\b/i,
  /\b(scrape|extract|fetch|retrieve)\b.*\b(from\s+)?(url|website|web|site|page)\b/i,
  /https?:\/\//i,
];

const DESKTOP_NEEDED_PATTERNS = [
  /\b(open|launch|start|run)\b.*\b(app|application|program|excel|word|powerpoint|ppt|doc|sheet)\b/i,
  /\b(click|press|type|interact)\b.*\b(in\s+|on\s+|the\s+)?(app|window|program|excel|word)\b/i,
  /\b(send|email|share|upload)\b.*\b(via|through|using)\b.*\b(browser|app|desktop)\b/i,
  /\b(save|download)\b.*\b(to\s+desktop|to\s+folder|to\s+downloads)\b/i,
];

function needsBrowser(task: string): boolean {
  return BROWSER_NEEDED_PATTERNS.some(p => p.test(task));
}

function needsDesktop(task: string): boolean {
  return DESKTOP_NEEDED_PATTERNS.some(p => p.test(task));
}

function detectFormat(task: string): DocumentFormat | null {
  const lower = task.toLowerCase();
  if (/\b(powerpoint|presentation|pptx?|slide|deck)\b/i.test(lower)) return 'pptx';
  if (/\b(excel|spreadsheet|xls[xm]?|workbook|budget|table|chart.*data)\b/i.test(lower)) return 'xlsx';
  if (/\b(word|docx?|document|report|proposal|letter|essay|memo|write.*doc)\b/i.test(lower)) return 'docx';
  return null;
}

// ── Planner Class ────────────────────────────────────────────────────────────

export class DocumentPlanner {
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
   * Decompose a document task into an ordered list of subtasks.
   * Uses LangChain structured output (withStructuredOutput) with Zod schema.
   * Falls back to a single-subtask plan if parsing fails.
   */
  async plan(task: string, memoryContext: string, detectedFormat?: DocumentFormat): Promise<DocumentSubtask[]> {
    const memoryPreview = memoryContext.length > 200 ? memoryContext.slice(0, 200) + '...' : memoryContext;
    const formatHint = detectedFormat ? `The user likely wants a ${detectedFormat.toUpperCase()} file.` : 'Infer the format from the task description.';

    log.info(`[DocumentPlanner] Planning: "${task.slice(0, 80)}" (format hint: ${detectedFormat ?? 'auto'})`);

    const systemPrompt = `Decompose this document creation/editing task into ordered subtasks. Each subtask should be independently executable.

Guidelines:
- 1-5 subtasks maximum
- Each subtask must have a clear postcondition that can be verified
- Subtasks should be ordered (later subtasks may depend on earlier ones)
- maxSteps: 5 for simple subtasks, 10 for complex ones
- Set requiresBrowser=true if the subtask needs web research or online data
- Set requiresDesktop=true if the subtask needs desktop app interaction (opening apps, clicking UI)
- Include contentSpec with format-specific structure (e.g., {"sections": [{"heading": "...", "content": "..."}]} for docx)
- Return only valid JSON, no other text

Format hints:
- docx: Documents, reports, proposals, letters, essays
- pptx: Presentations, slide decks, pitches
- xlsx: Spreadsheets, budgets, tables, charts, data analysis

${formatHint}`;

    const userPrompt = `Memory context: ${memoryPreview}\nTask: ${task}`;

    const structuredLlm = this.model.withStructuredOutput(documentPlanSchema, {
      name: 'document_plan',
    });

    const start = Date.now();

    let rawOutput: unknown;
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Document planner LLM call timed out after 30s')), 30000)
      );
      rawOutput = await Promise.race([
        structuredLlm.invoke([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]),
        timeoutPromise,
      ]);
    } catch (err) {
      log.error(`[DocumentPlanner] LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
      return this.fallbackPlan(task, detectedFormat);
    }

    const latency = Date.now() - start;
    log.info(`[DocumentPlanner] LLM call completed in ${latency}ms`);

    const subtasks = this.parseResponse(rawOutput, task, detectedFormat);
    log.info(`[DocumentPlanner] Generated ${subtasks.length} subtasks`);

    subtasks.forEach((st, i) => {
      log.info(`[DocumentPlanner] Subtask ${i + 1}: "${st.description}" (${st.format}, browser=${st.requiresBrowser}, desktop=${st.requiresDesktop})`);
    });

    return subtasks;
  }

  /**
   * Validate that a document plan is well-formed.
   */
  validatePlan(subtasks: DocumentSubtask[]): boolean {
    if (subtasks.length === 0) return false;

    let totalSteps = 0;
    for (const st of subtasks) {
      if (!st.description.trim()) return false;
      if (!st.postcondition.trim()) return false;
      totalSteps += st.maxSteps;
    }

    if (totalSteps > 50) return false;
    return true;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private parseResponse(raw: unknown, task: string, detectedFormat?: DocumentFormat): DocumentSubtask[] {
    try {
      const parsed = documentPlanSchema.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return this.fallbackPlan(task, detectedFormat);
      }
      return parsed.map((item, index) => this.toSubtask(item, index));
    } catch {
      log.info(`[DocumentPlanner] Parse failed, falling back to single subtask`);
      return this.fallbackPlan(task, detectedFormat);
    }
  }

  private toSubtask(raw: RawSubtask, index: number): DocumentSubtask {
    return {
      id: `doc-subtask-${Date.now()}-${index}`,
      description: raw.description,
      precondition: index === 0 ? 'none' : `Previous subtask(s) completed`,
      postcondition: raw.postcondition,
      maxSteps: raw.maxSteps,
      status: 'pending',
      format: raw.format,
      requiresBrowser: raw.requiresBrowser || needsBrowser(raw.description),
      requiresDesktop: raw.requiresDesktop || needsDesktop(raw.description),
      contentSpec: raw.contentSpec,
    };
  }

  private fallbackPlan(task: string, detectedFormat?: DocumentFormat): DocumentSubtask[] {
    const format = detectedFormat || detectFormat(task) || 'docx';
    log.info(`[DocumentPlanner] Fallback: wrapping as single subtask (${format})`);

    const cleanTask = this.extractCleanTask(task);

    return [
      {
        id: `doc-subtask-${Date.now()}-0`,
        description: cleanTask,
        precondition: 'none',
        postcondition: `Document "${cleanTask.slice(0, 80)}" is created in ${format} format`,
        maxSteps: 10,
        status: 'pending',
        format,
        requiresBrowser: needsBrowser(cleanTask),
        requiresDesktop: needsDesktop(cleanTask),
        contentSpec: {},
      },
    ];
  }

  private extractCleanTask(raw: string): string {
    const taskMatch = raw.match(/TASK:\s*(.+)$/m);
    if (taskMatch) return taskMatch[1].trim();
    return raw.trim();
  }
}

export const documentPlanner = new DocumentPlanner();
