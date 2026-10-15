// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

const sharp = (await import('sharp')).default;
const { createWorker } = await import('tesseract.js');

// Production calls createWorker('eng') with no workerPath/langPath/corePath overrides
// (windows-adapter.ts:14, and the OCR worker it spawns), so every one of those resolution paths is
// inside this dependency's defaults. This renders real text and reads it back.
const TEXT = 'Qyther OCR Probe 42';

function svgWithText(): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="140">
       <rect width="100%" height="100%" fill="white"/>
       <text x="14" y="86" font-family="Arial, Helvetica, sans-serif" font-size="52" fill="black">${TEXT}</text>
     </svg>`,
  );
}

describe('tesseract.js OCR path', () => {
  it('renders text with sharp and reads it back with the default worker', async () => {
    const png = await sharp(svgWithText()).png().toBuffer();

    // The rasterised fixture must be a real PNG, or the OCR assertion proves nothing.
    const decoded = PNG.sync.read(png);
    expect(decoded.width).toBeGreaterThan(0);
    expect(decoded.height).toBeGreaterThan(0);

    const worker = await createWorker('eng');
    try {
      const { data } = await worker.recognize(png);
      expect(data.text.replace(/\s+/g, ' ')).toContain('Qyther');
      expect(data.text.replace(/\s+/g, ' ')).toContain('42');
    } finally {
      await worker.terminate();
    }
  }, 120_000);
});
