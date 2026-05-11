import koffi from 'koffi';
import { screen } from 'electron';
import { createLogger } from '../../utils/logger';

const log = createLogger('InputSimulator');

// Win32 input constants
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_WHEEL = 0x0800;

// ShellExecuteW constants

const KEYEVENTF_KEYDOWN = 0x0000;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

// Win32 window constants
const SW_SHOWNORMAL = 1;

// Win32 focus constants
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_SHOWWINDOW = 0x0040;
const HWND_TOP = 0;

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

// Windows INPUT union structure
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

// Lazy-loaded API handles - use unknown to avoid koffi type issues
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

// EnumWindows callback type storage
let enumWindowsCallback: unknown = null;

// Shared RECT struct — defined once at module scope to avoid koffi duplicate type errors
const RECT = koffi.struct('WinRect', {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long',
});

function ensureLoaded(): void {
  if (user32Dll) return;

  user32Dll = koffi.load('user32.dll');
  const u = user32Dll as Record<string, (sig: string) => unknown>;

  SendInputFn = u.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)');
  SetCursorPosFn = u.func('bool __stdcall SetCursorPos(int x, int y)');
  GetCursorPosFn = u.func('bool __stdcall GetCursorPos(void *lpPoint)');
  GetForegroundWindowFn = u.func('void * __stdcall GetForegroundWindow()');
  GetWindowTextWFn = u.func('int __stdcall GetWindowTextW(void * hWnd, void * lpString, int nMaxCount)');
  GetWindowRectFn = u.func('bool __stdcall GetWindowRect(void *hWnd, void *lpRect)');

  shell32Dll = koffi.load('shell32.dll');
  const s = shell32Dll as Record<string, (sig: string) => unknown>;
  ShellExecuteWFn = s.func('void * __stdcall ShellExecuteW(void *hwnd, void *lpOperation, void *lpFile, void *lpParameters, void *lpDirectory, int nShowCmd)');

  EnumWindowsFn = u.func('bool __stdcall EnumWindows(void *lpEnumFunc, void *lParam)');
  SetForegroundWindowFn = u.func('bool __stdcall SetForegroundWindow(void *hWnd)');
  SetWindowPosFn = u.func('bool __stdcall SetWindowPos(void *hWnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
}

// --- Helpers ---

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

function buildMouseEvent(x: number, y: number, flags: number, mouseData = 0): Buffer {
  const buf = Buffer.alloc(koffi.sizeof(INPUT));
  const input = koffi.decode(buf, INPUT);
  input.type = INPUT_MOUSE;
  input._u.mi.dx = x;
  input._u.mi.dy = y;
  input._u.mi.mouseData = mouseData;
  input._u.mi.dwFlags = flags;
  input._u.mi.time = 0;
  input._u.mi.dwExtraInfo = 0;
  koffi.encode(buf, input, INPUT);
  return buf;
}

function sendMouseEvent(x: number, y: number, flags: number, mouseData = 0): void {
  ensureLoaded();
  const buf = buildMouseEvent(x, y, flags, mouseData);
  const sendInput = SendInputFn as (cInputs: number, pInputs: Buffer, cbSize: number) => number;
  const result = sendInput(1, buf, koffi.sizeof(INPUT));
  if (result === 0) {
    throw new Error('SendInput failed to insert mouse event');
  }
}

function sendKeyboardEvent(vkCode: number, flags: number): void {
  ensureLoaded();
  const buf = Buffer.alloc(koffi.sizeof(INPUT));
  const input = koffi.decode(buf, INPUT);
  input.type = INPUT_KEYBOARD;
  input._u.ki.wVk = vkCode;
  input._u.ki.wScan = 0;
  input._u.ki.dwFlags = flags;
  input._u.ki.time = 0;
  input._u.ki.dwExtraInfo = 0;
  koffi.encode(buf, input, INPUT);
  const sendInput = SendInputFn as (cInputs: number, pInputs: Buffer, cbSize: number) => number;
  const result = sendInput(1, buf, koffi.sizeof(INPUT));
  if (result === 0) {
    throw new Error('SendInput failed to insert keyboard event');
  }
}

