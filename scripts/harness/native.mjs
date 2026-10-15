/**
 * Win32 primitives for the Qyther UI harness — the only layer in `scripts/harness/`
 * that talks to the OS.
 *
 * Why the bindings are re-declared here instead of importing
 * `src/main/services/desktop/input-simulation.ts`: that module does
 * `import { screen } from 'electron'` at its top, so it cannot load under plain
 * `node`. `scripts/desktop-ffi-test.ts` re-declares for the same reason.
 *
 * Also deliberately NOT reused from it, with reasons:
 * - `clampToPhysicalScreen` clamps to `SM_CXSCREEN` — primary monitor only.
 * - `getDpiScaleFactor` reads `screen.getAllDisplays()[0]` — primary monitor only.
 * - `WindowsDesktopAdapter.clampToScreen` compares *physical* coordinates against a
 *   DIP-sized `getPrimaryDisplay().workAreaSize`, which silently clips the right and
 *   bottom of a scaled panel.
 *
 * Process DPI awareness is pinned to per-monitor-aware before any coordinate is
 * read, because `GetWindowRect`/`SetCursorPos` return a different space depending on
 * the awareness of the *querying* process (measured here: 2752x1152 unaware vs
 * 3440x1440 aware on a 3440x1440@125% panel).
 */
import koffi from 'koffi';

const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_WHEEL = 0x0800;
/**
 * Without ABSOLUTE|VIRTUALDESK, `dx`/`dy` are normalised against the PRIMARY monitor
 * and the virtual desktop's origin is ignored, so a window on a second screen is
 * clicked at the wrong place while every DOM read still looks healthy.
 */
const MOUSEEVENTF_ABSOLUTE = 0x8000;
const MOUSEEVENTF_VIRTUALDESK = 0x4000;

const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SM_CXVIRTUALSCREEN = 78;
const SM_CYVIRTUALSCREEN = 79;

const MONITOR_DEFAULTTONEAREST = 2;

/** Mirrors `input-simulation.ts` `VK_KEYS` for the keys the harness drives. */
export const VK = {
  backspace: 0x08, tab: 0x09, enter: 0x0d, return: 0x0d, shift: 0x10, ctrl: 0x11,
  alt: 0x12, escape: 0x1b, esc: 0x1b, space: 0x20, pageup: 0x21, pagedown: 0x22,
  end: 0x23, home: 0x24, left: 0x25, up: 0x26, right: 0x27, down: 0x28,
  insert: 0x2d, delete: 0x2e, win: 0x5b, meta: 0x5b,
};

// koffi resolves type names inside signature strings from a process-global registry,
// so these use plain Win32 names — the harness is the only koffi user in this process
// (it never loads input-simulation.ts, which is the whole point of re-declaring).
const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'long', dy: 'long', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
});
const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
});
const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', { uMsg: 'uint32', wParamL: 'uint16', wParamH: 'uint16' });
const INPUT_UNION = koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT });
const INPUT = koffi.struct('INPUT', { type: 'uint32', u: INPUT_UNION });
const MONITORINFO = koffi.struct('MONITORINFO', {
  cbSize: 'uint32', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32',
});

// Callback prototype: koffi types are process-global, so define once and bind
// EnumWindows array-style, exactly as input-simulation.ts does for callback params.
const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(void *hWnd, intptr_t lParam)');

const user32 = koffi.load('user32.dll');
const shcore = koffi.load('shcore.dll');
const gdi32 = koffi.load('gdi32.dll');
const kernel32 = koffi.load('kernel32.dll');

