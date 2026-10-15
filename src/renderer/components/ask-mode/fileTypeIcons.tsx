import React from 'react';
import { PaperclipIcon, Image, FilePdf, FileCsv, Presentation, BookOpen, FileText } from '@phosphor-icons/react';

const FILE_TYPE_EXTS: Record<string, string> = {
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', go: 'code',
  rs: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', css: 'code',
  html: 'code', json: 'code', yaml: 'code', yml: 'code', toml: 'code',
  md: 'code', sql: 'code',
};
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']);
const PDF_EXTS = new Set(['pdf']);
const DOC_EXTS = new Set(['doc', 'docx', 'txt', 'rtf', 'odt']);
const SPREADSHEET_EXTS = new Set(['xls', 'xlsx', 'csv']);
const PRESENTATION_EXTS = new Set(['ppt', 'pptx']);
const EBOOK_EXTS = new Set(['epub', 'mobi', 'azw3']);

export function getFileIconType(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (FILE_TYPE_EXTS[ext]) return 'code';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (PDF_EXTS.has(ext)) return 'pdf';
  if (DOC_EXTS.has(ext)) return 'doc';
  if (SPREADSHEET_EXTS.has(ext)) return 'spreadsheet';
  if (PRESENTATION_EXTS.has(ext)) return 'presentation';
  if (EBOOK_EXTS.has(ext)) return 'ebook';
  return 'file';
}

export function FileIconForType({ iconType }: { iconType: string }) {
  switch (iconType) {
    case 'code':
      return <FileText className="chip-icon" weight="regular" aria-hidden="true" />;
    case 'image':
      return <Image className="chip-icon" weight="regular" aria-hidden="true" />;
    case 'pdf':
      return <FilePdf className="chip-icon" weight="regular" aria-hidden="true" />;
    case 'spreadsheet':
      return <FileCsv className="chip-icon" weight="regular" aria-hidden="true" />;
    case 'presentation':
      return <Presentation className="chip-icon" weight="regular" aria-hidden="true" />;
    case 'ebook':
      return <BookOpen className="chip-icon" weight="regular" aria-hidden="true" />;
    default:
      return <PaperclipIcon className="chip-icon" weight="regular" aria-hidden="true" />;
  }
}