// --- Public API ---

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
  const POINT = koffi.struct('CURSOR_POINT', { x: 'long', y: 'long' });
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
  // Windows WHEEL_DELTA is 120; positive delta scrolls up, negative scrolls down
  sendMouseEvent(0, 0, MOUSEEVENTF_WHEEL, delta * 120);
  log.debug(`Scroll at (${x}, ${y}) delta=${delta}`);
}

function sendUnicodeChar(charCode: number): void {
  ensureLoaded();
  const sendInput = SendInputFn as (cInputs: number, pInputs: Buffer, cbSize: number) => number;

  // Key down with unicode
  const downBuf = Buffer.alloc(koffi.sizeof(INPUT));
  const downInput = koffi.decode(downBuf, INPUT);
  downInput.type = INPUT_KEYBOARD;
  downInput._u.ki.wVk = 0;
  downInput._u.ki.wScan = charCode;
  downInput._u.ki.dwFlags = KEYEVENTF_UNICODE;
  downInput._u.ki.time = 0;
  downInput._u.ki.dwExtraInfo = 0;
  koffi.encode(downBuf, downInput, INPUT);
  sendInput(1, downBuf, koffi.sizeof(INPUT));

  // Key up
  const upBuf = Buffer.alloc(koffi.sizeof(INPUT));
  const upInput = koffi.decode(upBuf, INPUT);
  upInput.type = INPUT_KEYBOARD;
  upInput._u.ki.wVk = 0;
  upInput._u.ki.wScan = charCode;
  upInput._u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
  upInput._u.ki.time = 0;
  upInput._u.ki.dwExtraInfo = 0;
  koffi.encode(upBuf, upInput, INPUT);
  sendInput(1, upBuf, koffi.sizeof(INPUT));
}

export async function typeText(text: string): Promise<void> {
  ensureLoaded();
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Handle surrogate pairs for characters outside BMP
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

export async function getForegroundWindowInfo(): Promise<{ title: string; handle: string }> {
  ensureLoaded();
  const getFgWin = GetForegroundWindowFn as () => unknown;
  const hwnd = getFgWin();
  if (!hwnd) {
    return { title: '', handle: '0' };
  }

  const buf = Buffer.alloc(512);
  const getText = GetWindowTextWFn as (hWnd: unknown, lpString: Buffer, nMaxCount: number) => number;
  const len = getText(hwnd, buf, 256);
  const title = buf.toString('ucs2', 0, len * 2);

  return { title, handle: String(hwnd) };
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

/**
 * Atomically retrieves foreground window title AND rect from the same HWND handle.
 * Eliminates the TOCTOU race where getForegroundWindowInfo() and
 * getForegroundWindowRect() could return data from different windows.
 */
export async function getForegroundWindowInfoAndRect(): Promise<{
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  handle: string;
}> {
  ensureLoaded();
  const getFgWin = GetForegroundWindowFn as () => unknown;
  const getText = GetWindowTextWFn as (hWnd: unknown, lpString: Buffer, nMaxCount: number) => number;
  const getRect = GetWindowRectFn as (hWnd: unknown, lpRect: Buffer) => boolean;

  const hwnd = getFgWin();
  if (!hwnd) {
    return { title: '', x: 0, y: 0, width: 0, height: 0, handle: '0' };
  }

  // koffi returns an opaque pointer; read it as a 64-bit address string
  const handleStr = hwnd instanceof Buffer
    ? '0x' + hwnd.readBigUInt64LE(0).toString(16)
    : 'unknown';

  // Retrieve title using the same HWND
  const titleBuf = Buffer.alloc(512);
  const titleLen = getText(hwnd, titleBuf, 256);
  const title = titleLen > 0 ? titleBuf.toString('ucs2', 0, titleLen * 2) : '';

  // Retrieve rect using the same HWND (no race with title retrieval)
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
      handle: handleStr,
    };
  }

  return { title, x: 0, y: 0, width: 0, height: 0, handle: handleStr };
}

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
  const resultCode = Number(result);

  const success = resultCode > 32;
  log.debug(`Launch app "${name}": ${success ? 'success' : `failed (code ${resultCode})`}`);
  return success;
}

