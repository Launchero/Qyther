import { PNG } from 'pngjs';
import { createLogger } from '../../utils/logger';
import type { VerificationResult, VerificationSignal } from './types';
import { captureAllScreens } from './screenshot-capture';

const log = createLogger('GroundTruthVerifier');

const PIXEL_DIFF_THRESHOLD = 0.01;
const ACTION_EFFECT_MIN_DIFF = 0.02;

function decodePngDataUrl(dataUrl: string): { width: number; height: number; data: Buffer } {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

function computePixelDiffPercent(before: string, after: string): number {
  try {
    const beforePng = decodePngDataUrl(before);
    const afterPng = decodePngDataUrl(after);
    if (beforePng.width !== afterPng.width || beforePng.height !== afterPng.height) {
      return 0.1;
    }
    const stride = 4; // RGBA
    const sampleRate = 16;
    let diffCount = 0;
    let totalSamples = 0;
    for (let i = 0; i < beforePng.data.length; i += sampleRate * stride) {
      if (
        beforePng.data[i] !== afterPng.data[i] ||
        beforePng.data[i + 1] !== afterPng.data[i + 1] ||
        beforePng.data[i + 2] !== afterPng.data[i + 2]
      ) {
        diffCount++;
      }
      totalSamples++;
    }
    return totalSamples > 0 ? diffCount / totalSamples : 0;
  } catch {
    log.warn('Pixel diff computation failed');
    return 0;
  }
}

export class GroundTruthVerifier {
  private lastScreenshot: string | null = null;
  private lastWindowTitle: string | null = null;

  async updateBaseline(adapter: { getWindowInfo(): Promise<{ title: string }> }): Promise<void> {
    try {
      const screenshot = await captureAllScreens();
      if (screenshot.monitors.length > 0) {
        this.lastScreenshot = screenshot.monitors[0].dataUrl;
      }
      const windowInfo = await adapter.getWindowInfo();
      this.lastWindowTitle = windowInfo.title;
    } catch (error) {
      log.warn('Failed to update verifier baseline:', error);
    }
  }

  async verify(
    action: { type: string; args?: Record<string, unknown> },
    adapter: { getWindowInfo(): Promise<{ title: string }> },
  ): Promise<VerificationResult> {
    const signals: VerificationSignal[] = [];

    try {
      const screenshot = await captureAllScreens();
      const currentMonitor = screenshot.monitors[0];

      if (currentMonitor && this.lastScreenshot) {
        const diff = computePixelDiffPercent(this.lastScreenshot, currentMonitor.dataUrl);
        const passed = diff > PIXEL_DIFF_THRESHOLD;
        signals.push({
          type: 'pixel_diff',
          value: diff,
          passed,
        });
      }

      const windowInfo = await adapter.getWindowInfo();
      if (this.lastWindowTitle && windowInfo.title !== this.lastWindowTitle) {
        signals.push({
          type: 'window_change',
          value: windowInfo.title,
          passed: true,
        });
      }

      if (action.type === 'click' || action.type === 'double_click') {
        const hasVisibleEffect = this.lastScreenshot
          ? signals.some(s => s.type === 'pixel_diff' && s.value !== undefined && (s.value as number) > ACTION_EFFECT_MIN_DIFF)
          : false;
        signals.push({
          type: 'action_effect',
          passed: hasVisibleEffect,
        });
      }

      this.lastScreenshot = currentMonitor?.dataUrl ?? null;
      this.lastWindowTitle = windowInfo.title;
    } catch (error) {
      log.warn('Verification check failed:', error);
      signals.push({
        type: 'error_pattern',
        value: error instanceof Error ? error.message : 'Unknown',
        passed: false,
      });
    }

    const passedCount = signals.filter(s => s.passed).length;
    const score = signals.length > 0 ? passedCount / signals.length : 0;
    const hardReject = signals.some(s => s.hardReject === true);

    log.debug(`Verification result: score=${score}, signals=${signals.length}, passed=${passedCount}`);
    return { score, signals, hardReject };
  }

  reset(): void {
    this.lastScreenshot = null;
    this.lastWindowTitle = null;
  }
}
