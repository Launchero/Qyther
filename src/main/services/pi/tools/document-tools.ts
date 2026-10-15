/**
 * Pi-native document toolbox: the `document` family
 * (`create_docx`, `create_pptx`, `create_xlsx`, `read_document`, `modify_document`).
 *
 * Thin Pi wrappers over the two surviving document modules. `document-executor.ts`
 * writes real office files into the `~/Documents` sandbox and `document-verifier.ts`
 * re-parses them back — both are deterministic, neither makes an LLM call, which is
 * why they survived the graph deletion while the planner/recovery ladders did not.
 *
 * Contract, matching the desktop/web/ui families:
 * - tools never throw: a bad path, an unreadable file, or a failed write returns
 *   `fail(...)` for the model to read and recover from;
 * - every result carries `details.status`;
 * - the three create tools and `modify_document` set `details.verifies`, which is the
 *   flag the ask agent's `afterToolCall` hook reads before running `verifyDocument`
 *   and feeding the verdict back with `agent.steer()` — the same shape as the desktop
 *   pixel-verifier hook, minus the screenshot baseline;
 * - no path ever escapes `~/Documents`: `resolveSandboxed` rejects traversal and
 *   absolute escapes, and the creates take no path at all, only a title.
 */
import * as path from "node:path";

import { Type, StringEnum } from "@earendil-works/pi-ai";

import { executeDocumentSubtask, getDocumentsFolder } from "../../document/document-executor";
import { verifyDocument } from "../../document/document-verifier";
import type { DocumentExecutorResult, DocumentFormat, DocumentSubtask } from "../../document/types";
import { extractDocument } from "../../utils/document-loader";
import { createLogger } from "../../../utils/logger";
import { fail, text, type PiTool } from "../toolbox";

const log = createLogger("DocumentExecutor");

/** Formats the executor can write. Reads accept whatever the loader parses. */
const WRITABLE_FORMATS: readonly DocumentFormat[] = ["docx", "pptx", "xlsx"];

/** Cap on text handed back to the model (`read_document`) or merged into a new file. */
const READ_TRUNCATE_AT = 6000;
const MERGE_TRUNCATE_AT = 8000;

let toolSeq = 0;

/** Build the `DocumentSubtask` the executor and the verifier both read. */
function toSubtask(format: DocumentFormat, title: unknown, contentSpec: Record<string, unknown>): DocumentSubtask {
  toolSeq += 1;
  const clean = typeof title === "string" ? title.trim() : "";
  const description = clean.length > 0 ? clean : `document tool request ${toolSeq}`;
  return {
    id: `pi-doc-${Date.now()}-${toolSeq}`,
    description,
    precondition: "none",
    postcondition: description,
    maxSteps: 5,
    status: "executing",
    format,
    requiresBrowser: false,
    requiresDesktop: false,
    contentSpec,
  };
}

/** Keep every user-supplied path inside the `~/Documents` sandbox. */
function resolveSandboxed(filePath: unknown): { abs: string } | { error: string } {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return { error: "filePath must be a non-empty string" };
  }
  const root = path.resolve(getDocumentsFolder());
  const abs = path.resolve(root, filePath.trim());
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return { error: `path escapes the Documents folder (${root})` };
  }
  return { abs };
}

/** Non-empty-string check for the one scalar every tool needs. */
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Required-array guard shared by the create tools: missing or empty reads as a model error. */
function missingList(value: unknown): boolean {
  return !Array.isArray(value) || value.length === 0;
}

/** The loader's three failure markers, same prefixes `verifyDocument` checks. */
function loaderFailed(content: string): boolean {
  return content.startsWith("[Error") || content.startsWith("[Format") || content.startsWith("[File");
}

/** Run the executor, then verify the bytes on disk. Shared by the three creates. */
async function createAndVerify(format: DocumentFormat, title: unknown, contentSpec: Record<string, unknown>) {
  const subtask = toSubtask(format, title, contentSpec);
  let result: DocumentExecutorResult;
  try {
    result = await executeDocumentSubtask(subtask, subtask.description);
  } catch (e) {
    return fail(`Create ${format} failed`, e, { verifies: true });
  }
  if (!result.success || !result.filePath) {
    return fail(`Create ${format} failed`, new Error(result.message), { verifies: true });
  }
  return reportVerified(`Created ${format} file`, result, subtask);
}