export async function rightClick(x: number, y: number): Promise<void> {
  await setCursorPosition(x, y);
  await sleep(20);

  sendMouseEvent(0, 0, MOUSEEVENTF_RIGHTDOWN);
  await sleep(20);
  sendMouseEvent(0, 0, MOUSEEVENTF_RIGHTUP);
  log.debug(`Right-click at (${x}, ${y})`);
}

export interface WindowInfo {
  title: string;
  handle: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function listWindows(): Promise<WindowInfo[]> {
  ensureLoaded();

  const windows: WindowInfo[] = [];

  const getFgWin = GetForegroundWindowFn as () => unknown;
  const getText = GetWindowTextWFn as (hWnd: unknown, lpString: Buffer, nMaxCount: number) => number;
  const getRect = GetWindowRectFn as (hWnd: unknown, lpRect: Buffer) => boolean;

  const IsWindowVisible = (user32Dll as Record<string, (sig: string) => unknown>).func('bool __stdcall IsWindowVisible(void *hWnd)');

  const callbackType = koffi.proto('bool __stdcall EnumWindowsProc(void *hWnd, void *lParam)');
  const cb = koffi.register((hWnd: unknown, _lParam: unknown): boolean => {
    try {
      const visible = (IsWindowVisible as (hWnd: unknown) => boolean)(hWnd);
      if (!visible) return true;

      const titleBuf = Buffer.alloc(512);
      const len = getText(hWnd, titleBuf, 256);
      const title = len > 0 ? titleBuf.toString('ucs2', 0, len * 2) : '';

      if (!title) return true;

      const rectBuf = Buffer.alloc(koffi.sizeof(RECT));
      const hasRect = getRect(hWnd, rectBuf);

      let windowInfo: WindowInfo = {
        title,
        handle: String(hWnd),
        x: 0,
        y: 0,
        width: 0,
        height: 0,
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
  }, callbackType);

  enumWindowsCallback = cb;

  const enumWindows = EnumWindowsFn as (lpEnumFunc: unknown, lParam: unknown) => boolean;
  enumWindows(cb, null);

  log.debug(`Listed ${windows.length} visible windows`);
  return windows;
}

export async function focusWindow(handle: string): Promise<boolean> {
  ensureLoaded();

  const setFg = SetForegroundWindowFn as (hWnd: unknown) => boolean;
  const setPos = SetWindowPosFn as (hWnd: unknown, hWndInsertAfter: unknown, x: number, y: number, cx: number, cy: number, flags: number) => boolean;

  // Try SetForegroundWindow first
  const fgResult = setFg(handle);
  if (fgResult) {
    log.debug(`Focused window ${handle} via SetForegroundWindow`);
    return true;
  }

  // Fallback: bring to top with SetWindowPos
  const posResult = setPos(handle, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
  if (posResult) {
    log.debug(`Focused window ${handle} via SetWindowPos`);
    return true;
  }

  log.warn(`Failed to focus window ${handle}`);
  return false;
}

export async function hover(x: number, y: number): Promise<void> {
  await setCursorPosition(x, y);
  await sleep(30);
  log.debug(`Hover at (${x}, ${y})`);
}

export function cleanup(): void {
  if (enumWindowsCallback) {
    koffi.unregister(enumWindowsCallback as import('koffi').IKoffiRegisteredCallback);
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
  enumWindowsCallback = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