const api = {
  SendInput: user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)'),
  SetCursorPos: user32.func('bool __stdcall SetCursorPos(int x, int y)'),
  GetCursorPos: user32.func('bool __stdcall GetCursorPos(void *lpPoint)'),
  GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int nIndex)'),
  EnumWindows: user32.func('__stdcall', 'EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'intptr_t']),
  IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hWnd)'),
  GetWindowTextW: user32.func('int __stdcall GetWindowTextW(void *hWnd, void *lpString, int nMaxCount)'),
  GetClassNameW: user32.func('int __stdcall GetClassNameW(void *hWnd, void *lpClassName, int nMaxCount)'),
  GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hWnd, void *lpRect)'),
  GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, void *lpdwProcessId)'),
  GetForegroundWindow: user32.func('void *__stdcall GetForegroundWindow()'),
  GetAsyncKeyState: user32.func('short __stdcall GetAsyncKeyState(int nVirtKey)'),
  MonitorFromWindow: user32.func('void *__stdcall MonitorFromWindow(void *hWnd, uint dwFlags)'),
  GetMonitorInfoW: user32.func('bool __stdcall GetMonitorInfoW(void *hMonitor, void *lpmi)'),
  GetDpiForWindow: user32.func('uint __stdcall GetDpiForWindow(void *hWnd)'),
  SetProcessDpiAwareness: shcore.func('long __stdcall SetProcessDpiAwareness(int value)'),
  IsProcessDPIAware: user32.func('bool __stdcall IsProcessDPIAware()'),
  GetDC: user32.func('void *__stdcall GetDC(void *hWnd)'),
  ReleaseDC: user32.func('int __stdcall ReleaseDC(void *hWnd, void *hDC)'),
  CreateCompatibleDC: gdi32.func('void *__stdcall CreateCompatibleDC(void *hDC)'),
  CreateCompatibleBitmap: gdi32.func('void *__stdcall CreateCompatibleBitmap(void *hDC, int nWidth, int nHeight)'),
  SelectObject: gdi32.func('void *__stdcall SelectObject(void *hDC, void *h)'),
  BitBlt: gdi32.func('bool __stdcall BitBlt(void *hDC, int x, int y, int nWidth, int nHeight, void *hSrcDC, int xSrc, int ySrc, uint32 dwRop)'),
  GetDIBits: gdi32.func('int __stdcall GetDIBits(void *hdc, void *hbm, uint32 uStartScan, uint32 cScanLines, void *lpvBits, void *lpbi, uint32 uUsage)'),
  DeleteObject: gdi32.func('bool __stdcall DeleteObject(void *ho)'),
  DeleteDC: gdi32.func('bool __stdcall DeleteDC(void *hDC)'),
  GetLastError: kernel32.func('uint32 __stdcall GetLastError()'),
};

/**
 * What a zero return from `SendInput` actually means. The documented causes are a UIPI
 * block (the target runs elevated, so Windows refuses injected input) and a queue that
 * will not take the event. Windows is not reliably loud about which one it was, so this
 * does not claim to diagnose every silent drop — it stops the harness from reporting a
 * bare "inserted 0 of 1" and blaming the app for input Windows refused to deliver.
 */
const UIPI_ERROR = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INPUT_SIZE = koffi.sizeof(INPUT);

/**
 * Named keys from `VK`, then bare letters and digits, like the shipped helper. */
function vkFor(name) {
  const key = String(name).toLowerCase();
  if (VK[key]) return VK[key];
  if (key.length === 1 && key >= 'a' && key <= 'z') return 0x41 + key.charCodeAt(0) - 97;
  if (key.length === 1 && key >= '0' && key <= '9') return 0x30 + key.charCodeAt(0) - 48;
  return 0;
}

/**
 * Keys a hardware keyboard reports with the extended byte set, per the documented
 * `SendInput` rule for the arrows and the navigation block. Sent as a virtual key with
 * `wScan = 0`, Windows synthesises a scancode from the VK, and without this flag an
 * arrow arrives as the *non*-extended key that shares its scancode — the harness would
 * then be driving something a real keyboard cannot produce, which is the one thing this
 * whole layer exists to avoid.
 */
const EXTENDED_VKS = new Set([
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x5c, 0xa3, 0xa5, 0x6f,
]);

/**
 * Pin this process to per-monitor-DPI-aware (`PROCESS_PER_MONITOR_DPI_AWARE = 2`).
 * Must run before any coordinate read. E_ACCESSDENIED means awareness was already
 * fixed for this process, which is fine as long as it is genuinely aware afterwards.
 */
export function makePerMonitorAware() {
  const hr = api.SetProcessDpiAwareness(2);
  const aware = api.IsProcessDPIAware();
  return { hr, aware, ok: aware === true };
}

function sendInput(event) {
  const n = api.SendInput(1, [event], INPUT_SIZE);
  if (n === 1) return;
  const code = api.GetLastError();
  const why = code === UIPI_ERROR
    ? 'the foreground window runs elevated (UIPI) and Windows refuses injected input into it'
    : `Win32 error ${code}`;
  throw new Error(`SendInput inserted ${n} of 1 events — ${why}`);
}

/**
 * A key-down/key-up pair, with the extended byte set applied where the hardware sets
 * it. The gap between the two halves is deliberate: `SendInput` inserts events serially
 * but with no time between them, and a zero-duration press is not something a hand
 * produces — an app that coalesces a down/up pair sees nothing at all.
 */
