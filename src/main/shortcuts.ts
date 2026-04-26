import { globalShortcut } from 'electron';
import { toggleMainWindow, toggleWindowMode } from './windows';
import { createLogger } from './utils/logger';
import { isWindows } from './utils/platform';

const log = createLogger('Shortcuts');

// Windows API constants
const VK_SPACE = 0x20;
const VK_LMENU = 0xA4; // Left Alt
const VK_RMENU = 0xA5; // Right Alt
const VK_MENU = 0x12;  // Alt (either)
const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;
const WM_SYSKEYDOWN = 0x0104;
const WM_SYSKEYUP = 0x0105;

// Native hook state
let keyboardHook: unknown = null;
let user32: ReturnType<typeof import('koffi').load> | null = null;
let kernel32: ReturnType<typeof import('koffi').load> | null = null;
let hookCallback: unknown = null;

// Track Alt key state and debounce
let isAltPressed = false;
let lastToggleTime = 0;
const TOGGLE_DEBOUNCE_MS = 300;

async function setupWindowsGlobalHotkey(): Promise<void> {
  if (!isWindows()) return;

  try {
    // Dynamic import koffi
    const koffiModule = await import('koffi');
    const koffi = koffiModule.default || koffiModule;

    // Load Windows DLLs
    user32 = koffi.load('user32.dll');
    kernel32 = koffi.load('kernel32.dll');

    // Define KBDLLHOOKSTRUCT for low-level keyboard hook
    const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
      vkCode: 'uint32',
      scanCode: 'uint32',
      flags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uint64',
    });

    // Define HOOKPROC callback type
    const HOOKPROC = koffi.proto('HOOKPROC', 'int', ['int', 'uint', koffi.pointer(KBDLLHOOKSTRUCT)]);

    // Define Windows API functions
    const SetWindowsHookExW = user32.func('__stdcall', 'SetWindowsHookExW', 'void *', [
      'int',           // idHook
      koffi.pointer(HOOKPROC),  // lpfn
      'void *',        // hMod
      'uint32',        // dwThreadId
    ]);

    const UnhookWindowsHookEx = user32.func('__stdcall', 'UnhookWindowsHookEx', 'bool', [
      'void *',        // hhk
    ]);

    const CallNextHookEx = user32.func('__stdcall', 'CallNextHookEx', 'int', [
      'void *',        // hhk
      'int',           // nCode
      'uint',          // wParam
      koffi.pointer(KBDLLHOOKSTRUCT), // lParam
    ]);

    const GetAsyncKeyState = user32.func('__stdcall', 'GetAsyncKeyState', 'int16', [
      'int',           // vKey
    ]);

    const GetMessageW = user32.func('__stdcall', 'GetMessageW', 'int', [
      'void *',        // lpMsg
      'void *',        // hWnd
      'uint',          // wMsgFilterMin
      'uint',          // wMsgFilterMax
    ]);

    const TranslateMessage = user32.func('__stdcall', 'TranslateMessage', 'bool', [
      'void *',        // lpMsg
    ]);

    const DispatchMessageW = user32.func('__stdcall', 'DispatchMessageW', 'long', [
      'void *',        // lpMsg
    ]);

    // Hook callback function
    hookCallback = koffi.register((nCode: number, wParam: number, lParam: unknown) => {
      if (nCode >= 0) {
        // Decode KBDLLHOOKSTRUCT from lParam
        const kb = koffi.decode(lParam as Buffer, KBDLLHOOKSTRUCT);

        // Check if Alt is pressed (high bit set means key is down)
        const altState = GetAsyncKeyState(VK_MENU);
        const isAltDown = (altState & 0x8000) !== 0;

        // Track Alt key state
        if (kb.vkCode === VK_MENU) {
          if (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN) {
            isAltPressed = true;
          } else if (wParam === WM_KEYUP || wParam === WM_SYSKEYUP) {
            isAltPressed = false;
          }
        }

        // Check for Alt+Space (only on key down, with debounce)
        const now = Date.now();
        if (kb.vkCode === VK_SPACE && isAltDown && (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN)) {
          if (now - lastToggleTime < TOGGLE_DEBOUNCE_MS) {
            log.debug('Alt+Space debounced, ignoring');
          } else {
            lastToggleTime = now;
            log.info('Low-level keyboard hook: Alt+Space detected');
            toggleMainWindow();
          }
          return 1; // Block the key from reaching other applications
        }
      }

      // Call next hook in chain
      return CallNextHookEx(null, nCode, wParam, lParam as Buffer);
    }, koffi.pointer(HOOKPROC));

    // Install the hook
    keyboardHook = SetWindowsHookExW(WH_KEYBOARD_LL, hookCallback as Buffer, null, 0);

    if (!keyboardHook) {
      log.error('Failed to install low-level keyboard hook');
      return;
    }

    log.info('Low-level keyboard hook installed successfully for Alt+Space');

    // Define message pump structures ONCE outside the interval
    const POINT = koffi.struct('MSG_PUMP_POINT', {
      x: 'long',
      y: 'long',
    });

    const MSG = koffi.struct('MSG_PUMP_MSG', {
      hwnd: 'void *',
      message: 'uint',
      wParam: 'uintptr_t',
      lParam: 'long',
      time: 'uint32',
      pt: POINT,
    });

    const PeekMessageW = user32.func('__stdcall', 'PeekMessageW', 'bool', [
      koffi.pointer(MSG),
      'void *',
      'uint',
      'uint',
      'uint',
    ]);

    // Start a message pump in a separate interval to process hook messages
    // This is necessary because the hook runs in the context of the message pump
    const msgBuffer = Buffer.alloc(koffi.sizeof(MSG));
    setInterval(() => {
      // Peek at messages to keep the hook alive
      while (PeekMessageW(msgBuffer, null, 0, 0, 1)) { // PM_REMOVE = 1
        TranslateMessage(msgBuffer);
        DispatchMessageW(msgBuffer);
      }
    }, 10);

  } catch (error) {
    log.error('Error setting up Windows global hotkey:', error);
  }
}

