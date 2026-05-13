import { createLogger } from '../../utils/logger';
import type { DesktopAdapter, ScreenshotResult, Coordinates } from './types';
import * as inputSim from './input-simulation';
import { captureAllScreens, captureSingleMonitor } from './screenshot-capture';
import { createWorker, Worker } from 'tesseract.js';
import { screen } from 'electron';

const log = createLogger('WindowsDesktopAdapter');

let ocrWorker: Worker | null = null;

async function ensureOcrWorker(): Promise<Worker> {
  if (ocrWorker) return ocrWorker;
  ocrWorker = await createWorker('eng');
  log.info('Tesseract OCR worker initialized');
  return ocrWorker;
}

function clampToScreen(x: number, y: number): { x: number; y: number } {
  // Get the primary display bounds; this covers most single-monitor setups.
  // For multi-monitor, we still clamp to prevent negative or extremely large coords.
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;
  return {
    x: Math.max(0, Math.min(x, width - 1)),
    y: Math.max(0, Math.min(y, height - 1)),
  };
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
    const clamped = clampToScreen(x, y);
    await inputSim.click(clamped.x, clamped.y, button);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    const clamped = clampToScreen(x, y);
    await inputSim.doubleClick(clamped.x, clamped.y);
  }

  async drag(from: Coordinates, to: Coordinates): Promise<void> {
    const fromClamped = clampToScreen(from.x, from.y);
    const toClamped = clampToScreen(to.x, to.y);
    await inputSim.drag(fromClamped.x, fromClamped.y, toClamped.x, toClamped.y);
  }

  async typeText(text: string): Promise<void> {
    await inputSim.typeText(text);
  }

  async pressKeys(keys: string[]): Promise<void> {
    await inputSim.pressKeys(keys);
  }

  async scroll(x: number, y: number, delta: number): Promise<void> {
    const clamped = clampToScreen(x, y);
    await inputSim.scroll(clamped.x, clamped.y, delta);
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
    const clamped = clampToScreen(x, y);
    await inputSim.setCursorPosition(clamped.x, clamped.y);
  }

  async rightClick(x: number, y: number): Promise<void> {
    const clamped = clampToScreen(x, y);
    await inputSim.rightClick(clamped.x, clamped.y);
  }

  async hover(x: number, y: number): Promise<void> {
    const clamped = clampToScreen(x, y);
    await inputSim.hover(clamped.x, clamped.y);
  }

  async focusWindow(handle: string): Promise<boolean> {
    return inputSim.focusWindowByHandle(handle);
  }

  async minimizeWindow(handle: string): Promise<boolean> {
    return inputSim.minimizeWindowByHandle(handle);
  }

  async maximizeWindow(handle: string): Promise<boolean> {
    return inputSim.maximizeWindowByHandle(handle);
  }

  async restoreWindow(handle: string): Promise<boolean> {
    return inputSim.restoreWindowByHandle(handle);
  }

  async closeWindow(handle: string): Promise<boolean> {
    return inputSim.closeWindowByHandle(handle);
  }
}
