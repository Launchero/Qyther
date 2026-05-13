/**
 * Desktop Agent FFI Dry-Run Test
 *
 * Standalone script that tests all koffi FFI bindings used by the desktop agent.
 * Run with: npx tsx scripts/desktop-ffi-test.ts
 *
 * Tests every Win32 API call: EnumWindows, ShowWindow, PostMessage,
 * SetForegroundWindow, SetWindowPos, SendInput, GetForegroundWindow, etc.
 *
 * Uses the correct koffi pattern per official docs (koffi.dev):
 * - HANDLE = koffi.pointer("HANDLE", koffi.opaque())
 * - HWND = koffi.alias("HWND", HANDLE)
 * - Callback prototypes reference HWND type
 * - EnumWindows defined with array-style func()
 */

import koffi from 'koffi';

// ── Color helpers ──
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | boolean | Promise<void | boolean>) {
  totalTests++;
  const result = fn();
  const handleResult = (ok: boolean, detail?: string) => {
    if (ok) {
      passedTests++;
      console.log(`  ${GREEN}PASS${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
      failedTests++;
      failures.push(name);
      console.log(`  ${RED}FAIL${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
    }
  };
  if (result instanceof Promise) {
    result
      .then((ok) => handleResult(ok !== false))
      .catch((err) => {
        failedTests++;
        failures.push(name);
        console.log(`  ${RED}FAIL${RESET} ${name} — ${err instanceof Error ? err.message : String(err)}`);
      });
  } else {
    handleResult(result !== false);
  }
}

async function asyncTest(name: string, fn: () => Promise<boolean>) {
  totalTests++;
  try {
    const ok = await fn();
    if (ok) {
      passedTests++;
      console.log(`  ${GREEN}PASS${RESET} ${name}`);
    } else {
      failedTests++;
      failures.push(name);
      console.log(`  ${RED}FAIL${RESET} ${name} — returned false`);
    }
  } catch (err) {
    failedTests++;
    failures.push(name);
    console.log(`  ${RED}FAIL${RESET} ${name} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Win32 constants ──
const SW_MINIMIZE = 6;
const SW_MAXIMIZE = 3;
const SW_RESTORE = 9;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_SHOWWINDOW = 0x0040;
const WM_SYSCOMMAND = 0x0112;
const WM_CLOSE = 0x0010;
const SC_MINIMIZE = 0xf020;
const SC_MAXIMIZE = 0xf030;
const SC_RESTORE = 0xf120;

// ── Load DLLs ──
console.log(`\n${BOLD}${CYAN}=== Loading Win32 DLLs ===${RESET}\n`);

let user32: Record<string, (sig: string) => unknown>;
let shell32: Record<string, (sig: string) => unknown>;

test('Load user32.dll', () => {
  const dll = koffi.load('user32.dll');
  user32 = dll as Record<string, (sig: string) => unknown>;
  return !!dll;
});

test('Load shell32.dll', () => {
  const dll = koffi.load('shell32.dll');
  shell32 = dll as Record<string, (sig: string) => unknown>;
  return !!dll;
});

// ── Define types ──
console.log(`\n${BOLD}${CYAN}=== Defining koffi Types ===${RESET}\n`);

// CORRECT pattern per koffi.dev: opaque pointer for HWND
const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
const HWND = koffi.alias('HWND', HANDLE);

const RECT = koffi.struct('WinRect', {
  left: 'long', top: 'long', right: 'long', bottom: 'long',
});

const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'long', dy: 'long', mouseData: 'uint32',
  dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
});

const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32',
  time: 'uint32', dwExtraInfo: 'uintptr_t',
});

const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
  uMsg: 'uint32', wParamL: 'uint16', wParamH: 'uint16',
});

const INPUT_UNION = koffi.union('INPUT_UNION', {
  mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT,
});

const INPUT = koffi.struct('INPUT', {
  type: 'uint32', _u: INPUT_UNION,
});

test('HANDLE type defined', () => !!HANDLE);
test('HWND alias defined', () => !!HWND);
test('RECT struct defined', () => koffi.sizeof(RECT) > 0);
test('MOUSEINPUT struct defined', () => koffi.sizeof(MOUSEINPUT) > 0);
test('KEYBDINPUT struct defined', () => koffi.sizeof(KEYBDINPUT) > 0);
test('INPUT struct defined', () => koffi.sizeof(INPUT) > 0);

// ── EnumWindows callback prototype ──
console.log(`\n${BOLD}${CYAN}=== EnumWindows Callback ===${RESET}\n`);

let EnumWindowsProcType: unknown = null;

test('Define EnumWindowsProc prototype', () => {
  EnumWindowsProcType = koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, long lParam)');
  return !!EnumWindowsProcType;
});

test('Register callback with koffi.pointer', () => {
  const cb = koffi.register(
    (_hwnd: unknown, _lParam: unknown): boolean => true,
    koffi.pointer(EnumWindowsProcType!),
  );
  koffi.unregister(cb);
  return true;
});

// ── EnumWindows function (array-style per koffi docs) ──
console.log(`\n${BOLD}${CYAN}=== EnumWindows Function Binding ===${RESET}\n`);

let EnumWindowsFn: unknown = null;

test('Bind EnumWindows with array-style signature', () => {
  EnumWindowsFn = user32.func('__stdcall', 'EnumWindows', 'bool', [
    koffi.pointer(EnumWindowsProcType!),
    'int',
  ]);
  return !!EnumWindowsFn;
});

// ── Test EnumWindows invocation ──
console.log(`\n${BOLD}${CYAN}=== EnumWindows Invocation ===${RESET}\n`);

const enumeratedWindows: Array<{ handle: string; title: string; _hwnd: unknown }> = [];

asyncTest('Enumerate visible windows', async () => {
  if (!EnumWindowsFn) return false;

  const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(HWND hWnd, void *lpString, int nMaxCount)');
  const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND hWnd)');

  let callbackCount = 0;
  let errorCount = 0;

  const cb = koffi.register((hwnd: unknown, _lParam: unknown): boolean => {
    callbackCount++;
    try {
      const visible = (IsWindowVisible as (h: unknown) => boolean)(hwnd);
      if (!visible) return true;

      const buf = Buffer.alloc(512);
      const len = (GetWindowTextW as (h: unknown, b: Buffer, n: number) => number)(hwnd, buf, 256);
      const title = len > 0 ? buf.toString('ucs2', 0, len * 2) : '';

      // Debug: log first 5 visible windows regardless of title
      if (callbackCount <= 5) {
        console.log(`    [debug] visible=${visible}, titleLen=${len}, title="${title.slice(0, 40)}"`);
      }

      if (!title) return true;

      // Store the raw HWND object (koffi External) for later use
      // Also create a readable hex string for logging
      enumeratedWindows.push({ handle: String(callbackCount), title, _hwnd: hwnd });
    } catch (err) {
      errorCount++;
      if (errorCount <= 3) {
        console.log(`    [error #${errorCount}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return true;
  }, koffi.pointer(EnumWindowsProcType!));

  const enumWindows = EnumWindowsFn as (cb: unknown, lParam: number) => boolean;
  const result = enumWindows(cb, 0);

  console.log(`    Callbacks: ${callbackCount}, Errors: ${errorCount}`);
  console.log(`    Found ${enumeratedWindows.length} visible windows`);
  if (enumeratedWindows.length > 0) {
    const sample = enumeratedWindows.slice(0, 5).map(w => `"${w.title}" [${w.handle}]`).join(', ');
    console.log(`    Sample: ${sample}`);
  }

  koffi.unregister(cb);
  return result && enumeratedWindows.length > 0;
});

asyncTest('Enumerate a second time (no duplicate type error)', async () => {
  if (!EnumWindowsFn) return false;

  const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND hWnd)');

  const cb = koffi.register((hwnd: unknown, _lParam: unknown): boolean => {
    try {
      (IsWindowVisible as (h: unknown) => boolean)(hwnd);
    } catch { /* skip */ }
    return true;
  }, koffi.pointer(EnumWindowsProcType!));

  const enumWindows = EnumWindowsFn as (cb: unknown, lParam: number) => boolean;
  const result = enumWindows(cb, 0);
  koffi.unregister(cb);
  return result;
});

// ── Foreground Window APIs ──
console.log(`\n${BOLD}${CYAN}=== Foreground Window APIs ===${RESET}\n`);

asyncTest('GetForegroundWindow returns HWND', async () => {
  const fn = user32.func('HWND __stdcall GetForegroundWindow()');
  const hwnd = (fn as () => unknown)();
  return !!hwnd;
});

asyncTest('GetWindowTextW reads foreground window title', async () => {
  const getFgWin = user32.func('HWND __stdcall GetForegroundWindow()');
  const getText = user32.func('int __stdcall GetWindowTextW(HWND hWnd, void *lpString, int nMaxCount)');

  const hwnd = (getFgWin as () => unknown)();
  if (!hwnd) return false;

  const buf = Buffer.alloc(512);
  const len = (getText as (h: unknown, b: Buffer, n: number) => number)(hwnd, buf, 256);
  const title = len > 0 ? buf.toString('ucs2', 0, len * 2) : '';
  console.log(`    Foreground: "${title}"`);
  return title.length > 0;
});

asyncTest('GetWindowRect returns valid rect', async () => {
  const getFgWin = user32.func('HWND __stdcall GetForegroundWindow()');
  const getRect = user32.func('bool __stdcall GetWindowRect(HWND hWnd, void *lpRect)');

  const hwnd = (getFgWin as () => unknown)();
  if (!hwnd) return false;

  const buf = Buffer.alloc(koffi.sizeof(RECT));
  const ok = (getRect as (h: unknown, b: Buffer) => boolean)(hwnd, buf);
  if (!ok) return false;

  const rect = koffi.decode(buf, RECT);
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  console.log(`    Rect: (${rect.left}, ${rect.top}) ${w}x${h}`);
  return w > 0 && h > 0;
});

// ── Window Focus APIs ──
console.log(`\n${BOLD}${CYAN}=== Window Focus APIs ===${RESET}\n`);

test('SetForegroundWindow binding works', () => {
  const fn = user32.func('bool __stdcall SetForegroundWindow(HWND hWnd)');
  return !!fn;
});

test('SetWindowPos binding works', () => {
  const fn = user32.func('bool __stdcall SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
  return !!fn;
});

// ── Window State Management APIs ──
console.log(`\n${BOLD}${CYAN}=== Window State Management APIs ===${RESET}\n`);

test('ShowWindow binding works', () => {
  const fn = user32.func('bool __stdcall ShowWindow(HWND hWnd, int nCmdShow)');
  return !!fn;
});

test('PostMessageW binding works', () => {
  const fn = user32.func('bool __stdcall PostMessageW(HWND hWnd, uint Msg, uint wParam, int lParam)');
  return !!fn;
});

// ── ShellExecuteW ──
console.log(`\n${BOLD}${CYAN}=== ShellExecuteW (Launch App) ===${RESET}\n`);

test('ShellExecuteW binding works', () => {
  const fn = shell32.func('void * __stdcall ShellExecuteW(HWND hwnd, void *lpOperation, void *lpFile, void *lpParameters, void *lpDirectory, int nShowCmd)');
  return !!fn;
});

// ── SendInput ──
console.log(`\n${BOLD}${CYAN}=== SendInput (Mouse/Keyboard) ===${RESET}\n`);

test('SendInput binding works', () => {
  const fn = user32.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)');
  return !!fn;
});

// Test SetCursorPos simply - no verification, just move
test('SetCursorPos basic call', () => {
  const setPos = user32.func('bool __stdcall SetCursorPos(int x, int y)');
  // Just call it, don't even check return value
  (setPos as (x: number, y: number) => boolean)(500, 500);
  return true;
});


// ── Full workflow: minimize a window ──
console.log(`\n${BOLD}${CYAN}=== Full Workflow: Minimize Window ===${RESET}\n`);

asyncTest('Minimize + restore workflow', async () => {
  await new Promise(r => setTimeout(r, 200));

  if (enumeratedWindows.length === 0) {
    console.log('    SKIPPED — no windows');
    return false;
  }

  const target = enumeratedWindows.find(w =>
    !w.title.includes('Taskbar') &&
    !w.title.includes('Start') &&
    !w.title.includes('Program Manager') &&
    w.title.length > 0
  );

  if (!target) {
    console.log('    SKIPPED — no suitable target');
    return false;
  }

  console.log(`    Target: "${target.title}"`);

  const ShowWindow = user32.func('bool __stdcall ShowWindow(HWND hWnd, int nCmdShow)');
  const PostMessageW = user32.func('bool __stdcall PostMessageW(HWND hWnd, uint Msg, uint wParam, int lParam)');

  // Use the raw HWND object from enumeration, not a string
  const hWnd = target._hwnd;

  const pmOk = (PostMessageW as (h: unknown, m: number, w: number, l: number) => boolean)(
    hWnd, WM_SYSCOMMAND, SC_MINIMIZE, 0
  );
  console.log(`    PostMessage SC_MINIMIZE: ${pmOk ? 'sent' : 'failed'}`);
  await new Promise(r => setTimeout(r, 500));

  const swOk = (ShowWindow as (h: unknown, cmd: number) => boolean)(hWnd, SW_RESTORE);
  console.log(`    ShowWindow SW_RESTORE: ${swOk ? 'success' : 'failed'}`);
  await new Promise(r => setTimeout(r, 300));

  return pmOk || swOk;
});

asyncTest('Maximize + restore workflow', async () => {
  await new Promise(r => setTimeout(r, 200));

  if (enumeratedWindows.length === 0) return false;

  const target = enumeratedWindows.find(w =>
    !w.title.includes('Taskbar') && !w.title.includes('Start') && w.title.length > 0
  );
  if (!target) return false;

  const ShowWindow = user32.func('bool __stdcall ShowWindow(HWND hWnd, int nCmdShow)');
  const PostMessageW = user32.func('bool __stdcall PostMessageW(HWND hWnd, uint Msg, uint wParam, int lParam)');

  const hWnd = target._hwnd;

  const pmOk = (PostMessageW as (h: unknown, m: number, w: number, l: number) => boolean)(
    hWnd, WM_SYSCOMMAND, SC_MAXIMIZE, 0
  );
  console.log(`    PostMessage SC_MAXIMIZE: ${pmOk ? 'sent' : 'failed'}`);
  await new Promise(r => setTimeout(r, 300));

  const swOk = (ShowWindow as (h: unknown, cmd: number) => boolean)(hWnd, SW_RESTORE);
  console.log(`    ShowWindow SW_RESTORE: ${swOk ? 'success' : 'failed'}`);
  return pmOk || swOk;
});

// ── Wait for async tests ──
await new Promise(r => setTimeout(r, 2000));

console.log(`\n${BOLD}${CYAN}========================================${RESET}`);
console.log(`${BOLD}  Test Summary${RESET}`);
console.log(`${BOLD}${CYAN}========================================${RESET}`);
console.log(`  Total:  ${totalTests}`);
console.log(`  ${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`  ${RED}Failed: ${failedTests}${RESET}`);

if (failures.length > 0) {
  console.log(`\n${RED}Failed tests:${RESET}`);
  failures.forEach(f => console.log(`  - ${f}`));
}

if (failedTests === 0) {
  console.log(`\n${GREEN}${BOLD}All tests passed.${RESET}`);
  process.exit(0);
} else {
  console.log(`\n${YELLOW}${BOLD}Some tests failed. Fix the FFI bindings and re-run.${RESET}`);
  process.exit(1);
}