/** Shared tail: re-parse the written file and hand the verdict back as text. */
async function reportVerified(verb: string, result: DocumentExecutorResult, subtask: DocumentSubtask) {
  try {
    const verdict = await verifyDocument(result.filePath, subtask, result);
    log.info(`[DocumentExecutor] ${verb} ${result.filePath} (score: ${verdict.score.toFixed(2)})`);
    const line = verdict.passed
      ? `Verified by re-parsing (score ${verdict.score.toFixed(2)}).`
      : `Verification FAILED (score ${verdict.score.toFixed(2)}): ${verdict.message}`;
    return text(`${verb}: ${result.message} Saved to ${result.filePath}. ${line}`, verdict.passed ? "complete" : "error", {
      verifies: true,
      filePath: result.filePath,
    });
  } catch (e) {
    return fail(`${verb} verification failed`, e, { verifies: true, filePath: result.filePath });
  }
}

export function createDocxTool(): PiTool {
  return {
    name: "create_docx",
    label: "Create Word document",
    description:
      "Create a real .docx file in the user's Documents folder from sections with headings and paragraphs. Pass real content — the file is written to disk and verified by re-parsing, not described.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Document title, also used for the file name" })),
      sections: Type.Optional(
        Type.Array(
          Type.Object({
            heading: Type.String({ description: "Section heading" }),
            paragraphs: Type.Optional(Type.Array(Type.String(), { description: "Paragraph text for this section" })),
            content: Type.Optional(Type.String({ description: "Single text block, used when paragraphs is absent" })),
          }),
          { description: "Sections in order" },
        ),
      ),
    }),
    async execute(_id, params) {
      try {
        const { title, sections } = (params ?? {}) as { title?: unknown; sections?: unknown };
        if (!nonEmpty(title) && missingList(sections)) {
          return fail("Create docx failed", new Error("pass a title and/or at least one section"));
        }
        const spec: Record<string, unknown> = {};
        if (nonEmpty(title)) spec.title = title.trim();
        if (!missingList(sections)) spec.sections = sections;
        return createAndVerify("docx", title, spec);
      } catch (e) {
        return fail("Create docx failed", e);
      }
    },
  };
}

export function createPptxTool(): PiTool {
  return {
    name: "create_pptx",
    label: "Create presentation",
    description:
      "Create a real .pptx file in the user's Documents folder from slides with titles and bullets. Pass real content — the file is written to disk and verified by re-parsing, not described.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Presentation title, also used for the file name" })),
      slides: Type.Optional(
        Type.Array(
          Type.Object({
            title: Type.String({ description: "Slide title" }),
            bulletPoints: Type.Optional(Type.Array(Type.String(), { description: "Bullet points for this slide" })),
            bodyText: Type.Optional(Type.String({ description: "Body text, used when bulletPoints is absent" })),
          }),
          { description: "Content slides in order (a title slide is added automatically)" },
        ),
      ),
    }),
    async execute(_id, params) {
      try {
        const { title, slides } = (params ?? {}) as { title?: unknown; slides?: unknown };
        if (!nonEmpty(title) && missingList(slides)) {
          return fail("Create pptx failed", new Error("pass a title and/or at least one slide"));
        }
        const spec: Record<string, unknown> = {};
        if (nonEmpty(title)) spec.title = title.trim();
        if (!missingList(slides)) spec.slides = slides;
        return createAndVerify("pptx", title, spec);
      } catch (e) {
        return fail("Create pptx failed", e);
      }
    },
  };
}

