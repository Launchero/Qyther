// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import type { DocumentSubtask } from './types';

const { executeDocumentSubtask, getDocumentsFolder } = await import('./document-executor');
const { extractDocument } = await import('../utils/document-loader');

const MARKER = 'QytherDepsProbe';
const written: string[] = [];

function subtask(format: DocumentSubtask['format'], contentSpec: Record<string, unknown>): DocumentSubtask {
  return {
    id: `${MARKER}-${format}`,
    description: `${MARKER} ${format} probe document`,
    precondition: 'none',
    postcondition: 'a readable file exists',
    maxSteps: 5,
    status: 'executing',
    format,
    requiresBrowser: false,
    requiresDesktop: false,
    contentSpec,
  };
}

afterAll(() => {
  for (const filePath of written) rmSync(filePath, { force: true });
});

describe('document writers round-trip through the real loader', () => {
  it('writes a .docx that re-parses back to its headings and paragraphs', async () => {
    const result = await executeDocumentSubtask(
      subtask('docx', {
        title: `${MARKER} docx`,
        sections: [
          { heading: `${MARKER} Alpha Section`, paragraphs: [`alpha body ${MARKER}`] },
          { heading: `${MARKER} Beta Section`, paragraphs: [`beta body ${MARKER}`] },
        ],
      }),
      'create a docx',
    );

    expect(result.success, result.message).toBe(true);
    expect(result.filePath.startsWith(getDocumentsFolder())).toBe(true);
    written.push(result.filePath);
    expect(existsSync(result.filePath)).toBe(true);

    const parsed = await extractDocument(result.filePath, `${MARKER}.docx`, 'docx');
    expect(parsed.content).toContain(`${MARKER} Alpha Section`);
    expect(parsed.content).toContain('alpha body QytherDepsProbe');
    expect(parsed.content).toContain(`${MARKER} Beta Section`);
  });

  it('writes a .pptx that re-parses back to its slide titles and bullets', async () => {
    const result = await executeDocumentSubtask(
      subtask('pptx', {
        title: `${MARKER} pptx`,
        slides: [
          { title: `${MARKER} Slide One`, bulletPoints: [`first bullet ${MARKER}`, 'second bullet'] },
          { title: `${MARKER} Slide Two`, bodyText: `prose on slide two ${MARKER}` },
        ],
      }),
      'create a pptx',
    );

    expect(result.success, result.message).toBe(true);
    expect(result.structure.slides).toBe(3);
    written.push(result.filePath);

    const parsed = await extractDocument(result.filePath, `${MARKER}.pptx`, 'pptx');
    expect(parsed.content).toContain(`${MARKER} Slide One`);
    expect(parsed.content).toContain('first bullet QytherDepsProbe');
    expect(parsed.content).toContain(`${MARKER} Slide Two`);
  });

  it('writes a .xlsx that re-parses back to its headers and rows', async () => {
    const result = await executeDocumentSubtask(
      subtask('xlsx', {
        title: `${MARKER} xlsx`,
        sheets: [
          {
            name: 'Metrics',
            headers: ['quarter', `${MARKER}_value`],
            rows: [['Q1', 1234], ['Q2', 5678]],
          },
        ],
      }),
      'create an xlsx',
    );

    expect(result.success, result.message).toBe(true);
    expect(result.structure.rows).toBe(3);
    written.push(result.filePath);

    const parsed = await extractDocument(result.filePath, `${MARKER}.xlsx`, 'xlsx');
    expect(parsed.content).toContain('quarter');
    expect(parsed.content).toContain('1234');
    expect(parsed.content).toContain('5678');
  });

  it('rejects an unsupported format instead of writing a broken file', async () => {
    const result = await executeDocumentSubtask(
      { ...subtask('docx', {}), format: 'odt' as DocumentSubtask['format'] },
      'create an odt',
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Unsupported format');
  });
});
