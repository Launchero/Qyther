import { createLogger } from '../../utils/logger';
import type { DesktopAdapter, ScreenshotResult, Coordinates } from './types';
import * as inputSim from './input-simulation';
import { captureAllScreens, captureSingleMonitor } from './screenshot-capture';
import { createWorker, Worker } from 'tesseract.js';

const log = createLogger('WindowsDesktopAdapter');

let ocrWorker: Worker | null = null;

async function ensureOcrWorker(): Promise<Worker> {
  if (ocrWorker) return ocrWorker;
  ocrWorker = await createWorker('eng');
  log.info('Tesseract OCR worker initialized');
  return ocrWorker;
}

export class WindowsDesktopAdapter implements DesktopAdapter {
  async captureScreen(monitorIndex?: number): Promise<ScreenshotResult> {
    log.debug(`captureScreen: called with monitorIndex=${monitorIndex}`);
    if (monitorIndex !== undefined) {
      const monitor = await captureSingleMonitor(monitorIndex);
      log.debug(`captureScreen: single monitor ${monitorIndex} captured - ${monitor.width}x${monitor.height}`);
      return {
        monitors: [monitor],
        timestamp: Date.now(),
        primaryIndex: 0,
      };
    }
    log.debug('captureScreen: capturing all screens');
    const result = await captureAllScreens();
    log.debug(`captureScreen: all screens captured - ${result.monitors.length} monitors`);
    return result;
  }

  async click(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
    await inputSim.click(x, y, button);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await inputSim.doubleClick(x, y);
  }

  async drag(from: Coordinates, to: Coordinates): Promise<void> {
    await inputSim.drag(from.x, from.y, to.x, to.y);
  }

  async typeText(text: string): Promise<void> {
    await inputSim.typeText(text);
  }

  async pressKeys(keys: string[]): Promise<void> {
    await inputSim.pressKeys(keys);
  }

  async scroll(x: number, y: number, delta: number): Promise<void> {
    await inputSim.scroll(x, y, delta);
  }

  async getScreenText(): Promise<string> {
    try {
      const worker = await ensureOcrWorker();
      const screenshot = await captureAllScreens();
      const primary = screenshot.monitors[0];
      if (!primary) {
        throw new Error('No screen capture available for OCR');
      }

      // Convert dataUrl to buffer for Tesseract
      const base64Data = primary.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const { data } = await worker.recognize(buffer);
      log.debug(`OCR extracted ${data.text.length} characters`);
      return data.text;
    } catch (error) {
      log.error('OCR failed:', error);
      throw error;
    }
  }

  async getWindowInfo(): Promise<{
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const info = await inputSim.getForegroundWindowInfoAndRect();
    return {
      title: info.title,
      x: info.x,
      y: info.y,
      width: info.width,
      height: info.height,
    };
  }

  async cleanup(): Promise<void> {
    if (ocrWorker) {
      try {
        await ocrWorker.terminate();
      } catch {
        // Ignore cleanup errors
      }
      ocrWorker = null;
    }
    inputSim.cleanup();
  }

  async setCursorPosition(x: number, y: number): Promise<void> {
    await inputSim.setCursorPosition(x, y);
  }

  async rightClick(x: number, y: number): Promise<void> {
    await inputSim.rightClick(x, y);
  }

  async hover(x: number, y: number): Promise<void> {
    await inputSim.hover(x, y);
  }

  async focusWindow(handle: string): Promise<boolean> {
    return inputSim.focusWindow(handle);
  }
}