export function createXlsxTool(): PiTool {
  return {
    name: "create_xlsx",
    label: "Create spreadsheet",
    description:
      "Create a real .xlsx file in the user's Documents folder from sheets with headers and rows. Pass real content — the file is written to disk and verified by re-parsing, not described.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Workbook title, also used for the file name" })),
      sheets: Type.Optional(
        Type.Array(
          Type.Object({
            name: Type.String({ description: "Sheet name (31 chars max)" }),
            headers: Type.Optional(Type.Array(Type.String(), { description: "Column headers" })),
            rows: Type.Optional(
              Type.Array(Type.Array(Type.Union([Type.String(), Type.Number()])), { description: "Data rows" }),
            ),
          }),
          { description: "Sheets in order" },
        ),
      ),
    }),
    async execute(_id, params) {
      try {
        const { title, sheets } = (params ?? {}) as { title?: unknown; sheets?: unknown };
        if (!nonEmpty(title) && missingList(sheets)) {
          return fail("Create xlsx failed", new Error("pass a title and/or at least one sheet"));
        }
        const spec: Record<string, unknown> = {};
        if (nonEmpty(title)) spec.title = title.trim();
        if (!missingList(sheets)) spec.sheets = sheets;
        return createAndVerify("xlsx", title, spec);
      } catch (e) {
        return fail("Create xlsx failed", e);
      }
    },
  };
}

export function readDocumentTool(): PiTool {
  return {
    name: "read_document",
    label: "Read document",
    description:
      "Read a document from the user's Documents folder and return its text. Use to quote, summarize, or check what a file you wrote actually contains.",
    parameters: Type.Object({
      filePath: Type.String({ description: "File name or path inside the Documents folder" }),
      focus: Type.Optional(Type.String({ description: "What to focus on (e.g. 'summarize', 'extract tables')" })),
    }),
    async execute(_id, params) {
      try {
        const { filePath, focus } = (params ?? {}) as { filePath?: unknown; focus?: unknown };
        const resolved = resolveSandboxed(filePath);
        if ("error" in resolved) return fail("Read document failed", new Error(resolved.error));
        const ext = path.extname(resolved.abs).replace(".", "").toLowerCase();
        let content: string;
        let kind: string;
        try {
          const extracted = await extractDocument(resolved.abs, path.basename(resolved.abs), ext);
          content = extracted.content;
          kind = extracted.type;
        } catch (e) {
          return fail("Read document failed", e);
        }
        if (loaderFailed(content)) return fail("Read document failed", new Error(content.slice(0, 200)));
        const focusLine = nonEmpty(focus) ? ` Focus: ${focus.trim()}.` : "";
        const excerpt = content.slice(0, READ_TRUNCATE_AT);
        const tail = content.length > READ_TRUNCATE_AT ? ` … (truncated, ${content.length} chars total)` : "";
        return text(`Read ${resolved.abs} (${kind}).${focusLine}\n${excerpt}${tail}`, "complete", {
          filePath: resolved.abs,
        });
      } catch (e) {
        return fail("Read document failed", e);
      }
    },
  };
}

/** Merge flat extracted text with new content for `modify_document` (docx shape). */
function mergedDocxSpec(op: string, oldText: string, target: string, content: string): Record<string, unknown> {
  const prior = { heading: "Previous content", paragraphs: [oldText] };
  const update = { heading: target || "Added content", paragraphs: [content] };
  if (op === "replace") return { sections: [update] };
  return { sections: op === "insert" ? [update, prior] : [prior, update] };
}

/** Same merge in the pptx shape (slides with titles and body text). */
function mergedPptxSpec(op: string, oldText: string, target: string, content: string): Record<string, unknown> {
  const prior = { title: "Previous content", bodyText: oldText };
  const update = { title: target || "Update", bodyText: content };
  if (op === "replace") return { slides: [update] };
  return { slides: op === "insert" ? [update, prior] : [prior, update] };
}

/** Same merge in the xlsx shape (one sheet, one row per previous line). */
function mergedXlsxSpec(op: string, oldText: string, target: string, content: string): Record<string, unknown> {
  const priorRows = oldText.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 500).map((line) => [line]);
  const name = (target || "Sheet1").slice(0, 31);
  if (op === "replace") return { sheets: [{ name, headers: ["content"], rows: [[content]] }] };
  const rows = op === "insert" ? [[content], ...priorRows] : [...priorRows, [content]];
  return { sheets: [{ name, headers: ["content"], rows }] };
}