function cleanupWindowsGlobalHotkey(): void {
  if (keyboardHook && user32) {
    try {
      const UnhookWindowsHookEx = user32.func('__stdcall', 'UnhookWindowsHookEx', 'bool', ['void *']);
      UnhookWindowsHookEx(keyboardHook);
      keyboardHook = null;
      log.info('Low-level keyboard hook uninstalled');
    } catch (error) {
      log.error('Error uninstalling keyboard hook:', error);
    }
  }

  if (hookCallback) {
    // Note: koffi.unregister is not available in all versions
    hookCallback = null;
  }
}

export function registerGlobalShortcuts(): void {
  // On Windows, use low-level keyboard hook for Alt+Space since
  // Electron's globalShortcut cannot register reserved system shortcuts
  // and RegisterHotKey also fails for Alt+Space
  if (isWindows()) {
    setupWindowsGlobalHotkey();
  } else {
    // macOS/Linux: use Electron's globalShortcut
    const ret = globalShortcut.register('Alt+Space', () => {
      toggleMainWindow();
    });

    if (!ret) {
      log.warn('Failed to register global shortcut Alt+Space');
    } else {
      log.info('Global shortcut Alt+Space registered successfully');
    }
  }

  // Alt+Shift+M works on all platforms
  const retMode = globalShortcut.register('Alt+Shift+M', () => {
    const newMode = toggleWindowMode();
    log.info('Window mode toggled to:', newMode);
  });

  if (!retMode) {
    log.warn('Failed to register global shortcut Alt+Shift+M');
  } else {
    log.info('Global shortcut Alt+Shift+M registered successfully');
  }
}

export function unregisterGlobalShortcuts(): void {
  cleanupWindowsGlobalHotkey();

  if (!isWindows()) {
    globalShortcut.unregister('Alt+Space');
  }
  globalShortcut.unregister('Alt+Shift+M');
  log.info('Global shortcuts unregistered');
}
