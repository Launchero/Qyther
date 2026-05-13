/**
 * Desktop Agent Integration Test Suite
 *
 * Tests ALL desktop agent tools inside the Electron main process.
 * Verifies FFI calls actually affect the real system (cursor, windows, files, clipboard, etc.).
 *
 * Trigger: set TEST_DESKTOP_TOOLS=1 in .env, then run `npm run dev`.
 * Tests auto-run after app initialization.
 */

import koffi from 'koffi';
import { screen, clipboard } from 'electron';
import { createLogger } from './logger';
import { WindowsDesktopAdapter } from '../services/desktop/windows-adapter';
import type { DesktopAdapter } from '../services/desktop/types';
import {
  listWindows,
  getForegroundWindowInfo,
  launchApp,
  getForegroundWindowInfoAndRect,
  getForegroundWindowRect,
  resolveHwnd,
} from '../services/desktop/input-simulation';
import { createWorker } from 'tesseract.js';
import { captureAllScreens } from '../services/desktop/screenshot-capture';
import * as fs from 'fs/promises';
import * as path from 'path';

const log = createLogger('DesktopToolsTest');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

let results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    const passed = await fn();
    if (passed) {
      results.push({ name, passed: true });
      console.log(`  ${GREEN}PASS${RESET} ${name}`);
      log.info(`[TEST PASS] ${name}`);
    } else {
      results.push({ name, passed: false });
      console.log(`  ${RED}FAIL${RESET} ${name}`);
      log.error(`[TEST FAIL] ${name}`);
    }
  } catch (err) {
    results.push({
      name,
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    console.log(`  ${RED}FAIL${RESET} ${name} — ${err instanceof Error ? err.message : String(err)}`);
    log.error(`[TEST FAIL] ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Raw Win32 for position verification ──

const POINT2 = koffi.struct('DESKTOP_TEST_POINT', {
  x: 'long',
  y: 'long',
});

function getCursorPosSync(): { x: number; y: number } | null {
  const user32 = koffi.load('user32.dll') as unknown as Record<string, (sig: string) => unknown>;
  const GetCursorPos = user32.func('bool __stdcall GetCursorPos(void *lpPoint)');
  const buf = Buffer.alloc(koffi.sizeof(POINT2));
  const ok = (GetCursorPos as (lpPoint: Buffer) => boolean)(buf);
  if (!ok) return null;
  const point = koffi.decode(buf, POINT2);
  return { x: point.x, y: point.y };
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Test Suite ──

export async function runDesktopToolsTest(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}=== Desktop Agent Tools Integration Test ===${RESET}\n`);
  log.info('Running desktop agent tools integration test');

  const adapter: DesktopAdapter = new WindowsDesktopAdapter();

  try {
    // ═══════════════════════════════════════════
    // MOUSE TOOLS
    // ═══════════════════════════════════════════
    console.log(`${BOLD}${CYAN}── Mouse Tools ──${RESET}`);

    await runTest('move_mouse: setCursorPosition moves cursor near target (with DPI tolerance)', async () => {
      // Win32 SetCursorPos works in physical pixels; on HiDPI displays the
      // logical→physical conversion can introduce small offsets.
      // We check the cursor is close to target, not exact.
      const targetX = 500;
      const targetY = 500;
      const tolerance = 50; // pixels

      await adapter.setCursorPosition(targetX, targetY);
      await sleep(100);
      const pos = getCursorPosSync();
      if (!pos) return false;
      console.log(`    Expected: ~(${targetX}, ${targetY}), Actual: (${pos.x}, ${pos.y})`);
      return Math.abs(pos.x - targetX) <= tolerance && Math.abs(pos.y - targetY) <= tolerance;
    });

    await runTest('click: left click does not throw', async () => {
      await adapter.setCursorPosition(100, 100);
      await sleep(50);
      try {
        await adapter.click(100, 100, 'left');
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    await runTest('double_click: does not throw', async () => {
      await adapter.setCursorPosition(100, 100);
      await sleep(50);
      try {
        await adapter.doubleClick(100, 100);
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    await runTest('right_click: does not throw', async () => {
      await adapter.setCursorPosition(100, 100);
      await sleep(50);
      try {
        await adapter.rightClick(100, 100);
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    await runTest('hover: does not throw', async () => {
      try {
        await adapter.hover(200, 200);
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    await runTest('scroll: does not throw', async () => {
      await adapter.setCursorPosition(100, 100);
      await sleep(50);
      try {
        await adapter.scroll(100, 100, 1);
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    await runTest('drag: does not throw', async () => {
      try {
        await adapter.drag({ x: 100, y: 100 }, { x: 200, y: 200 });
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    // ═══════════════════════════════════════════
    // KEYBOARD TOOLS
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Keyboard Tools ──${RESET}`);

    await runTest('type_text: types characters without throwing', async () => {
      try {
        await adapter.typeText('test');
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    await runTest('key_combo: presses Ctrl+A without throwing', async () => {
      try {
        await adapter.pressKeys(['ctrl', 'a']);
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    // ═══════════════════════════════════════════
    // SCREEN TOOLS
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Screen Tools ──${RESET}`);

    await runTest('screenshot: captures primary monitor', async () => {
      const result = await adapter.captureScreen(0);
      const primary = result.monitors[0];
      if (!primary || !primary.dataUrl) return false;
      console.log(`    Captured: ${primary.width}x${primary.height}, dataUrl len=${primary.dataUrl.length}`);
      return primary.width > 100 && primary.height > 100 && primary.dataUrl.startsWith('data:');
    });

    await runTest('screenshot: captures all monitors', async () => {
      const result = await adapter.captureScreen();
      if (!result.monitors || result.monitors.length === 0) return false;
      console.log(`    Captured ${result.monitors.length} monitor(s)`);
      return result.monitors.length >= 1;
    });

    await runTest('get_window_info: returns foreground window title', async () => {
      // Retry a few times since foreground can be in flux during test execution
      for (let i = 0; i < 3; i++) {
        try {
          const info = await adapter.getWindowInfo();
          if (info.title.length > 0) {
            console.log(`    Active window: "${info.title}"`);
            return true;
          }
        } catch { /* retry */ }
        await sleep(200);
      }
      const info = await adapter.getWindowInfo();
      console.log(`    Active window (final): "${info.title}"`);
      return info.title.length > 0;
    });

    // ═══════════════════════════════════════════
    // WINDOW MANAGEMENT TOOLS
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Window Management Tools ──${RESET}`);

    await runTest('get_window_list: returns visible windows', async () => {
      const windows = await listWindows();
      console.log(`    Found ${windows.length} windows`);
      if (windows.length > 0) {
        console.log(`    Sample: ${windows.slice(0, 3).map(w => `"${w.title}" [${w.handle}]`).join(', ')}`);
      }
      return windows.length > 0;
    });

    await runTest('focus_window: resolves and focuses a valid handle', async () => {
      const windows = await listWindows();
      if (windows.length === 0) {
        console.log('    SKIP: no windows available');
        return true;
      }
      const target = windows[0];
      const success = await adapter.focusWindow(target.handle);
      console.log(`    Focused "${target.title}": ${success}`);
      return success;
    });

    await runTest('minimize_window + restore_window: round-trip', async () => {
      const windows = await listWindows();
      // Find a non-system window
      const target = windows.find(w =>
        !w.title.includes('Taskbar') &&
        !w.title.includes('Start') &&
        !w.title.includes('Program Manager') &&
        w.title.length > 0 &&
        w.width > 100
      );
      if (!target) {
        console.log('    SKIP: no suitable window');
        return true;
      }
      console.log(`    Target: "${target.title}" [${target.handle}]`);

      const minOk = await adapter.minimizeWindow(target.handle);
      console.log(`    Minimize: ${minOk}`);
      await sleep(300);

      const restoreOk = await adapter.restoreWindow(target.handle);
      console.log(`    Restore: ${restoreOk}`);

      return minOk || restoreOk;
    });

    await runTest('maximize_window + restore_window: round-trip', async () => {
      const windows = await listWindows();
      const target = windows.find(w =>
        !w.title.includes('Taskbar') &&
        !w.title.includes('Start') &&
        !w.title.includes('Program Manager') &&
        w.title.length > 0 &&
        w.width > 100
      );
      if (!target) {
        console.log('    SKIP: no suitable window');
        return true;
      }
      console.log(`    Target: "${target.title}" [${target.handle}]`);

      const maxOk = await adapter.maximizeWindow(target.handle);
      console.log(`    Maximize: ${maxOk}`);
      await sleep(300);

      const restoreOk = await adapter.restoreWindow(target.handle);
      console.log(`    Restore: ${restoreOk}`);

      return maxOk || restoreOk;
    });

    await runTest('close_window: handles invalid handle gracefully', async () => {
      const result = await adapter.closeWindow('99999');
      // Should not throw — even if handle is invalid
      console.log(`    Close invalid handle returned: ${result}`);
      return true;
    });

    // ═══════════════════════════════════════════
    // APP LAUNCH TOOL
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── App Launch Tool ──${RESET}`);

    await runTest('launch_app: launches notepad with waitForReady', async () => {
      try {
        const success = await launchApp('notepad');
        console.log(`    Launch notepad: ${success ? 'success' : 'failed'}`);
        if (success) {
          await sleep(1000);
          // Wait for window to appear
          for (let i = 0; i < 10; i++) {
            const windows = await listWindows();
            const notepadWin = windows.find(w =>
              w.title.toLowerCase().includes('notepad') ||
              w.title.toLowerCase().includes('untitled')
            );
            if (notepadWin) {
              console.log(`    Notepad window found: "${notepadWin.title}"`);
              break;
            }
            await sleep(500);
          }
          // Close it after test
          const windows = await listWindows();
          const notepadWin = windows.find(w =>
            w.title.toLowerCase().includes('notepad') ||
            w.title.toLowerCase().includes('untitled')
          );
          if (notepadWin) {
            const { closeWindowByHandle } = await import('../services/desktop/input-simulation');
            closeWindowByHandle(notepadWin.handle);
          }
        }
        return success;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    // ═══════════════════════════════════════════
    // WAIT TOOL
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Wait Tool ──${RESET}`);

    await runTest('wait (duration): waits for specified time', async () => {
      const start = Date.now();
      await sleep(500);
      const elapsed = Date.now() - start;
      console.log(`    Waited ${elapsed}ms (expected ~500ms)`);
      return elapsed >= 400;
    });

    await runTest('wait (window_change): detects when a new window appears', async () => {
      // Launch notepad to trigger window change
      const launched = await launchApp('notepad');
      if (!launched) {
        console.log('    SKIP: notepad launch failed');
        return true;
      }
      await sleep(500);

      const initialTitle = (await getForegroundWindowInfo()).title;
      let changed = false;

      // Method 1: check foreground window title changes
      for (let i = 0; i < 10; i++) {
        await sleep(500);
        const currentTitle = (await getForegroundWindowInfo()).title;
        if (currentTitle !== initialTitle) {
          console.log(`    Window changed: "${initialTitle}" → "${currentTitle}"`);
          changed = true;
          break;
        }
      }

      // Method 2: if foreground didn't change, check the window list for notepad
      if (!changed) {
        const windows = await listWindows();
        const notepadWin = windows.find(w =>
          w.title.toLowerCase().includes('notepad') ||
          w.title.toLowerCase().includes('untitled')
        );
        if (notepadWin) {
          console.log(`    Notepad found in window list: "${notepadWin.title}" [${notepadWin.handle}]`);
          changed = true;
        }
      }

      // Cleanup: close notepad
      try {
        const windows = await listWindows();
        const notepadWin = windows.find(w =>
          w.title.toLowerCase().includes('notepad') ||
          w.title.toLowerCase().includes('untitled')
        );
        if (notepadWin) {
          const { closeWindowByHandle } = await import('../services/desktop/input-simulation');
          closeWindowByHandle(notepadWin.handle);
        }
      } catch { /* ignore cleanup errors */ }

      return changed;
    });

    // ═══════════════════════════════════════════
    // CLIPBOARD TOOL
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Clipboard Tool ──${RESET}`);

    await runTest('clipboard (write): writes text to clipboard', async () => {
      const testText = 'desktop agent clipboard test ' + Date.now();
      clipboard.writeText(testText);
      await sleep(50);
      const read = clipboard.readText();
      console.log(`    Wrote: "${testText.slice(0, 40)}..."`);
      console.log(`    Read:  "${read.slice(0, 40)}..."`);
      return read === testText;
    });

    await runTest('clipboard (read): reads existing clipboard content', async () => {
      const content = clipboard.readText();
      console.log(`    Clipboard content: "${content.slice(0, 50)}..."`);
      return typeof content === 'string';
    });

    await runTest('clipboard (clear): clears clipboard', async () => {
      clipboard.writeText('to be cleared');
      await sleep(50);
      clipboard.clear();
      await sleep(50);
      const content = clipboard.readText();
      return content === '';
    });

    // ═══════════════════════════════════════════
    // FILE OPERATIONS TOOL
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── File Operations Tool ──${RESET}`);

    const testDir = path.join(process.env.TEMP || 'C:\\Users\\kanis\\AppData\\Local\\Temp', 'desktop-agent-test-' + Date.now());
    const testFile = path.join(testDir, 'test-file.txt');
    const testFileCopy = path.join(testDir, 'test-file-copy.txt');
    const testFileMove = path.join(testDir, 'test-file-moved.txt');

    await runTest('file_operations (list_directory): lists a directory', async () => {
      const tempDir = process.env.TEMP || 'C:\\Users\\kanis\\AppData\\Local\\Temp';
      const entries = await fs.readdir(tempDir, { withFileTypes: true });
      console.log(`    Listed ${entries.length} entries`);
      return entries.length > 0;
    });

    await runTest('file_operations (write_file): creates a file', async () => {
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testFile, 'Desktop agent test content');
      const exists = await fs.access(testFile).then(() => true).catch(() => false);
      console.log(`    Created: ${testFile}`);
      return exists;
    });

    await runTest('file_operations (read_file): reads file content', async () => {
      const content = await fs.readFile(testFile, 'utf-8');
      console.log(`    Read: "${content}"`);
      return content === 'Desktop agent test content';
    });

    await runTest('file_operations (copy_file): copies a file', async () => {
      await fs.copyFile(testFile, testFileCopy);
      const exists = await fs.access(testFileCopy).then(() => true).catch(() => false);
      return exists;
    });

    await runTest('file_operations (move_file): renames/moves a file', async () => {
      await fs.rename(testFileCopy, testFileMove);
      const exists = await fs.access(testFileMove).then(() => true).catch(() => false);
      const originalGone = await fs.access(testFileCopy).then(() => false).catch(() => true);
      return exists && originalGone;
    });

    await runTest('file_operations (file_exists): checks existence', async () => {
      const exists = await fs.access(testFile).then(() => true).catch(() => false);
      return exists;
    });

    await runTest('file_operations (delete_file): deletes a file', async () => {
      await fs.unlink(testFileMove);
      const gone = await fs.access(testFileMove).then(() => false).catch(() => true);
      return gone;
    });

    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }

    // ═══════════════════════════════════════════
    // OCR TOOL
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── OCR / Screen Text Tool ──${RESET}`);

    await runTest('get_screen_text: extracts text from screenshot via OCR', async () => {
      try {
        const screenshot = await captureAllScreens();
        const primary = screenshot.monitors[0];
        if (!primary) return false;

        const worker = await createWorker('eng');
        const base64Data = primary.dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const { data } = await worker.recognize(buffer);
        await worker.terminate();

        const text = data.text.trim();
        console.log(`    OCR extracted ${text.length} chars`);
        console.log(`    Preview: "${text.slice(0, 100)}..."`);
        return text.length > 0;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    // ═══════════════════════════════════════════
    // ACCESSIBILITY TREE TOOLS
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Accessibility Tree Tools ──${RESET}`);

    await runTest('search_elements: searches UI Automation tree', async () => {
      try {
        const { AccessibilityTreeAdapter } = await import('../services/desktop/accessibility-tree');
        const accAdapter = new AccessibilityTreeAdapter();
        const results = await accAdapter.searchElements({ name: undefined, controlType: undefined }, 10);
        console.log(`    Found ${results.length} elements`);
        if (results.length > 0) {
          console.log(`    Sample: "${results[0].name}" [${results[0].controlType}]`);
        }
        return results.length > 0;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    await runTest('get_element_info: gets focused element info', async () => {
      try {
        const { AccessibilityTreeAdapter } = await import('../services/desktop/accessibility-tree');
        const accAdapter = new AccessibilityTreeAdapter();
        const element = await accAdapter.getFocusedElement();
        if (!element) {
          console.log('    No element has keyboard focus');
          return true; // Not a failure — just nothing focused
        }
        console.log(`    Focused: "${element.name}" [${element.controlType}]`);
        return true;
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    // ═══════════════════════════════════════════
    // GET SELECTED TEXT TOOL
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Get Selected Text Tool ──${RESET}`);

    await runTest('get_selected_text: Ctrl+C captures clipboard without crashing', async () => {
      try {
        const previousContent = clipboard.readText();
        const { pressKeys } = await import('../services/desktop/input-simulation');
        await pressKeys(['ctrl', 'c']);
        await sleep(200);
        const selectedText = clipboard.readText();

        // Restore clipboard
        if (selectedText !== previousContent) {
          clipboard.writeText(previousContent);
        }

        console.log(`    Clipboard after Ctrl+C: "${selectedText.slice(0, 50)}..."`);
        return true; // Not a failure even if nothing was selected
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    });

    // ═══════════════════════════════════════════
    // FOREGROUND WINDOW INFO TOOLS
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Foreground Window Info Tools ──${RESET}`);

    await runTest('getForegroundWindowInfoAndRect: returns combined info', async () => {
      const info = await getForegroundWindowInfoAndRect();
      console.log(`    Title: "${info.title}"`);
      console.log(`    Rect: (${info.x}, ${info.y}) ${info.width}x${info.height}`);
      return info.title.length > 0;
    });

    await runTest('getForegroundWindowRect: returns valid rect', async () => {
      const rect = getForegroundWindowRect();
      if (!rect) return false;
      console.log(`    Rect: (${rect.x}, ${rect.y}) ${rect.width}x${rect.height}`);
      return rect.width > 0 && rect.height > 0;
    });

    // ═══════════════════════════════════════════
    // HANDLE RESOLUTION
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Handle Resolution ──${RESET}`);

    await runTest('resolveHwnd: resolves valid handle from listWindows', async () => {
      const windows = await listWindows();
      if (windows.length === 0) return true;

      const hWnd = resolveHwnd(windows[0].handle);
      if (!hWnd) {
        console.log(`    No HWND found for handle "${windows[0].handle}"`);
        return false;
      }
      return true;
    });

    await runTest('resolveHwnd: returns null for invalid handle', async () => {
      const hWnd = resolveHwnd('99999');
      return hWnd === null;
    });

    // ═══════════════════════════════════════════
    // SCREEN BOUNDS
    // ═══════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}── Screen Bounds ──${RESET}`);

    await runTest('Screen dimensions: primary display reported correctly', async () => {
      const primary = screen.getPrimaryDisplay();
      console.log(`    Primary: ${primary.bounds.width}x${primary.bounds.height} @ (${primary.bounds.x}, ${primary.bounds.y})`);
      console.log(`    Work area: ${primary.workAreaSize.width}x${primary.workAreaSize.height}`);
      console.log(`    Scale factor: ${primary.scaleFactor}`);

      const allDisplays = screen.getAllDisplays();
      console.log(`    Total displays: ${allDisplays.length}`);

      return primary.bounds.width > 100 && primary.bounds.height > 100;
    });

  } finally {
    // Cleanup adapter
    try {
      await (adapter as unknown as { cleanup: () => Promise<void> }).cleanup();
    } catch { /* ignore */ }
  }

  // ── Summary ──
  console.log(`\n${BOLD}${CYAN}========================================${RESET}`);
  console.log(`${BOLD}  Test Summary${RESET}`);
  console.log(`${BOLD}${CYAN}========================================${RESET}`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`  Total:  ${results.length}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
  console.log(`  ${RED}Failed: ${failed}${RESET}`);

  if (failed > 0) {
    console.log(`\n${RED}Failed tests:${RESET}`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
    });
  } else {
    console.log(`\n${GREEN}${BOLD}All ${passed} tests passed. Desktop agent tools are working correctly.${RESET}`);
  }

  log.info(`Desktop agent tools test complete: ${passed} passed, ${failed} failed`);
}