async function keyPress(vk, { holdMs = 20 } = {}) {
  const flags = EXTENDED_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0;
  keyEvent(vk, 0, flags);
  await sleep(holdMs);
  keyEvent(vk, 0, flags | KEYEVENTF_KEYUP);
}

function mouseEvent(flags, dx = 0, dy = 0, mouseData = 0) {
  sendInput({ type: INPUT_MOUSE, u: { mi: { dx, dy, mouseData, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
}

function keyEvent(vk, scan, flags) {
  sendInput({ type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
}

export function setCursorPosition(x, y) {
  if (!api.SetCursorPos(Math.round(x), Math.round(y))) {
    throw new Error(`SetCursorPos(${x}, ${y}) failed — off-screen or clamped?`);
  }
}

/**
 * Move the cursor by inserting a real mouse-move event, not by calling `SetCursorPos`.
 *
 * `SetCursorPos` repositions the arrow but inserts nothing into the input stream, so no
 * `WM_MOUSEMOVE` reaches the app: hover tracking, CSS `:hover`, and the intermediate
 * positions of a drag are all skipped, and the harness would be claiming to have moved
 * a cursor the way a hand does when it did not. `MOUSEEVENTF_ABSOLUTE` takes `dx`/`dy`
 * normalised to 0-65535; with `MOUSEEVENTF_VIRTUALDESK` that normalisation is against
 * the whole virtual desktop, measured from its origin — which is negative when a monitor
 * sits left of or above the primary one, and is why the origin is subtracted here.
 */
export function moveTo(x, y) {
  const { left, top, width, height } = virtualScreen();
  if (!(width > 0 && height > 0)) throw new Error(`Virtual desktop reports ${width}x${height}`);
  const clamp = (n) => Math.max(0, Math.min(65535, Math.round(n)));
  const dx = clamp(((x - left) * 65535) / width);
  const dy = clamp(((y - top) * 65535) / height);
  mouseEvent(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, dx, dy);
}

export function getCursorPosition() {
  const buf = Buffer.alloc(koffi.sizeof(POINT));
  if (!api.GetCursorPos(buf)) throw new Error('GetCursorPos failed');
  const p = koffi.decode(buf, POINT);
  return { x: p.x, y: p.y };
}

export function virtualScreen() {
  return {
    left: api.GetSystemMetrics(SM_XVIRTUALSCREEN),
    top: api.GetSystemMetrics(SM_YVIRTUALSCREEN),
    width: api.GetSystemMetrics(SM_CXVIRTUALSCREEN),
    height: api.GetSystemMetrics(SM_CYVIRTUALSCREEN),
  };
}

/** Move the real cursor with a real move event, then click wherever it landed. */
export async function clickAt(x, y, { button = 'left', settleMs = 20 } = {}) {
  moveTo(x, y);
  await sleep(settleMs);
  const [down, up] = button === 'right'
    ? [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP]
    : [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP];
  mouseEvent(down);
  await sleep(settleMs);
  mouseEvent(up);
}

export async function scrollAt(x, y, amount = -3, { settleMs = 20 } = {}) {
  moveTo(x, y);
  await sleep(settleMs);
  mouseEvent(MOUSEEVENTF_WHEEL, 0, 0, amount * 120);
}

/**
 * A drag is only a drag if the app sees the pointer travel. Each hop is a real move
 * event, so the intermediate positions reach the renderer the way a hand's would —
 * `SetCursorPos` hops would teleport the arrow and a drop-target would never see it.
 */
export async function drag(from, to, { settleMs = 40, hops = 8 } = {}) {
  moveTo(from.x, from.y);
  await sleep(settleMs);
  mouseEvent(MOUSEEVENTF_LEFTDOWN);
  await sleep(settleMs);
  for (let i = 1; i <= hops; i++) {
    moveTo(from.x + ((to.x - from.x) * i) / hops, from.y + ((to.y - from.y) * i) / hops);
    await sleep(10);
  }
  mouseEvent(MOUSEEVENTF_LEFTUP);
}

/**
 * Alt+Space and Alt+Shift+M must bracket the modifier around the key: the app's
 * `WH_KEYBOARD_LL` hook gates on `GetAsyncKeyState(VK_MENU) & 0x8000`, which only
 * reflects a held Alt. Space alone toggles nothing and is swallowed by the hook.
 */
const ext = (vk) => (EXTENDED_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0);

export async function pressCombo({ modifiers = [], key }, { holdMs = 30 } = {}) {
  const vkKey = vkFor(key);
  if (!vkKey) throw new Error(`Unknown key "${key}" — known: ${Object.keys(VK).join(', ')}, a-z, 0-9`);
  const vks = modifiers.map((m) => {
    const vk = vkFor(m);
    if (!vk) throw new Error(`Unknown modifier "${m}"`);
    return vk;
  });
  for (const vk of vks) keyEvent(vk, 0, ext(vk));
  await sleep(holdMs);
  keyEvent(vkKey, 0, ext(vkKey));
  await sleep(holdMs);
  keyEvent(vkKey, 0, ext(vkKey) | KEYEVENTF_KEYUP);
  await sleep(holdMs);
  for (const vk of [...vks].reverse()) keyEvent(vk, 0, ext(vk) | KEYEVENTF_KEYUP);
}

export async function pressKey(name) {
  const vk = vkFor(name);
  if (!vk) throw new Error(`Unknown key "${name}" — known: ${Object.keys(VK).join(', ')}, a-z, 0-9`);
  await keyPress(vk);
}

/** Per UTF-16 code unit, the shipped `typeText` pattern. Produces real WM_CHAR. */
export async function typeText(text, { charDelayMs = 12 } = {}) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    keyEvent(0, code, KEYEVENTF_UNICODE);
    await sleep(charDelayMs);
    keyEvent(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
    await sleep(charDelayMs);
  }
}

export function isKeyDown(name) {
  const vk = vkFor(name);
  if (!vk) throw new Error(`Unknown key "${name}"`);
  return (api.GetAsyncKeyState(vk) & 0x8000) !== 0;
}

function readWideString(read, hWnd, capacity = 256) {
  const buf = Buffer.alloc(capacity * 2);
  const len = read(hWnd, buf, capacity);
  return len > 0 ? buf.toString('ucs2', 0, len * 2) : '';
}

export function getWindowRect(hwnd) {
  const buf = Buffer.alloc(koffi.sizeof(RECT));
  if (!api.GetWindowRect(hwnd, buf)) throw new Error('GetWindowRect failed');
  const r = koffi.decode(buf, RECT);
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.right - r.left, height: r.bottom - r.top };
}

function pidOf(hwnd) {
  const buf = Buffer.alloc(4);
  api.GetWindowThreadProcessId(hwnd, buf);
  return buf.readUInt32LE(0);
}

/**
 * Every top-level window, including the two facts the repo's own `listWindows()`
 * cannot give you: the Win32 class name, and empty-title/hidden windows — it drops
 * both, which is why the palette vanishes from its list until the renderer sets
 * `<title>Qyther</title>`.
 */
export function listWindows() {
  const out = [];
  const cb = koffi.register((hWnd) => {
    try {
      const rectBuf = Buffer.alloc(koffi.sizeof(RECT));
      const hasRect = api.GetWindowRect(hWnd, rectBuf);
      const r = hasRect ? koffi.decode(rectBuf, RECT) : null;
      out.push({
        title: readWideString(api.GetWindowTextW, hWnd),
        className: readWideString(api.GetClassNameW, hWnd, 128),
        visible: api.IsWindowVisible(hWnd),
        pid: pidOf(hWnd),
        rect: r ? { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top } : null,
        dpi: api.GetDpiForWindow(hWnd),
        hwnd: hWnd,
      });
    } catch { /* a window we cannot read is not worth failing the sweep for */ }
    return true;
  }, koffi.pointer(EnumWindowsProc));

  try {
    api.EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return out;
}

/** Physical bounds + work area of the monitor a window actually lives on. */
export function getMonitorForWindow(hwnd) {
  const hMonitor = api.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  if (!hMonitor) return null;
  const buf = Buffer.alloc(koffi.sizeof(MONITORINFO));
  buf.writeUInt32LE(koffi.sizeof(MONITORINFO), 0);
  if (!api.GetMonitorInfoW(hMonitor, buf)) return null;
  const mi = koffi.decode(buf, MONITORINFO);
  const toRect = (rc) => ({ left: rc.left, top: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top });
  return { monitor: toRect(mi.rcMonitor), workArea: toRect(mi.rcWork), primary: (mi.dwFlags & 1) === 1 };
}

export function getForegroundWindow() {
  const hwnd = api.GetForegroundWindow();
  if (!hwnd) return null;
  return { hwnd, title: readWideString(api.GetWindowTextW, hwnd, 128), pid: pidOf(hwnd) };
}

const SRCCOPY = 0x00cc0020;
const DIB_RGB_COLORS = 0;

const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
  biSize: 'uint32', biWidth: 'long', biHeight: 'long', biPlanes: 'uint16', biBitCount: 'uint16',
  biCompression: 'uint32', biSizeImage: 'uint32', biXPelsPerMeter: 'long', biYPelsPerMeter: 'long',
  biClrUsed: 'uint32', biClrImportant: 'uint32',
});

/**
 * Grab a region of the real composited desktop — true z-order, true occlusion, the
 * pixels a person actually sees, which CDP's page-only capture cannot show.
 *
 * Done with GDI inside this process rather than via PowerShell `CopyFromScreen`
 * because this process is per-monitor-DPI-aware: an unaware PowerShell is virtualized
 * by Windows and returns the whole desktop resampled to 2752x1152 on this 125% panel.
 * `BitBlt` from the screen DC needs a manifest on some builds; if it ever yields a
 * blank frame the caller should say so rather than trust it.
 */
export function captureScreenRect(rect) {
  const { left, top, width, height } = rect;
  if (!(width > 0 && height > 0)) throw new Error(`Refusing to capture a ${width}x${height} region`);
  // The rect comes from `GetWindowRect`, but an absurd one still meant a multi-gigabyte
  // `Buffer.alloc` that takes the whole harness down rather than reporting a bad rect.
  const MAX_PIXELS = 3840 * 2160;
  if (width * height > MAX_PIXELS) {
    throw new Error(`Refusing to capture ${width}x${height} (${(width * height / 1e6).toFixed(1)} MP > ${(MAX_PIXELS / 1e6).toFixed(1)} MP)`);
  }

  const screenDc = api.GetDC(null);
  if (!screenDc) throw new Error('GetDC(NULL) failed');
  const memDc = api.CreateCompatibleDC(screenDc);
  const bitmap = memDc ? api.CreateCompatibleBitmap(screenDc, width, height) : null;
  // Checked before use, because an unchecked null made the `finally` block call
  // `SelectObject(memDc, undefined)` and mask the real GDI failure behind a confusing throw.
  if (!memDc || !bitmap) {
    if (bitmap) api.DeleteObject(bitmap);
    if (memDc) api.DeleteDC(memDc);
    api.ReleaseDC(null, screenDc);
    throw new Error(`CreateCompatibleDC/Bitmap failed for ${width}x${height} (out of GDI handles?)`);
  }
  const old = api.SelectObject(memDc, bitmap);
  if (!old) {
    api.DeleteObject(bitmap);
    api.DeleteDC(memDc);
    api.ReleaseDC(null, screenDc);
    throw new Error('SelectObject into the memory DC failed');
  }
  try {
    const blit = api.BitBlt(memDc, 0, 0, width, height, screenDc, left, top, SRCCOPY);
    if (!blit) throw new Error('BitBlt from the screen DC failed (driver or secure-desktop restriction?)');

    const info = Buffer.alloc(koffi.sizeof(BITMAPINFOHEADER));
    info.writeUInt32LE(koffi.sizeof(BITMAPINFOHEADER), 0);
    info.writeInt32LE(width, 4);
    info.writeInt32LE(-height, 8); // negative = top-down rows, so no vertical flip later
    info.writeUInt16LE(1, 12);
    info.writeUInt16LE(32, 14);
    info.writeUInt32LE(0, 16); // BI_RGB

    const pixels = Buffer.alloc(width * height * 4);
    const lines = api.GetDIBits(memDc, bitmap, 0, height, pixels, info, DIB_RGB_COLORS);
    // A short copy leaves the tail of the buffer uninitialised, which encodes as a
    // partially transparent PNG rather than as an error. Refuse instead of shipping it.
    if (lines < height) throw new Error(`GetDIBits copied ${lines} of ${height} scan lines`);

    // GDI hands back BGRA; pngjs wants RGBA.
    for (let i = 0; i < pixels.length; i += 4) {
      const b = pixels[i];
      pixels[i] = pixels[i + 2];
      pixels[i + 2] = b;
    }
    return { width, height, rgba: pixels };
  } finally {
    api.SelectObject(memDc, old);
    api.DeleteObject(bitmap);
    api.DeleteDC(memDc);
    api.ReleaseDC(null, screenDc);
  }
}
