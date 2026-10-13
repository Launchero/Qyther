/**
 * Document Executor — creates and modifies documents using docx, PptxGenJS, and xlsx.
 *
 * Handles file I/O, format-specific generation, and file name sanitization.
 * All files are saved to the user's Documents folder.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../../utils/logger';
import type { DocumentSubtask, DocumentExecutorResult } from './types';

const log = createLogger('DocumentExecutor');

// ── Library Imports (ESM-compatible) ─────────────────────────────────────────

// docx — ESM
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';

// PptxGenJS — CJS, must use createRequire
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');

// xlsx — CJS
const xlsx = require('xlsx');

// ── Document Folder ──────────────────────────────────────────────────────────

function getDocumentsFolder(): string {
  // Fallback: use OS Documents folder
  const homeDir = os.homedir();
  return path.join(homeDir, 'Documents');
}

/**
 * Sanitize a file name: strip special chars, limit length, prevent directory traversal.
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s\-_().,]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80)
    .trim()
    .replace(/^[_\s]+|[_\s]+$/g, '')
    || 'document';
}

/**
 * Generate a unique file path, appending a counter if the file already exists.
 */
function uniqueFilePath(folder: string, baseName: string, ext: string): string {
  const safeName = sanitizeFileName(baseName);
  let filePath = path.join(folder, `${safeName}.${ext}`);

  let counter = 1;
  while (true) {
    try {
      // If stat succeeds, file exists — try next counter
      // We use sync to avoid race, but this is single-threaded in Node
      break;
    } catch {
      // File doesn't exist — safe to use
    }
    // Check if file exists using try/catch
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _stat = require('fs').statSync(filePath);
      filePath = path.join(folder, `${safeName}_${counter}.${ext}`);
      counter++;
    } catch {
      // File doesn't exist — this path is safe
      break;
    }
  }

  return filePath;
}

// ── DOCX Executor ────────────────────────────────────────────────────────────

async function createDocx(
  task: string,
  contentSpec: Record<string, unknown>,
  subtask: DocumentSubtask
): Promise<DocumentExecutorResult> {
  const folder = getDocumentsFolder();
  const baseName = contentSpec.title as string || subtask.description.slice(0, 40);
  const filePath = uniqueFilePath(folder, baseName, 'docx');

  log.info(`[DocumentExecutor] Creating DOCX: ${filePath}`);

  const sections = (contentSpec.sections as Array<{ heading: string; paragraphs?: string[]; content?: string }>) || [];
  const children: Paragraph[] = [];

  // Title
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: baseName, bold: true, size: 36 })],
    alignment: AlignmentType.CENTER,
  }));

  // Sections
  for (const section of sections) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: section.heading, bold: true, size: 28 })],
    }));

    const paragraphs = (section.paragraphs || [section.content || '']).filter(Boolean) as string[];
    for (const p of paragraphs) {
      children.push(new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: p, size: 24 })],
      }));
    }
  }

  // If no sections, generate a single paragraph from the task
  if (sections.length === 0) {
    children.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: task, size: 24 })],
    }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);

  const paragraphCount = children.length;

  log.info(`[DocumentExecutor] DOCX created: ${filePath} (${paragraphCount} paragraphs)`);

  return {
    success: true,
    filePath,
    format: 'docx',
    message: `Created document "${baseName}.docx" with ${paragraphCount} paragraphs`,
    structure: { paragraphs: paragraphCount, sections: sections.length },
  };
}

// ── PPTX Executor ────────────────────────────────────────────────────────────

