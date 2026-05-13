/**
 * Document Agent Verifier — validates generated documents.
 *
 * Opens generated files via document-loader.ts extraction, parses back,
 * and validates structure and content presence.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from '../../utils/logger';
import type { DocumentSubtask, DocumentVerificationResult, DocumentVerificationSignal, DocumentExecutorResult } from './types';
import { extractDocument } from '../utils/document-loader';

const log = createLogger('DocumentVerifier');

/**
 * Verify a generated document file.
 * Checks: (1) file exists, (2) format is valid, (3) required content present, (4) structure matches spec.
 */
export async function verifyDocument(
  filePath: string,
  subtask: DocumentSubtask,
  executorResult: DocumentExecutorResult
): Promise<DocumentVerificationResult> {
  const signals: DocumentVerificationSignal[] = [];
  let score = 0;

  // ── Check 1: File exists ───────────────────────────────────────────────
  try {
    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      signals.push({ type: 'file_exists', passed: false, value: 0 });
      return buildResult(false, 0, signals, 'Generated file is empty');
    }
    signals.push({ type: 'file_exists', passed: true, value: stat.size });
    score += 0.2;
  } catch {
    signals.push({ type: 'file_exists', passed: false });
    return buildResult(false, 0, signals, `File does not exist: ${filePath}`);
  }

  // ── Check 2: Format is valid (parse via document-loader) ───────────────
  const ext = path.extname(filePath).replace('.', '');
  const fileName = path.basename(filePath);

  try {
    const extractResult = await extractDocument(filePath, fileName, ext);
    const content = extractResult.content;

    if (content.startsWith('[Error') || content.startsWith('[Format') || content.startsWith('[File')) {
      signals.push({ type: 'format_valid', passed: false });
      return buildResult(false, score, signals, `File format validation failed: ${content.slice(0, 100)}`);
    }

    signals.push({ type: 'format_valid', passed: true });
    score += 0.2;

    // ── Check 3: Content present (substring matching against postcondition) ─
    const postcondition = subtask.postcondition.toLowerCase();
    const contentLower = content.toLowerCase();

    // Extract key terms from postcondition (words >= 4 chars)
    const keyTerms = postcondition
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length >= 4);

    let matchedTerms = 0;
    for (const term of keyTerms.slice(0, 10)) {
      if (contentLower.includes(term)) {
        matchedTerms++;
      }
    }

    const contentScore = keyTerms.length > 0 ? matchedTerms / keyTerms.length : 1;
    signals.push({
      type: 'content_present',
      passed: contentScore >= 0.3,
      value: Math.round(contentScore * 100),
    });

    if (contentScore >= 0.3) {
      score += 0.3;
    } else {
      return buildResult(false, score, signals, `Content verification failed: only ${matchedTerms}/${keyTerms.length} key terms found`);
    }

    // ── Check 4: Structure matches spec ──────────────────────────────────────
    const expectedStructure = subtask.contentSpec ? inferExpectedStructure(subtask) : {};
    const actualStructure = executorResult.structure;

    let structureMatched = true;
    if (Object.keys(expectedStructure).length > 0 && Object.keys(actualStructure).length > 0) {
      for (const [key, expected] of Object.entries(expectedStructure)) {
        const actual = actualStructure[key] ?? 0;
        if (actual < expected) {
          structureMatched = false;
          break;
        }
      }
    }

    signals.push({ type: 'structure_match', passed: structureMatched });

    if (structureMatched) {
      score += 0.3;
    } else {
      // Don't fail entirely — structure check is advisory
      score += 0.15;
    }

    return buildResult(score >= 0.6, score, signals, `Document verified (score: ${score.toFixed(2)})`, {
      expectedStructure,
      actualStructure,
    });
  } catch (err) {
    signals.push({ type: 'parse_error', passed: false });
    log.error(`[DocumentVerifier] Verification error: ${err instanceof Error ? err.message : String(err)}`);
    return buildResult(false, score, signals, `Verification error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Infer expected structure from subtask content spec.
 */
function inferExpectedStructure(subtask: DocumentSubtask): Record<string, number> {
  const spec = subtask.contentSpec || {};
  const expected: Record<string, number> = {};

  if (subtask.format === 'docx' && spec.sections) {
    const sections = spec.sections as Array<{ paragraphs?: string[] }>;
    expected.sections = sections.length;
    expected.paragraphs = sections.reduce((sum: number, s: { paragraphs?: string[] }) => sum + (s.paragraphs?.length ?? 1), 0);
  }

  if (subtask.format === 'pptx' && spec.slides) {
    const slides = spec.slides as Array<unknown>;
    expected.slides = slides.length + 1; // +1 for title slide
  }

  if (subtask.format === 'xlsx' && spec.sheets) {
    const sheets = spec.sheets as Array<{ rows?: unknown[] }>;
    expected.sheets = sheets.length;
    expected.rows = sheets.reduce((sum: number, s: { rows?: unknown[] }) => sum + (s.rows?.length ?? 0) + 1, 0);
  }

  return expected;
}

function buildResult(
  passed: boolean,
  score: number,
  signals: DocumentVerificationSignal[],
  message: string,
  structures?: { expectedStructure?: Record<string, number>; actualStructure?: Record<string, number> }
): DocumentVerificationResult {
  return {
    passed,
    score: Math.min(score, 1.0),
    signals,
    message,
    ...(structures ?? {}),
  };
}
