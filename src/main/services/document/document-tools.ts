import { z } from "zod";

/**
 * Section definition for DOCX document creation.
 */
const docxSectionSchema = z.object({
  heading: z.string().describe("Section heading text"),
  headingLevel: z.number().describe("Heading level (1-6)"),
  paragraphs: z.array(z.string()).describe("Paragraph text for this section"),
});

/**
 * Schema for creating Word documents (.docx).
 */
export const createDocxSchema = z.object({
  title: z.string().describe("Document title"),
  author: z.string().optional().describe("Document author"),
  sections: z.array(docxSectionSchema).describe("Document sections with headings and paragraphs"),
});

export type CreateDocxInput = z.infer<typeof createDocxSchema>;

// ── PPTX Schema ──────────────────────────────────────────────────────────────

const pptxSlideSchema = z.object({
  title: z.string().describe("Slide title"),
  bulletPoints: z.array(z.string()).optional().describe("Bullet points for this slide"),
  bodyText: z.string().optional().describe("Body text for this slide"),
  hasChart: z.boolean().optional().describe("Whether this slide contains a chart"),
  chartType: z.enum(["bar", "column", "line", "pie"]).optional().describe("Chart type if hasChart is true"),
  chartData: z.array(z.record(z.string(), z.number())).optional().describe("Chart data if hasChart is true"),
});

/**
 * Schema for creating PowerPoint presentations (.pptx).
 */
export const createPptxSchema = z.object({
  title: z.string().describe("Presentation title"),
  slides: z.array(pptxSlideSchema).describe("Slides in the presentation"),
});

export type CreatePptxInput = z.infer<typeof createPptxSchema>;

// ── XLSX Schema ──────────────────────────────────────────────────────────────

const xlsxSheetSchema = z.object({
  name: z.string().describe("Sheet name"),
  headers: z.array(z.string()).describe("Column headers"),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).describe("Data rows"),
});

/**
 * Schema for creating Excel spreadsheets (.xlsx).
 */
export const createXlsxSchema = z.object({
  title: z.string().describe("Workbook title"),
  sheets: z.array(xlsxSheetSchema).describe("Sheets in the workbook"),
});

export type CreateXlsxInput = z.infer<typeof createXlsxSchema>;

// ── Modify Document Schema ───────────────────────────────────────────────────

/**
 * Schema for modifying an existing document.
 */
export const modifyDocumentSchema = z.object({
  filePath: z.string().describe("Path to the existing document file"),
  operation: z.enum(["append", "replace", "insert"]).describe("Modification operation"),
  targetSection: z.string().optional().describe("Section/slide/sheet to modify (for replace/insert)"),
  content: z.string().describe("New content to add/replace"),
});

export type ModifyDocumentInput = z.infer<typeof modifyDocumentSchema>;

// ── Read Document Schema ─────────────────────────────────────────────────────

/**
 * Schema for reading/summarizing an existing document.
 */
export const readDocumentSchema = z.object({
  filePath: z.string().describe("Path to the document file"),
  focus: z.string().optional().describe("What to focus when reading (e.g., 'summarize', 'extract tables', 'find specific content')"),
});

export type ReadDocumentInput = z.infer<typeof readDocumentSchema>;