export function modifyDocumentTool(): PiTool {
  return {
    name: "modify_document",
    label: "Modify document",
    description:
      "Modify a .docx/.pptx/.xlsx in the user's Documents folder by appending, prepending (insert), or replacing its text, then write the result as a new verified file. Never overwrites the source — the new file path is in the result.",
    parameters: Type.Object({
      filePath: Type.String({ description: "Source file name or path inside the Documents folder" }),
      operation: StringEnum(["append", "replace", "insert"], { description: "How to combine the new content" }),
      targetSection: Type.Optional(Type.String({ description: "Heading for the new content (docx/pptx) or sheet name (xlsx)" })),
      content: Type.String({ description: "New content to add or replace with" }),
    }),
    async execute(_id, params) {
      try {
        const { filePath, operation, targetSection, content } = (params ?? {}) as {
          filePath?: unknown;
          operation?: unknown;
          targetSection?: unknown;
          content?: unknown;
        };
        if (!nonEmpty(content)) return fail("Modify document failed", new Error("content must be a non-empty string"));
        if (operation !== "append" && operation !== "replace" && operation !== "insert") {
          return fail("Modify document failed", new Error("operation must be one of append, replace, insert"));
        }
        const resolved = resolveSandboxed(filePath);
        if ("error" in resolved) return fail("Modify document failed", new Error(resolved.error));
        const ext = path.extname(resolved.abs).replace(".", "").toLowerCase();
        if (!(WRITABLE_FORMATS as readonly string[]).includes(ext)) {
          return fail("Modify document failed", new Error(`only ${WRITABLE_FORMATS.join(", ")} can be modified`));
        }
        const format = ext as DocumentFormat;
        let oldText: string;
        try {
          const extracted = await extractDocument(resolved.abs, path.basename(resolved.abs), ext);
          if (loaderFailed(extracted.content)) {
            return fail("Modify document failed", new Error(`could not read source: ${extracted.content.slice(0, 160)}`));
          }
          oldText = extracted.content.slice(0, MERGE_TRUNCATE_AT);
        } catch (e) {
          return fail("Modify document failed", e);
        }
        const target = nonEmpty(targetSection) ? targetSection.trim() : "";
        const base = path.basename(resolved.abs, path.extname(resolved.abs));
        const spec =
          format === "docx"
            ? mergedDocxSpec(operation, oldText, target, content.trim())
            : format === "pptx"
              ? mergedPptxSpec(operation, oldText, target, content.trim())
              : mergedXlsxSpec(operation, oldText, target, content.trim());
        spec.title = `${base} updated`;
        const subtask = toSubtask(format, `${base} updated`, spec);
        let result: DocumentExecutorResult;
        try {
          result = await executeDocumentSubtask(subtask, `${operation} ${resolved.abs}`);
        } catch (e) {
          return fail("Modify document failed", e, { verifies: true });
        }
        if (!result.success || !result.filePath) {
          return fail("Modify document failed", new Error(result.message), { verifies: true });
        }
        return reportVerified(`Modified ${resolved.abs} (${operation})`, result, subtask);
      } catch (e) {
        return fail("Modify document failed", e);
      }
    },
  };
}

/**
 * The `document` family: exactly the five names `ask-prompt.ts` advertises.
 *
 * Note on verification: each writing tool re-parses its own output inside `reportVerified`
 * above and puts the score in the tool result, so the model reads the verdict directly.
 * There is deliberately no separate `afterToolCall` hook — unlike the desktop pixel verifier,
 * which needs screen state the tool cannot see, re-reading a file is something the tool can
 * do for itself, and a hook would verify every file twice.
 */
export async function getDocumentToolbox(): Promise<PiTool[]> {
  return [createDocxTool(), createPptxTool(), createXlsxTool(), readDocumentTool(), modifyDocumentTool()];
}
