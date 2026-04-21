import * as fs from 'fs/promises';
import * as path from 'path';
import * as unzipper from 'unzipper';
import { createRequire } from 'node:module';

// CJS-only modules must be loaded via createRequire for electron-vite ESM bundling
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const epub2 = require('epub2');

// Format configuration
interface FormatConfig {
  category: string;
  maxSize: number;
}

const DOCUMENT_FORMATS: Record<string, FormatConfig> = {
  pdf: { category: 'pdf', maxSize: 10 * 1024 * 1024 },
  docx: { category: 'docx', maxSize: 5 * 1024 * 1024 },
  doc: { category: 'docx', maxSize: 5 * 1024 * 1024 },
  pptx: { category: 'pptx', maxSize: 5 * 1024 * 1024 },
  ppt: { category: 'pptx', maxSize: 5 * 1024 * 1024 },
  xlsx: { category: 'xlsx', maxSize: 5 * 1024 * 1024 },
  xls: { category: 'xlsx', maxSize: 5 * 1024 * 1024 },
  epub: { category: 'epub', maxSize: 5 * 1024 * 1024 },
};

export const DOCUMENT_EXTENSIONS = new Set(Object.keys(DOCUMENT_FORMATS));

// Magic bytes for format validation
const PDF_MAGIC = Buffer.from('%PDF');
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

function validateFileType(buffer: Buffer, ext: string): boolean {
  if (ext === 'pdf') {
    if (buffer.length < PDF_MAGIC.length) return false;
    return buffer.slice(0, PDF_MAGIC.length).equals(PDF_MAGIC);
  }
  if (['docx', 'xlsx', 'pptx', 'epub'].includes(ext)) {
    if (buffer.length < ZIP_MAGIC.length) return false;
    return buffer.slice(0, ZIP_MAGIC.length).equals(ZIP_MAGIC);
  }
  return true;
}

function chunkDocument(text: string, fileName: string, maxChars: number = 50000): string {
  if (text.length <= maxChars) return text;

  const chunks: string[] = [];
  const chunkSize = maxChars * 0.8;
  let offset = 0;

  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length);
    let chunk = text.slice(offset, end);

    if (end < text.length) {
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline > chunkSize * 0.5) {
        chunk = text.slice(offset, offset + lastNewline);
      }
    }

    chunks.push(chunk);
    offset += chunk.length;
  }

  if (chunks.length > 1) {
    return chunks.map((c, i) =>
      `[Part ${i + 1} of ${chunks.length} of ${fileName}]\n${c}`
    ).join('\n\n');
  }
  return text;
}

// ===== PDF Extraction =====

async function extractPdf(filePath: string, fileName: string): Promise<string> {
  console.log(`[DocumentLoader] Extracting PDF: ${filePath}`);
  const buffer = await fs.readFile(filePath);
  console.log(`[DocumentLoader] PDF buffer size: ${buffer.length} bytes, starts with: ${buffer.slice(0, 5).toString('ascii')}`);

  try {
    const data = await pdfParse(buffer);
    console.log(`[DocumentLoader] PDF parse result - pages: ${data.numpages}, text length: ${data.text?.length || 0}`);

    if (!data.text || data.text.trim().length === 0) {
      return `[PDF "${fileName}" appears to be image-only or scanned. OCR is required to extract text — convert to text-based PDF or paste content manually.]`;
    }

    const pageNote = data.numpages > 1 ? `\n[PDF: ${data.numpages} pages]` : '';
    return data.text.trim() + pageNote;
  } catch (err: any) {
    console.error(`[DocumentLoader] PDF extraction error:`, err?.message || err);
    const message = err?.message?.toLowerCase() || '';

    if (message.includes('password') || message.includes('encrypt')) {
      return `[PDF "${fileName}" is password-protected. Content cannot be extracted without the password.]`;
    }
    if (message.includes('invalid') || message.includes('corrupt') || message.includes('format')) {
      return `[PDF "${fileName}" appears to be corrupted or has an unsupported format.]`;
    }
    return `[Error extracting PDF "${fileName}": ${err?.message || 'Unknown error'}]`;
  }
}