async function createPptx(
  task: string,
  contentSpec: Record<string, unknown>,
  subtask: DocumentSubtask
): Promise<DocumentExecutorResult> {
  const folder = getDocumentsFolder();
  const baseName = contentSpec.title as string || subtask.description.slice(0, 40);
  const filePath = uniqueFilePath(folder, baseName, 'pptx');

  log.info(`[DocumentExecutor] Creating PPTX: ${filePath}`);

  const pres = new PptxGenJS();
  pres.title = baseName;

  const slides = (contentSpec.slides as Array<{ title: string; bulletPoints?: string[]; bodyText?: string }>) || [];

  // Title slide
  const titleSlide = pres.addSlide();
  titleSlide.addText(baseName, {
    x: '10%', y: '35%', w: '80%', h: '20%',
    fontSize: 32, bold: true, align: 'center',
  });

  // Content slides
  for (const slideData of slides) {
    const slide = pres.addSlide();

    slide.addText(slideData.title, {
      x: '5%', y: '3%', w: '90%', h: '12%',
      fontSize: 24, bold: true,
    });

    if (slideData.bulletPoints && slideData.bulletPoints.length > 0) {
      // pptxgenjs has no addList(); one bullet per TextProps entry through addText().
      slide.addText(
        slideData.bulletPoints.map(bp => ({
          text: bp,
          options: { bullet: true, fontSize: 16 },
        })),
        {
          x: '5%', y: '20%', w: '90%', h: '70%',
          lineSpacingMultiple: 1.2,
        },
      );
    } else if (slideData.bodyText) {
      slide.addText(slideData.bodyText, {
        x: '5%', y: '20%', w: '90%', h: '70%',
        fontSize: 16,
      });
    }
  }

  // If no slides defined, create a single slide with the task
  if (slides.length === 0) {
    const slide = pres.addSlide();
    slide.addText(task, {
      x: '5%', y: '20%', w: '90%', h: '70%',
      fontSize: 18,
    });
  }

  await pres.writeFile({ fileName: filePath });

  const slideCount = slides.length + 1; // +1 for title slide

  log.info(`[DocumentExecutor] PPTX created: ${filePath} (${slideCount} slides)`);

  return {
    success: true,
    filePath,
    format: 'pptx',
    message: `Created presentation "${baseName}.pptx" with ${slideCount} slides`,
    structure: { slides: slideCount },
  };
}

// ── XLSX Executor ────────────────────────────────────────────────────────────

async function createXlsx(
  task: string,
  contentSpec: Record<string, unknown>,
  subtask: DocumentSubtask
): Promise<DocumentExecutorResult> {
  const folder = getDocumentsFolder();
  const baseName = contentSpec.title as string || subtask.description.slice(0, 40);
  const filePath = uniqueFilePath(folder, baseName, 'xlsx');

  log.info(`[DocumentExecutor] Creating XLSX: ${filePath}`);

  const workbook = xlsx.utils.book_new();
  const sheets = (contentSpec.sheets as Array<{ name: string; headers?: string[]; rows?: unknown[][] }>) || [];

  let totalRows = 0;

  for (const sheetData of sheets) {
    const rows: unknown[][] = [];

    if (sheetData.headers) {
      rows.push(sheetData.headers);
    }

    if (sheetData.rows) {
      rows.push(...(sheetData.rows as unknown[][]));
    }

    // If no data, add a single row with the task description
    if (rows.length === 0) {
      rows.push([task]);
    }

    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetData.name?.slice(0, 31) || 'Sheet1');
    totalRows += rows.length;
  }

  // If no sheets defined, create a default one
  if (sheets.length === 0) {
    const worksheet = xlsx.utils.aoa_to_sheet([[task]]);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    totalRows = 1;
  }

  xlsx.writeFile(workbook, filePath);

  log.info(`[DocumentExecutor] XLSX created: ${filePath} (${totalRows} rows across ${sheets.length || 1} sheets)`);

  return {
    success: true,
    filePath,
    format: 'xlsx',
    message: `Created spreadsheet "${baseName}.xlsx" with ${totalRows} rows`,
    structure: { rows: totalRows, sheets: sheets.length || 1 },
  };
}

// ── Main Executor Router ─────────────────────────────────────────────────────

/**
 * Execute a document creation/modification subtask.
 */
export async function executeDocumentSubtask(
  subtask: DocumentSubtask,
  task: string,
  crossAgentContext?: string
): Promise<DocumentExecutorResult> {
  const contentSpec = subtask.contentSpec || {};

  // Inject cross-agent context into content if available
  if (crossAgentContext) {
    log.info(`[DocumentExecutor] Injecting cross-agent context (${crossAgentContext.length} chars)`);
    if (!contentSpec.researchContext) {
      (contentSpec as Record<string, unknown>).researchContext = crossAgentContext;
    }
  }

  switch (subtask.format) {
    case 'docx':
      return createDocx(task, contentSpec, subtask);
    case 'pptx':
      return createPptx(task, contentSpec, subtask);
    case 'xlsx':
      return createXlsx(task, contentSpec, subtask);
    default:
      return {
        success: false,
        filePath: '',
        format: 'docx',
        message: `Unsupported format: ${subtask.format}`,
        structure: {},
      };
  }
}

export { getDocumentsFolder };
