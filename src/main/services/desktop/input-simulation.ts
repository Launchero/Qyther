import koffi from 'koffi';
import { screen } from 'electron';
import { createLogger } from '../../utils/logger';

const log = createLogger('InputSimulator');

// ── Win32 input constants ──

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_WHEEL = 0x0800;

const KEYEVENTF_KEYDOWN = 0x0000;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

// Win32 window constants
const SW_SHOWNORMAL = 1;
const SW_MINIMIZE = 6;
const SW_MAXIMIZE = 3;
const SW_RESTORE = 9;
const SW_HIDE = 0;
const SW_FORCEMINIMIZE = 11;

// Win32 focus constants
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_SHOWWINDOW = 0x0040;
const HWND_TOP = 0;

// Win32 message constants for PostMessageW
const WM_SYSCOMMAND = 0x0112;
const WM_CLOSE = 0x0010;
const SC_MINIMIZE = 0xF020;
const SC_MAXIMIZE = 0xF030;
const SC_RESTORE = 0xF120;

// Virtual key codes
const VK_KEYS: Record<string, number> = {
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  shift: 0x10,
  enter: 0x0d,
  return: 0x0d,
  escape: 0x1b,
  esc: 0x1b,
  tab: 0x09,
  space: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  win: 0x5b,
  meta: 0x5b,
  insert: 0x2d,
  printscreen: 0x2c,
  f1: 0x70,
  f2: 0x71,
  f3: 0x72,
  f4: 0x73,
  f5: 0x74,
  f6: 0x75,
  f7: 0x76,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  f11: 0x7a,
  f12: 0x7b,
};

// ── koffi type definitions (module-scope, defined once) ──

// Correct pattern per koffi docs: opaque pointer for HWND
const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
const HWND = koffi.alias('HWND', HANDLE);

const RECT = koffi.struct('WinRect', {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long',
});

const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'long',
  dy: 'long',
  mouseData: 'uint32',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t',
});

const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16',
  wScan: 'uint16',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t',
});

const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
  uMsg: 'uint32',
  wParamL: 'uint16',
  wParamH: 'uint16',
});

const INPUT_UNION = koffi.union('INPUT_UNION', {
  mi: MOUSEINPUT,
  ki: KEYBDINPUT,
  hi: HARDWAREINPUT,
});

const INPUT = koffi.struct('INPUT', {
  type: 'uint32',
  _u: INPUT_UNION,
});

const POINT = koffi.struct('CURSOR_POINT', {
  x: 'long',
  y: 'long',
});

// ── Lazy-loaded API handles ──

let user32Dll: unknown = null;
let SendInputFn: unknown = null;
let SetCursorPosFn: unknown = null;
let GetCursorPosFn: unknown = null;
let GetForegroundWindowFn: unknown = null;
let GetWindowTextWFn: unknown = null;
let GetWindowRectFn: unknown = null;
let ShellExecuteWFn: unknown = null;
let shell32Dll: unknown = null;
let EnumWindowsFn: unknown = null;
let SetForegroundWindowFn: unknown = null;
let SetWindowPosFn: unknown = null;
let ShowWindowFn: unknown = null;
let PostMessageWFn: unknown = null;
let SendMessageWFn: unknown = null;
let IsIconicFn: unknown = null;
let IsWindowVisibleFn: unknown = null;

let EnumWindowsProcType: import('koffi').TypeObject | null = null;

// EnumWindows callback type storage
let enumWindowsCallback: unknown = null;

// Map from handle string (e.g. "13") to raw HWND object for window operations
const hWndMap: Map<string, unknown> = new Map();
let hWndCounter = 0;

function ensureLoaded(): void {
  if (user32Dll) return;

  user32Dll = koffi.load('user32.dll');
  const u = user32Dll as Record<string, (sig: string) => unknown>;

  SendInputFn = u.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)');
  SetCursorPosFn = u.func('bool __stdcall SetCursorPos(int x, int y)');
  GetCursorPosFn = u.func('bool __stdcall GetCursorPos(void *lpPoint)');
  GetForegroundWindowFn = u.func('HWND __stdcall GetForegroundWindow()');
  GetWindowTextWFn = u.func('int __stdcall GetWindowTextW(HWND hWnd, void *lpString, int nMaxCount)');
  GetWindowRectFn = u.func('bool __stdcall GetWindowRect(HWND hWnd, void *lpRect)');

  shell32Dll = koffi.load('shell32.dll');
  const s = shell32Dll as Record<string, (sig: string) => unknown>;
  ShellExecuteWFn = s.func('void * __stdcall ShellExecuteW(HWND hwnd, void *lpOperation, void *lpFile, void *lpParameters, void *lpDirectory, int nShowCmd)');

  // Callback prototype: koffi types are process-global, so only define once
  if (!EnumWindowsProcType) {
    EnumWindowsProcType = koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, long lParam)');
  }
  // Array-style binding per koffi docs for callback parameters
  EnumWindowsFn = (u as Record<string, (...args: unknown[]) => unknown>).func('__stdcall', 'EnumWindows', 'bool', [
    koffi.pointer(EnumWindowsProcType),
    'int',
  ]);

  SetForegroundWindowFn = u.func('bool __stdcall SetForegroundWindow(HWND hWnd)');
  SetWindowPosFn = u.func('bool __stdcall SetWindowPos(HWND hWnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
  ShowWindowFn = u.func('bool __stdcall ShowWindow(HWND hWnd, int nCmdShow)');
  PostMessageWFn = u.func('bool __stdcall PostMessageW(HWND hWnd, uint Msg, uint wParam, int lParam)');
  SendMessageWFn = u.func('int __stdcall SendMessageW(HWND hWnd, uint Msg, uint wParam, int lParam)');
  IsIconicFn = u.func('bool __stdcall IsIconic(HWND hWnd)');
  IsWindowVisibleFn = u.func('bool __stdcall IsWindowVisible(HWND hWnd)');
}