// ===== DOCX Extraction =====

async function extractDocx(filePath: string, fileName: string): Promise<string> {

  try {
    const result = await mammoth.extractRawText({ path: filePath });

    if (!result.value || result.value.trim().length === 0) {
      return `[Word document "${fileName}" appears to be image-only. No extractable text found.]`;
    }

    let text = result.value.trim();

    if (result.messages && result.messages.length > 0) {
      const warnings = result.messages
        .filter((m: any) => m.type === 'warning')
        .map((m: any) => m.message);
      if (warnings.length > 0) {
        text += `\n\n[Note: Some content may not have been extracted: ${warnings.slice(0, 3).join('; ')}]`;
      }
    }

    return text;
  } catch (err: any) {
    const message = err?.message?.toLowerCase() || '';

    if (message.includes('zip') || message.includes('corrupt')) {
      return `[Word document "${fileName}" appears to be corrupted. This may be an old .doc format (not .docx).]`;
    }
    return `[Error extracting Word document "${fileName}": ${err?.message || 'Unknown error'}]`;
  }
}

// ===== PPTX Extraction =====

async function extractPptx(filePath: string, fileName: string): Promise<string> {
  try {
    const directory = await unzipper.Open.file(filePath);
    const slides = directory.files
      .filter((f: any) => f.path.match(/ppt\/slides\/slide\d+\.xml/))
      .sort((a: any, b: any) => {
        const numA = parseInt(a.path.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.path.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    if (slides.length === 0) {
      return `[Presentation "${fileName}" contains no extractable slides.]`;
    }

    const results: string[] = [];

    for (let i = 0; i < slides.length; i++) {
      const xmlContent = await slides[i].buffer();
      const xmlString = xmlContent.toString('utf-8');
      const textNodes = extractTextFromPptxXml(xmlString);

      if (textNodes.length === 0) {
        results.push(`## Slide ${i + 1}\n[No extractable text — may contain images or charts]`);
      } else {
        results.push(`## Slide ${i + 1}\n${textNodes.join('\n')}`);
      }
    }

    return results.join('\n\n');
  } catch (err: any) {
    const message = err?.message?.toLowerCase() || '';

    if (message.includes('zip') || message.includes('corrupt')) {
      return `[Presentation "${fileName}" appears to be corrupted. This may be an old .ppt format (not .pptx).]`;
    }
    return `[Error extracting presentation "${fileName}": ${err?.message || 'Unknown error'}]`;
  }
}

function extractTextFromPptxXml(xml: string): string[] {
  const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
  return textMatches
    .map((match: string) => match.replace(/<\/?a:t[^>]*>/g, ''))
    .filter((t: string) => t.trim().length > 0);
}

// ===== XLSX Extraction =====

async function extractXlsx(filePath: string, fileName: string): Promise<string> {

  try {
    const workbook = xlsx.readFile(filePath, { cellDates: true });
    const results: string[] = [];
    const maxRowsPerSheet = 500;

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (jsonData.length === 0) {
        continue;
      }

      const totalRows = jsonData.length;
      const displayRows = jsonData.slice(0, maxRowsPerSheet);

      let table = `## Sheet: ${sheetName} (${totalRows} rows)\n\n`;

      const headerRow = displayRows[0] || [];
      const maxCols = Math.min(headerRow.length, 20);

      const headers = headerRow.slice(0, maxCols).map((h: any) => `| ${String(h ?? '').trim()} `).join('') + '|';
      const separator = '| ' + Array(maxCols).fill('---').join(' | ') + ' |';

      table += headers + '\n';
      table += separator + '\n';

      for (let r = 1; r < displayRows.length; r++) {
        const row = displayRows[r];
        const cells = Array.from({ length: maxCols }, (_, c) => ` ${String(row?.[c] ?? '').trim()} `).join('|');
        table += '|' + cells + '|\n';
      }

      if (totalRows > maxRowsPerSheet) {
        table += `\n[... ${totalRows - maxRowsPerSheet} more rows not shown to save context]`;
      }

      results.push(table);
    }

    if (results.length === 0) {
      return `[Spreadsheet "${fileName}" appears to be empty.]`;
    }

    return results.join('\n\n');
  } catch (err: any) {
    const message = err?.message?.toLowerCase() || '';

    if (message.includes('zip') || message.includes('corrupt')) {
      return `[Spreadsheet "${fileName}" appears to be corrupted. This may be an old .xls format (not .xlsx).]`;
    }
    return `[Error extracting spreadsheet "${fileName}": ${err?.message || 'Unknown error'}]`;
  }
}

// ===== EPUB Extraction =====

async function extractEpub(filePath: string, fileName: string): Promise<string> {
  const { EPub } = epub2;

  try {
    const book = new EPub(filePath);

    return new Promise((resolve) => {
      book.on('end', () => {
        const chapters: string[] = [];

        for (const item of book.flow) {
          if (!item.id) continue;

          try {
            const chapter = book.getChapter(item.id);
            if (chapter) {
              const htmlContent = typeof chapter === 'string' ? chapter : '';
              const text = stripHtmlTags(htmlContent).trim();
              if (text.length > 0) {
                chapters.push(text);
              }
            }
          } catch {
            // Skip chapters that fail to extract
          }
        }

        if (chapters.length === 0) {
          resolve(`[EBook "${fileName}" has no extractable text content.]`);
        } else {
          const fullText = chapters.join('\n\n---\n\n');
          resolve(fullText);
        }
      });

      book.on('error', (err: Error) => {
        resolve(`[Error extracting eBook "${fileName}": ${err.message}]`);
      });

      book.parse();
    });
  } catch (err: any) {
    return `[Error extracting eBook "${fileName}": ${err?.message || 'Unknown error'}]`;
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ===== Main Extraction Router =====

export async function extractDocument(
  filePath: string,
  fileName: string,
  ext: string
): Promise<{ content: string; type: string }> {
  const formatConfig = DOCUMENT_FORMATS[ext];
  if (!formatConfig) {
    return { content: `[Format not supported: .${ext}]`, type: 'file' };
  }

  const stat = await fs.stat(filePath);

  if (stat.size > formatConfig.maxSize) {
    return {
      content: `[File too large (${(stat.size / (1024 * 1024)).toFixed(1)}MB). Maximum for ${ext.toUpperCase()} is ${(formatConfig.maxSize / (1024 * 1024))}MB. Please extract relevant sections manually.]`,
      type: 'file',
    };
  }

  if (stat.size === 0) {
    return { content: `[File "${fileName}" is empty.]`, type: 'file' };
  }

  const buffer = await fs.readFile(filePath);

  if (!validateFileType(buffer, ext)) {
    return {
      content: `[File content does not match .${ext} format. The file may be mislabeled or corrupted.]`,
      type: 'file',
    };
  }

  let content: string;

  switch (formatConfig.category) {
    case 'pdf':
      content = await extractPdf(filePath, fileName);
      break;
    case 'docx':
      content = await extractDocx(filePath, fileName);
      break;
    case 'pptx':
      content = await extractPptx(filePath, fileName);
      break;
    case 'xlsx':
      content = await extractXlsx(filePath, fileName);
      break;
    case 'epub':
      content = await extractEpub(filePath, fileName);
      break;
    default:
      content = `[Format not supported: .${ext}]`;
  }

  content = chunkDocument(content, fileName);

  return { content, type: 'file' };
}

export function getFormatConfig(ext: string): FormatConfig | undefined {
  return DOCUMENT_FORMATS[ext];
}
