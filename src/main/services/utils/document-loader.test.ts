// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { extractDocument, getFormatConfig, DOCUMENT_EXTENSIONS } = await import('./document-loader');

const dir = mkdtempSync(join(tmpdir(), 'qyther-loader-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, body: Buffer): string {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
}

describe('document loader guards', () => {
  it('declares the formats the app claims to read', () => {
    expect([...DOCUMENT_EXTENSIONS].sort()).toEqual(
      ['doc', 'docx', 'epub', 'pdf', 'ppt', 'pptx', 'xls', 'xlsx'].sort(),
    );
    expect(getFormatConfig('pdf')!.maxSize).toBe(10 * 1024 * 1024);
    expect(getFormatConfig('docx')!.maxSize).toBe(5 * 1024 * 1024);
  });

  it('refuses an unsupported extension without touching the file', async () => {
    const p = file('notes.txt', Buffer.from('hello'));
    const result = await extractDocument(p, 'notes.txt', 'txt');
    expect(result.content).toContain('Format not supported');
    expect(result.type).toBe('file');
  });

  it('reports an empty file instead of handing the parser nothing', async () => {
    const p = file('empty.docx', Buffer.alloc(0));
    const result = await extractDocument(p, 'empty.docx', 'docx');
    expect(result.content).toContain('is empty');
  });

  it('rejects a file whose magic bytes contradict its extension', async () => {
    const p = file('fake.docx', Buffer.from('this is plain text, not a zip container'));
    const result = await extractDocument(p, 'fake.docx', 'docx');
    expect(result.content).toContain('does not match');
  });

  it('enforces the per-format size cap', async () => {
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const p = file('huge.docx', Buffer.concat([header, Buffer.alloc(5 * 1024 * 1024 + 1024)]));
    const result = await extractDocument(p, 'huge.docx', 'docx');
    expect(result.content).toContain('File too large');
  });
});