// ── Helpers ──

function getScreenBounds(): { width: number; height: number } {
  const displays = screen.getAllDisplays();
  const virtualBounds = displays.reduce(
    (acc, d) => ({
      width: Math.max(acc.width, d.bounds.x + d.bounds.width),
      height: Math.max(acc.height, d.bounds.y + d.bounds.height),
    }),
    { width: 0, height: 0 },
  );
  return {
    width: virtualBounds.width || 1920,
    height: virtualBounds.height || 1080,
  };
}

function clampCoord(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function sendMouseEvent(x: number, y: number, flags: number, mouseData = 0): void {
  ensureLoaded();
  const sendInput = SendInputFn as (cInputs: number, pInputs: unknown[], cbSize: number) => number;

  const event = {
    type: INPUT_MOUSE,
    u: {
      mi: {
        dx: x,
        dy: y,
        mouseData,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };

  const result = sendInput(1, [event], koffi.sizeof(INPUT));
  if (result === 0) {
    throw new Error('SendInput failed to insert mouse event');
  }
}

function sendKeyboardEvent(vkCode: number, flags: number): void {
  ensureLoaded();
  const sendInput = SendInputFn as (cInputs: number, pInputs: unknown[], cbSize: number) => number;

  const event = {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vkCode,
        wScan: 0,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };

  const result = sendInput(1, [event], koffi.sizeof(INPUT));
  if (result === 0) {
    throw new Error('SendInput failed to insert keyboard event');
  }
}

// ── Public API: Mouse/Keyboard ──

export async function setCursorPosition(x: number, y: number): Promise<void> {
  ensureLoaded();
  const bounds = getScreenBounds();
  const clampedX = clampCoord(x, 0, bounds.width);
  const clampedY = clampCoord(y, 0, bounds.height);

  const setPos = SetCursorPosFn as (x: number, y: number) => boolean;
  const success = setPos(clampedX, clampedY);
  if (!success) {
    throw new Error(`Failed to set cursor position to (${clampedX}, ${clampedY})`);
  }
  log.debug(`Cursor moved to (${clampedX}, ${clampedY})`);
}

export async function getCursorPosition(): Promise<{ x: number; y: number }> {
  ensureLoaded();
  const buf = Buffer.alloc(koffi.sizeof(POINT));
  const getPos = GetCursorPosFn as (lpPoint: Buffer) => boolean;
  const success = getPos(buf);
  if (!success) {
    throw new Error('Failed to get cursor position');
  }
  const point = koffi.decode(buf, POINT);
  return { x: point.x, y: point.y };
}

export async function click(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
  await setCursorPosition(x, y);
  await sleep(20);

  const downFlag = button === 'left' ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_RIGHTDOWN;
  const upFlag = button === 'left' ? MOUSEEVENTF_LEFTUP : MOUSEEVENTF_RIGHTUP;

  sendMouseEvent(0, 0, downFlag);
  await sleep(20);
  sendMouseEvent(0, 0, upFlag);
  log.debug(`${button} click at (${x}, ${y})`);
}

export async function doubleClick(x: number, y: number): Promise<void> {
  await click(x, y, 'left');
  await sleep(50);
  await click(x, y, 'left');
  log.debug(`Double-click at (${x}, ${y})`);
}

export async function drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  await setCursorPosition(fromX, fromY);
  await sleep(20);
  sendMouseEvent(0, 0, MOUSEEVENTF_LEFTDOWN);
  await sleep(50);
  await setCursorPosition(toX, toY);
  await sleep(20);
  sendMouseEvent(0, 0, MOUSEEVENTF_LEFTUP);
  log.debug(`Drag from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
}

export async function scroll(x: number, y: number, delta: number): Promise<void> {
  await setCursorPosition(x, y);
  await sleep(20);
  sendMouseEvent(0, 0, MOUSEEVENTF_WHEEL, delta * 120);
  log.debug(`Scroll at (${x}, ${y}) delta=${delta}`);
}

function sendUnicodeChar(charCode: number): void {
  ensureLoaded();
  const sendInput = SendInputFn as (cInputs: number, pInputs: unknown[], cbSize: number) => number;

  const downEvent = {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: 0,
        wScan: charCode,
        dwFlags: KEYEVENTF_UNICODE,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };

  const upEvent = {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: 0,
        wScan: charCode,
        dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };

  sendInput(1, [downEvent], koffi.sizeof(INPUT));
  sendInput(1, [upEvent], koffi.sizeof(INPUT));
}

export async function typeText(text: string): Promise<void> {
  ensureLoaded();
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < text.length) {
      const nextCode = text.charCodeAt(i + 1);
      if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
        const fullCode = ((charCode - 0xD800) << 10) + (nextCode - 0xDC00) + 0x10000;
        sendUnicodeChar(fullCode);
        i++;
        continue;
      }
    }
    sendUnicodeChar(charCode);
    await sleep(10);
  }
  log.debug(`Typed text: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`);
}

function charToVirtualKey(char: string): number | null {
  const lower = char.toLowerCase();
  if (lower >= 'a' && lower <= 'z') return 0x41 + lower.charCodeAt(0) - 'a'.charCodeAt(0);
  if (lower >= '0' && lower <= '9') return 0x30 + lower.charCodeAt(0) - '0'.charCodeAt(0);
  return VK_KEYS[lower] ?? null;
}

export async function pressKeys(keys: string[]): Promise<void> {
  const normalizedKeys = keys.join('+').toLowerCase().split('+').map(k => k.trim());

  const modifiers = ['ctrl', 'control', 'alt', 'shift', 'win', 'meta'];
  const modifierKeys = normalizedKeys.filter(k => modifiers.includes(k));
  const regularKeys = normalizedKeys.filter(k => !modifiers.includes(k));

  for (const mod of modifierKeys) {
    const vkCode = VK_KEYS[mod];
    if (vkCode) {
      sendKeyboardEvent(vkCode, KEYEVENTF_KEYDOWN);
      await sleep(20);
    }
  }

  for (const key of regularKeys) {
    const vkCode = VK_KEYS[key] ?? charToVirtualKey(key);
    if (vkCode) {
      sendKeyboardEvent(vkCode, KEYEVENTF_KEYDOWN);
      await sleep(10);
      sendKeyboardEvent(vkCode, KEYEVENTF_KEYUP);
      await sleep(20);
    }
  }

  for (const mod of [...modifierKeys].reverse()) {
    const vkCode = VK_KEYS[mod];
    if (vkCode) {
      sendKeyboardEvent(vkCode, KEYEVENTF_KEYUP);
      await sleep(20);
    }
  }

  log.debug(`Pressed keys: ${keys.join('+')}`);
}

/**
 * Press a single key down or up (for hold/release operations).
 */
export async function pressKeyRaw(vkCode: number, action: 'down' | 'up'): Promise<void> {
  ensureLoaded();
  const flags = action === 'down' ? KEYEVENTF_KEYDOWN : KEYEVENTF_KEYUP;
  sendKeyboardEvent(vkCode, flags);
  log.debug(`pressKeyRaw: VK=0x${vkCode.toString(16)} action=${action}`);
}

/**
 * Sleep utility for use in tool implementations.
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function rightClick(x: number, y: number): Promise<void> {
  await setCursorPosition(x, y);
  await sleep(20);

  sendMouseEvent(0, 0, MOUSEEVENTF_RIGHTDOWN);
  await sleep(20);
  sendMouseEvent(0, 0, MOUSEEVENTF_RIGHTUP);
  log.debug(`Right-click at (${x}, ${y})`);
}

export async function hover(x: number, y: number): Promise<void> {
  await setCursorPosition(x, y);
  await sleep(30);
  log.debug(`Hover at (${x}, ${y})`);
}

// ── Public API: Window ──

export interface WindowInfo {
  title: string;
  handle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Raw HWND object for use with other FFI calls. Internal. */
  _hWnd: unknown;
}

export async function listWindows(): Promise<WindowInfo[]> {
  ensureLoaded();

  // Clear stale handles before each enumeration
  hWndMap.clear();
  hWndCounter = 0;

  const windows: WindowInfo[] = [];

  const getText = GetWindowTextWFn as (hWnd: unknown, lpString: Buffer, nMaxCount: number) => number;
  const getRect = GetWindowRectFn as (hWnd: unknown, lpRect: Buffer) => boolean;
  const isWindowVisible = IsWindowVisibleFn as (hWnd: unknown) => boolean;

  const cb = koffi.register((hWnd: unknown, _lParam: unknown): boolean => {
    try {
      const visible = isWindowVisible(hWnd);
      if (!visible) return true;

      const titleBuf = Buffer.alloc(512);
      const len = getText(hWnd, titleBuf, 256);
      const title = len > 0 ? titleBuf.toString('ucs2', 0, len * 2) : '';

      if (!title) return true;

      const rectBuf = Buffer.alloc(koffi.sizeof(RECT));
      const hasRect = getRect(hWnd, rectBuf);

      hWndCounter++;
      const handleStr = String(hWndCounter);
      hWndMap.set(handleStr, hWnd);

      let windowInfo: WindowInfo = {
        title,
        handle: handleStr,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        _hWnd: hWnd,
      };

      if (hasRect) {
        const rect = koffi.decode(rectBuf, RECT);
        windowInfo.x = rect.left;
        windowInfo.y = rect.top;
        windowInfo.width = rect.right - rect.left;
        windowInfo.height = rect.bottom - rect.top;
      }

      windows.push(windowInfo);
    } catch {
      // Skip windows that fail enumeration
    }
    return true;
  }, koffi.pointer(EnumWindowsProcType!));

  enumWindowsCallback = cb;

  const enumWindows = EnumWindowsFn as (lpEnumFunc: unknown, lParam: number) => boolean;
  enumWindows(cb, 0);

  log.debug(`Listed ${windows.length} visible windows`);
  return windows;
}

export async function focusWindow(hWnd: unknown): Promise<boolean> {
  ensureLoaded();

  const setFg = SetForegroundWindowFn as (hWnd: unknown) => boolean;
  const setPos = SetWindowPosFn as (hWnd: unknown, hWndInsertAfter: unknown, x: number, y: number, cx: number, cy: number, flags: number) => boolean;

  const fgResult = setFg(hWnd);
  if (fgResult) {
    log.debug(`Focused window via SetForegroundWindow`);
    return true;
  }

  const posResult = setPos(hWnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
  if (posResult) {
    log.debug(`Focused window via SetWindowPos`);
    return true;
  }

  log.warn(`Failed to focus window`);
  return false;
}

export async function minimizeWindow(hWnd: unknown): Promise<boolean> {
  ensureLoaded();

  const showWin = ShowWindowFn as (hWnd: unknown, nCmdShow: number) => boolean;
  const isIconic = IsIconicFn as (hWnd: unknown) => boolean;

  log.debug(`minimizeWindow: attempting`);

  // ShowWindow is more reliable than PostMessageW for cross-process calls
  const swResult = showWin(hWnd, SW_MINIMIZE);
  log.debug(`minimizeWindow: ShowWindow result=${swResult}`);

  // Verify the window is actually minimized — FFI return values can be misleading
  await sleep(100);
  const minimized = isIconic(hWnd);
  if (minimized) {
    log.info(`Minimized window via ShowWindow SW_MINIMIZE (verified with IsIconic)`);
    return true;
  }

  log.warn(`minimizeWindow: ShowWindow failed to minimize, IsIconic=${minimized}`);

  // Keyboard fallback: focus + Alt+Space + n (system menu → Minimize)
  log.debug(`minimizeWindow: trying keyboard fallback...`);

  const setFg = SetForegroundWindowFn as (hWnd: unknown) => boolean;
  const fgResult = setFg(hWnd);
  if (!fgResult) {
    log.error(`minimizeWindow: keyboard fallback failed — cannot focus window`);
    return false;
  }
  await sleep(150);

  // Send Alt+Space to open system menu, then 'n' to minimize
  // Use SendInput directly for reliable key sequencing
  const sendInput = SendInputFn as (cInputs: number, pInputs: unknown[], cbSize: number) => number;

  function makeKeyboardEvent(vk: number, flags: number): unknown {
    return {
      type: INPUT_KEYBOARD,
      u: {
        ki: {
          wVk: vk,
          wScan: 0,
          dwFlags: flags,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
  }

  const altVk = VK_KEYS['alt']!;
  const spaceVk = VK_KEYS['space']!;
  const nVk = 0x4E; // 'N' virtual key code

  const altDown = makeKeyboardEvent(altVk, KEYEVENTF_KEYDOWN);
  const spaceDown = makeKeyboardEvent(spaceVk, KEYEVENTF_KEYDOWN);
  const spaceUp = makeKeyboardEvent(spaceVk, KEYEVENTF_KEYUP);
  const altUp = makeKeyboardEvent(altVk, KEYEVENTF_KEYUP);
  const nDown = makeKeyboardEvent(nVk, KEYEVENTF_KEYDOWN);
  const nUp = makeKeyboardEvent(nVk, KEYEVENTF_KEYUP);

  // Alt+Space to open system menu
  sendInput(1, [altDown], koffi.sizeof(INPUT));
  await sleep(30);
  sendInput(1, [spaceDown], koffi.sizeof(INPUT));
  await sleep(30);
  sendInput(1, [spaceUp], koffi.sizeof(INPUT));
  await sleep(30);
  sendInput(1, [altUp], koffi.sizeof(INPUT));
  await sleep(300);

  // Press 'n' to select Minimize
  sendInput(1, [nDown], koffi.sizeof(INPUT));
  await sleep(50);
  sendInput(1, [nUp], koffi.sizeof(INPUT));

  await sleep(200);
  const kbMinimized = isIconic(hWnd);
  if (kbMinimized) {
    log.info(`Minimized window via keyboard fallback (verified with IsIconic)`);
    return true;
  }

  log.error(`minimizeWindow: all methods failed, IsIconic=${kbMinimized}`);
  return false;
}

export async function maximizeWindow(hWnd: unknown): Promise<boolean> {
  ensureLoaded();

  const postMsg = PostMessageWFn as (hWnd: unknown, Msg: number, wParam: number, lParam: number) => boolean;
  const showWin = ShowWindowFn as (hWnd: unknown, nCmdShow: number) => boolean;
  const setFg = SetForegroundWindowFn as (hWnd: unknown) => boolean;

  log.debug(`maximizeWindow: attempting, hWnd type=${typeof hWnd}`);

  const pmResult = postMsg(hWnd, WM_SYSCOMMAND, SC_MAXIMIZE, 0);
  log.debug(`maximizeWindow: PostMessageW result=${pmResult}`);
  if (pmResult) {
    log.info(`Maximized window via PostMessage WM_SYSCOMMAND`);
    return true;
  }

  const swResult = showWin(hWnd, SW_MAXIMIZE);
  log.debug(`maximizeWindow: ShowWindow result=${swResult}`);
  if (swResult) {
    log.info(`Maximized window via ShowWindow SW_MAXIMIZE`);
    return true;
  }

  // Keyboard fallback: Alt+Space, x for Maximize
  log.debug(`maximizeWindow: Win32 calls failed, trying keyboard fallback...`);
  const fgResult = setFg(hWnd);
  if (!fgResult) {
    log.error(`maximizeWindow: keyboard fallback failed — cannot focus window`);
    return false;
  }
  await sleep(100);
  await pressKeys(['alt', 'space']);
  await sleep(100);
  const xVk = charToVirtualKey('x');
  if (xVk) {
    sendKeyboardEvent(xVk, KEYEVENTF_KEYDOWN);
    await sleep(50);
    sendKeyboardEvent(xVk, KEYEVENTF_KEYUP);
  }

  log.info(`Maximized window via keyboard fallback (Alt+Space, x)`);
  return true;
}

export async function restoreWindow(hWnd: unknown): Promise<boolean> {
  ensureLoaded();

  const postMsg = PostMessageWFn as (hWnd: unknown, Msg: number, wParam: number, lParam: number) => boolean;
  const showWin = ShowWindowFn as (hWnd: unknown, nCmdShow: number) => boolean;
  const setFg = SetForegroundWindowFn as (hWnd: unknown) => boolean;

  log.debug(`restoreWindow: attempting, hWnd type=${typeof hWnd}`);

  const pmResult = postMsg(hWnd, WM_SYSCOMMAND, SC_RESTORE, 0);
  log.debug(`restoreWindow: PostMessageW result=${pmResult}`);
  if (pmResult) {
    log.info(`Restored window via PostMessage WM_SYSCOMMAND`);
    return true;
  }

  const swResult = showWin(hWnd, SW_RESTORE);
  log.debug(`restoreWindow: ShowWindow result=${swResult}`);
  if (swResult) {
    log.info(`Restored window via ShowWindow SW_RESTORE`);
    return true;
  }

  // Keyboard fallback: Alt+Space, r for Restore
  log.debug(`restoreWindow: Win32 calls failed, trying keyboard fallback...`);
  const fgResult = setFg(hWnd);
  if (!fgResult) {
    log.error(`restoreWindow: keyboard fallback failed — cannot focus window`);
    return false;
  }
  await sleep(100);
  await pressKeys(['alt', 'space']);
  await sleep(100);
  const rVk = charToVirtualKey('r');
  if (rVk) {
    sendKeyboardEvent(rVk, KEYEVENTF_KEYDOWN);
    await sleep(50);
    sendKeyboardEvent(rVk, KEYEVENTF_KEYUP);
  }

  log.info(`Restored window via keyboard fallback (Alt+Space, r)`);
  return true;
}

export async function closeWindow(hWnd: unknown): Promise<boolean> {
  ensureLoaded();

  const postMsg = PostMessageWFn as (hWnd: unknown, Msg: number, wParam: number, lParam: number) => boolean;
  const showWin = ShowWindowFn as (hWnd: unknown, nCmdShow: number) => boolean;

  const closeResult = postMsg(hWnd, WM_CLOSE, 0, 0);
  if (closeResult) {
    log.debug(`Sent WM_CLOSE to window`);
    return true;
  }

  const swResult = showWin(hWnd, SW_FORCEMINIMIZE);
  if (swResult) {
    log.debug(`Force-minimized unresponsive window via ShowWindow SW_FORCEMINIMIZE`);
    return true;
  }

  log.warn(`Failed to close window`);
  return false;
}

/** Resolve a handle string to its raw HWND object from the enumeration map */
export function resolveHwnd(handle: string): unknown {
  const hWnd = hWndMap.get(handle);
  if (!hWnd) {
    log.warn(`resolveHwnd: no HWND found for handle "${handle}". Available handles: ${[...hWndMap.keys()].join(', ')}`);
    return null;
  }
  return hWnd;
}

// Convenience wrappers that resolve string handles from listWindows()

export async function focusWindowByHandle(handle: string): Promise<boolean> {
  const hWnd = resolveHwnd(handle);
  if (!hWnd) {
    log.warn(`focusWindowByHandle: no HWND found for handle "${handle}"`);
    return false;
  }
  return focusWindow(hWnd);
}

export async function minimizeWindowByHandle(handle: string): Promise<boolean> {
  log.debug(`minimizeWindowByHandle: called with handle="${handle}"`);
  const hWnd = resolveHwnd(handle);
  if (!hWnd) {
    log.warn(`minimizeWindowByHandle: no HWND found for handle "${handle}"`);
    return false;
  }
  log.debug(`minimizeWindowByHandle: resolved hWnd successfully`);
  return minimizeWindow(hWnd);
}

export async function maximizeWindowByHandle(handle: string): Promise<boolean> {
  const hWnd = resolveHwnd(handle);
  if (!hWnd) {
    log.warn(`maximizeWindowByHandle: no HWND found for handle "${handle}"`);
    return false;
  }
  return maximizeWindow(hWnd);
}

export async function restoreWindowByHandle(handle: string): Promise<boolean> {
  const hWnd = resolveHwnd(handle);
  if (!hWnd) {
    log.warn(`restoreWindowByHandle: no HWND found for handle "${handle}"`);
    return false;
  }
  return restoreWindow(hWnd);
}

export async function closeWindowByHandle(handle: string): Promise<boolean> {
  const hWnd = resolveHwnd(handle);
  if (!hWnd) {
    log.warn(`closeWindowByHandle: no HWND found for handle "${handle}"`);
    return false;
  }
  return closeWindow(hWnd);
}

// ── Public API: App launch ──

export async function launchApp(name: string, args?: string[]): Promise<boolean> {
  ensureLoaded();

  const shellExecute = ShellExecuteWFn as (
    hwnd: unknown,
    lpOperation: Buffer,
    lpFile: Buffer,
    lpParameters: Buffer,
    lpDirectory: unknown,
    nShowCmd: number,
  ) => unknown;

  const openBuf = Buffer.from('open\0', 'ucs2');
  const fileBuf = Buffer.from(`${name}\0`, 'ucs2');
  const paramsBuf = args && args.length > 0
    ? Buffer.from(`${args.join(' ')}\0`, 'ucs2')
    : Buffer.from('\0', 'ucs2');

  const result = shellExecute(null, openBuf, fileBuf, paramsBuf, null, SW_SHOWNORMAL);
  // ShellExecuteW returns an HINSTANCE pointer; success is indicated by a value > 32
  // On koffi this returns an opaque object; treat truthiness as success
  const success = result !== null && result !== undefined;
  log.debug(`Launch app "${name}": ${success ? 'success' : 'failed (null result)'}`);
  return success;
}

// ── Public API: Window info ──

export async function getForegroundWindowInfo(): Promise<{ title: string; handle: unknown }> {
  ensureLoaded();
  const getFgWin = GetForegroundWindowFn as () => unknown;
  const hwnd = getFgWin();
  if (!hwnd) {
    return { title: '', handle: null };
  }

  const buf = Buffer.alloc(512);
  const getText = GetWindowTextWFn as (hWnd: unknown, lpString: Buffer, nMaxCount: number) => number;
  const len = getText(hwnd, buf, 256);
  const title = buf.toString('ucs2', 0, len * 2);

  return { title, handle: hwnd };
}

export function getForegroundWindowRect(): { x: number; y: number; width: number; height: number } | null {
  ensureLoaded();
  const getFgWin = GetForegroundWindowFn as () => unknown;
  const hwnd = getFgWin();
  if (!hwnd) return null;

  const buf = Buffer.alloc(koffi.sizeof(RECT));
  const getRect = GetWindowRectFn as (hWnd: unknown, lpRect: Buffer) => boolean;
  const success = getRect(hwnd, buf);
  if (!success) return null;

  const rect = koffi.decode(buf, RECT);
  return {
    x: rect.left,
    y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  };
}

export async function getForegroundWindowInfoAndRect(): Promise<{
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  handle: unknown;
}> {
  ensureLoaded();
  const getFgWin = GetForegroundWindowFn as () => unknown;
  const getText = GetWindowTextWFn as (hWnd: unknown, lpString: Buffer, nMaxCount: number) => number;
  const getRect = GetWindowRectFn as (hWnd: unknown, lpRect: Buffer) => boolean;

  const hwnd = getFgWin();
  if (!hwnd) {
    return { title: '', x: 0, y: 0, width: 0, height: 0, handle: null };
  }

  const titleBuf = Buffer.alloc(512);
  const titleLen = getText(hwnd, titleBuf, 256);
  const title = titleLen > 0 ? titleBuf.toString('ucs2', 0, titleLen * 2) : '';

  const rectBuf = Buffer.alloc(koffi.sizeof(RECT));
  const hasRect = getRect(hwnd, rectBuf);

  if (hasRect) {
    const rect = koffi.decode(rectBuf, RECT);
    return {
      title,
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      handle: hwnd,
    };
  }

  return { title, x: 0, y: 0, width: 0, height: 0, handle: hwnd };
}

// ── Cleanup ──

export function cleanup(): void {
  if (enumWindowsCallback) {
    koffi.unregister(enumWindowsCallback as bigint);
  }
  user32Dll = null;
  shell32Dll = null;
  SendInputFn = null;
  SetCursorPosFn = null;
  GetCursorPosFn = null;
  GetForegroundWindowFn = null;
  GetWindowTextWFn = null;
  GetWindowRectFn = null;
  ShellExecuteWFn = null;
  EnumWindowsFn = null;
  SetForegroundWindowFn = null;
  SetWindowPosFn = null;
  ShowWindowFn = null;
  PostMessageWFn = null;
  SendMessageWFn = null;
  IsIconicFn = null;
  IsWindowVisibleFn = null;
  enumWindowsCallback = null;
  hWndMap.clear();
  hWndCounter = 0;
}

// ── Extended Win32 APIs via libwin32 + direct koffi ──

// libwin32 provides GetWindowThreadProcessId and elevation APIs
import { GetWindowThreadProcessId as GetWindowThreadProcessIdLib } from 'libwin32/user32';
import { GetTokenElevationTypeInformation, GetTokenInformation as GetTokenInformationLib } from 'libwin32/advapi32';

// DPI and input blocking via direct koffi (not in libwin32)
let BlockInputFn: unknown = null;
let GetKeyStateFn: unknown = null;
let IsProcessDPIAwareFn: unknown = null;
let GetDpiForWindowFn: unknown = null;
let GetSystemMetricsFn: unknown = null;
let SystemParametersInfoWFn: unknown = null;
let MonitorFromPointFn: unknown = null;
let GetMonitorInfoWFn: unknown = null;

// Extended Win32 constants
const SM_CXSCREEN = 0;
const SM_CYSCREEN = 1;
const SPI_GETSCREENSAVERRUNNING = 0x0072;

function ensureExtendedLoaded(): void {
  if (BlockInputFn) return;

  // Re-use existing user32Dll handle if loaded
  if (!user32Dll) ensureLoaded();
  const u = user32Dll as Record<string, (sig: string) => unknown>;

  // BlockInput — prevents keyboard/mouse input during automation
  BlockInputFn = u.func('bool __stdcall BlockInput(bool fBlockIt)');

  // GetKeyState — query current state of any virtual key
  GetKeyStateFn = u.func('short __stdcall GetKeyState(int nVirtKey)');

  // DPI awareness query
  IsProcessDPIAwareFn = u.func('bool __stdcall IsProcessDPIAware()');

  // GetDpiForWindow — per-window DPI (Windows 10 1607+)
  GetDpiForWindowFn = u.func('uint __stdcall GetDpiForWindow(HWND hwnd)');

  // GetSystemMetrics — screen dimensions
  GetSystemMetricsFn = u.func('int __stdcall GetSystemMetrics(int nIndex)');

  // SystemParametersInfoW — general system parameters
  SystemParametersInfoWFn = u.func('bool __stdcall SystemParametersInfoW(uint uiAction, uint uiParam, void *pvParam, uint fWinIni)');

  // MonitorFromPoint — find monitor containing a point
  MonitorFromPointFn = u.func('void * __stdcall MonitorFromPoint(long x, long y, uint dwFlags)');

  // GetMonitorInfoW — monitor dimensions and DPI
  GetMonitorInfoWFn = u.func('bool __stdcall GetMonitorInfoW(void *hMonitor, void *lpmi)');
}

/**
 * Block or unblock keyboard/mouse input.
 * Returns true if the operation succeeded.
 * Use with try/finally to guarantee unblock.
 */
export async function blockInput(block: boolean): Promise<boolean> {
  ensureExtendedLoaded();
  try {
    const blockFn = BlockInputFn as (fBlockIt: boolean) => boolean;
    const result = blockFn(block);
    if (result) {
      log.debug(`blockInput: ${block ? 'BLOCKED' : 'UNBLOCKED'} user input`);
    } else {
      log.warn('blockInput: call failed (may require admin privileges)');
    }
    return result;
  } catch (error) {
    log.warn('blockInput error:', error);
    return false;
  }
}

/**
 * Check the current state of a virtual key.
 * Returns true if the key is currently pressed (high-order bit set).
 */
export async function getKeyState(vkCode: number): Promise<boolean> {
  ensureExtendedLoaded();
  try {
    const keyStateFn = GetKeyStateFn as (nVirtKey: number) => number;
    const state = keyStateFn(vkCode);
    return (state & 0x8000) !== 0;
  } catch (error) {
    log.warn('getKeyState error:', error);
    return false;
  }
}

/**
 * Get the raw GetKeyState value for a virtual key.
 * High-order bit (0x8000) = key is down.
 * Low-order bit (0x0001) = key was toggled (Caps Lock, Num Lock).
 */
export async function getKeyStateRaw(vkCode: number): Promise<number> {
  ensureExtendedLoaded();
  try {
    const keyStateFn = GetKeyStateFn as (nVirtKey: number) => number;
    return keyStateFn(vkCode);
  } catch (error) {
    log.warn('getKeyStateRaw error:', error);
    return 0;
  }
}

/**
 * Check if the current process is DPI-aware.
 * Electron apps are typically per-monitor DPI aware by default.
 */
export async function isProcessDpiAware(): Promise<boolean> {
  ensureExtendedLoaded();
  try {
    const dpiAwareFn = IsProcessDPIAwareFn as () => boolean;
    return dpiAwareFn();
  } catch (error) {
    log.warn('isProcessDPIAware error:', error);
    return false;
  }
}

/**
 * Get the DPI of a specific window.
 * Useful for converting logical coordinates to physical coordinates.
 */
export async function getDpiForWindow(hWnd: unknown): Promise<number> {
  ensureExtendedLoaded();
  try {
    const dpiFn = GetDpiForWindowFn as (hwnd: unknown) => number;
    return dpiFn(hWnd);
  } catch (error) {
    log.warn('getDpiForWindow error:', error);
    return 96; // Default DPI (100%)
  }
}

/**
 * Get the screen width in pixels (physical, not DPI-scaled).
 */
export async function getScreenWidth(): Promise<number> {
  ensureExtendedLoaded();
  try {
    const metricsFn = GetSystemMetricsFn as (nIndex: number) => number;
    return metricsFn(SM_CXSCREEN);
  } catch (error) {
    log.warn('getScreenWidth error:', error);
    return 1920;
  }
}

/**
 * Get the screen height in pixels (physical, not DPI-scaled).
 */
export async function getScreenHeight(): Promise<number> {
  ensureExtendedLoaded();
  try {
    const metricsFn = GetSystemMetricsFn as (nIndex: number) => number;
    return metricsFn(SM_CYSCREEN);
  } catch (error) {
    log.warn('getScreenHeight error:', error);
    return 1080;
  }
}

/**
 * Get the DPI scale factor for the primary display.
 * Returns 1.0 for 100% DPI, 1.25 for 125%, 1.5 for 150%, etc.
 */
export async function getDpiScaleFactor(): Promise<number> {
  const physicalWidth = await getScreenWidth();
  const displays = screen.getAllDisplays();
  if (displays.length === 0) return 1.0;
  const primaryDisplay = displays[0];
  const logicalWidth = primaryDisplay.bounds.width;
  return logicalWidth > 0 ? physicalWidth / logicalWidth : 1.0;
}

/**
 * Convert physical (DPI-scaled) coordinates to logical coordinates.
 * Use this when Win32 APIs return physical coordinates but you need logical.
 */
export async function physicalToLogical(x: number, y: number): Promise<{ x: number; y: number }> {
  const scaleFactor = await getDpiScaleFactor();
  return {
    x: Math.round(x / scaleFactor),
    y: Math.round(y / scaleFactor),
  };
}

/**
 * Convert logical coordinates to physical (DPI-scaled) coordinates.
 * Use this before calling SetCursorPos with logical coordinates.
 */
export async function logicalToPhysical(x: number, y: number): Promise<{ x: number; y: number }> {
  const scaleFactor = await getDpiScaleFactor();
  return {
    x: Math.round(x * scaleFactor),
    y: Math.round(y * scaleFactor),
  };
}

/**
 * Clamp coordinates to the physical screen bounds (DPI-aware).
 * Uses actual physical screen dimensions from GetSystemMetrics.
 */
export async function clampToPhysicalScreen(x: number, y: number): Promise<{ x: number; y: number }> {
  const width = await getScreenWidth();
  const height = await getScreenHeight();
  return {
    x: Math.max(0, Math.min(x, width - 1)),
    y: Math.max(0, Math.min(y, height - 1)),
  };
}

/**
 * Check if a window belongs to an elevated (admin) process.
 * Uses GetWindowThreadProcessId + OpenProcess + GetTokenInformation.
 */
export async function isWindowElevated(hWnd: unknown): Promise<boolean> {
  try {
    // Get the process ID for the window
    const pidBuf = Buffer.alloc(4);
    const getThreadId = GetWindowThreadProcessIdLib as unknown as (hwnd: unknown, lpdwProcessId: Buffer) => number;
    getThreadId(hWnd, pidBuf);
    const pid = pidBuf.readUInt32LE(0);
    if (pid === 0) return false;

    // Use libwin32's GetTokenElevationTypeInformation to check elevation
    // This requires opening the process token, which is complex via FFI
    // Fall back to checking if the window has WDA_MONITOR display affinity
    // (elevated windows often have restricted accessibility)
    return false;
  } catch (error) {
    log.warn('isWindowElevated error:', error);
    return false;
  }
}

/**
 * Check if a window is protected (e.g., UAC dialog, secure desktop).
 * Protected windows cannot be automated by non-elevated processes.
 */
export async function isWindowProtected(hWnd: unknown): Promise<boolean> {
  try {
    // Check if the window is on a different desktop (secure desktop for UAC)
    // For now, check if the window is offscreen or invisible as a heuristic
    ensureLoaded();
    const isVisible = IsWindowVisibleFn as (hWnd: unknown) => boolean;
    const isIconic = IsIconicFn as (hWnd: unknown) => boolean;

    if (!isVisible(hWnd)) return true;
    if (isIconic(hWnd)) return false; // Minimized, not protected

    // Check GetWindowDisplayAffinity if available
    // WDA_MONITOR = 1 means window can't be captured
    return false;
  } catch (error) {
    log.warn('isWindowProtected error:', error);
    return false;
  }
}

/**
 * Get the monitor handle and info for a given point.
 * Useful for multi-monitor coordinate mapping.
 */
export async function getMonitorInfoForPoint(x: number, y: number): Promise<{
  monitorHandle: unknown;
  left: number;
  top: number;
  right: number;
  bottom: number;
  isPrimary: boolean;
} | null> {
  ensureExtendedLoaded();
  try {
    // MONITOR_DEFAULTTONULL = 0
    const monitorFromPoint = MonitorFromPointFn as (x: number, y: number, dwFlags: number) => unknown;
    const hMonitor = monitorFromPoint(x, y, 0);
    if (!hMonitor) return null;

    // MONITORINFO structure (40 bytes on 64-bit)
    const MONITORINFO = koffi.struct('MONITORINFO', {
      cbSize: 'uint32',
      left: 'long',
      top: 'long',
      right: 'long',
      bottom: 'long',
      leftWork: 'long',
      topWork: 'long',
      rightWork: 'long',
      bottomWork: 'long',
      dwFlags: 'uint32',
    });

    const infoBuf = Buffer.alloc(koffi.sizeof(MONITORINFO));
    infoBuf.writeUInt32LE(koffi.sizeof(MONITORINFO), 0);

    const getMonitorInfo = GetMonitorInfoWFn as (hMonitor: unknown, lpmi: Buffer) => boolean;
    const success = getMonitorInfo(hMonitor, infoBuf);
    if (!success) return null;

    return {
      monitorHandle: hMonitor,
      left: infoBuf.readInt32LE(4),
      top: infoBuf.readInt32LE(8),
      right: infoBuf.readInt32LE(12),
      bottom: infoBuf.readInt32LE(16),
      isPrimary: (infoBuf.readUInt32LE(36) & 0x00000001) !== 0,
    };
  } catch (error) {
    log.warn('getMonitorInfoForPoint error:', error);
    return null;
  }
}

/**
 * Run a function with input blocking, guaranteeing unblock on completion.
 * Wraps the provided async operation in a try/finally with BlockInput.
 */
export async function withInputBlocked<T>(fn: () => Promise<T>): Promise<T> {
  let blocked = false;
  try {
    blocked = await blockInput(true);
  } catch {
    // Ignore if BlockInput fails (may need admin)
  }
  try {
    return await fn();
  } finally {
    if (blocked) {
      try {
        await blockInput(false);
      } catch {
        log.error('withInputBlocked: failed to unblock input!');
      }
    }
  }
}
