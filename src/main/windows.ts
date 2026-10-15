import { BrowserWindow, app, nativeImage } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { windowManager, getPaletteLayout } from './windowManager';
import { createLogger } from './utils/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('Window');

let mainWindow: BrowserWindow | null = null;

// An app-level Quit (`tray.ts:51`, `app:quit`) closes every window, which lands in the
// `close` handler below. Without this flag the unconditional hide-instead-of-close rule
// would veto the app's own shutdown. No Quit path is added here.
let isQuitting = false;
app.on('before-quit', () => {
  isQuitting = true;
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** Electron passes WndProc `wParam`/`lParam` to the hook callback as little-endian buffers. */
function readWindowMessageArgument(arg: Buffer | undefined): number {
  return arg && arg.length >= 4 ? arg.readUInt32LE(0) : 0;
}

/**
 * Alt+Space is reserved by Windows for the system context menu, and the system-context-menu
 * event doesn't capture it in Electron 41.x, so the toggle is driven from the WndProc by
 * intercepting WM_SYSCOMMAND (0x0112) with SC_KEYMENU (0xF100). The koffi hook in
 * `shortcuts.ts` is the other half of this pair.
 */
function hookAltSpaceInterceptor(window: BrowserWindow): void {
  const WM_SYSCOMMAND = 0x0112;
  const SC_KEYMENU = 0xF100;

  window.hookWindowMessage(WM_SYSCOMMAND, (wParam, lParam) => {
    const command = readWindowMessageArgument(wParam) & 0xFFF0;
    // WM_SYSCOMMAND/SC_KEYMENU is posted for every Alt+<key> accelerator and lParam carries the
    // key pressed with it — 0 only for bare Alt+Space — so lParam alone separates the two cases.
    if (command === SC_KEYMENU && readWindowMessageArgument(lParam) === 0) {
      toggleMainWindow();
      return true; // Prevent the system menu for Alt+Space
    }
    return false; // Let Alt+<letter> (Alt+Shift+T, Alt+Shift+M, ...) reach the app's shortcuts
  });
}

export function createMainWindow(): BrowserWindow {
  const config = windowManager.getModeConfig();
  // Origin, width and the height cap all come from the display's `workArea` (see
  // `getPaletteLayout`), so a taskbar docked top or left is already excluded.
  const { x, y, width: windowWidth, height: effectiveHeight } = getPaletteLayout(config.width, config.height);

  // Load window icon from build resources
  const isDev = process.env.DEV === 'true' || process.env.NODE_ENV === 'development';
  const iconDir = isDev 
    ? join(__dirname, '../../build/icons') 
    : join(process.resourcesPath, 'icons');
  
  const appIcon = nativeImage.createFromPath(join(iconDir, 'icon.ico'));

  const options: Electron.BrowserWindowConstructorOptions = {
    width: windowWidth,
    height: effectiveHeight,
    x,
    y,
    show: false,
    frame: false,
    title: '',
    titleBarStyle: 'hidden',
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    backgroundMaterial: 'none',
    autoHideMenuBar: true,
    roundedCorners: true,
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      // CRITICAL: Security settings
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/preload.cjs'),
    },
  };

  mainWindow = new BrowserWindow(options);

  // A session restored into `expanded` never goes through `setMode`, so the mode's
  // constraints (resizable, min/max bounds, width lock) have to be applied here too.
  windowManager.applyModeConstraints(mainWindow);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.setMenuBarVisibility(false);
    mainWindow?.show();
    // A launcher takes the keyboard with the screen. Without this the window is shown but never
    // activated, Chromium puts the caret on the first tabbable node (the mode-switch button), and
    // the palette is unusable by keyboard until something clicks the input — measured: typed
    // characters produced an empty input and three real Escape presses failed to hide the window.
    mainWindow?.focus();
    // Open DevTools for debugging in detached mode
    if (process.env.ELECTRON_VITE_DEV_MODE === 'true') {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Keep menu bar hidden on window show, and announce the show. This is the ONE place
  // `window:shown` is emitted: the renderer parks/restores keyboard focus and plays the surface
  // reveal off it, so the boot show (`ready-to-show` below) and every hotkey/tray reveal have to
  // be indistinguishable here. Emitting it from `showMainWindow()` as well used to double-play the
  // reveal, and not emitting it at all at boot left the caret wherever Chromium put it.
  mainWindow.on('show', () => {
    mainWindow?.setMenuBarVisibility(false);
    mainWindow?.webContents.send('window:shown');
  });

  hookAltSpaceInterceptor(mainWindow);

  // Hide window instead of closing: a close while hidden would destroy the window, fire
  // `window-all-closed` and quit the app, leaving `mainWindow` a dead reference.
  mainWindow.on('close', (event) => {
    if (isQuitting) return; // an app-level Quit must still be able to destroy the window
    event.preventDefault();
    if (mainWindow?.isVisible()) {
      // Notify renderer to store active element before hiding
      mainWindow.webContents.send('window:will-hide');
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load application
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

export function showMainWindow(): void {
  if (mainWindow) {
    log.info('Showing main window');
    windowManager.repositionWindow(mainWindow);
    mainWindow.show();
    mainWindow.focus();
    // `window:shown` comes from the window's own `show` handler, so this path must not send it too.
  }
}

export function hideMainWindow(): void {
  if (mainWindow) {
    log.info('Hiding main window');
    const currentMode = windowManager.getCurrentMode();
    log.debug('Preserving window mode:', currentMode);
    mainWindow.webContents.send('window:will-hide');
    mainWindow.hide();
  }
}

export function toggleMainWindow(): void {
  if (mainWindow && mainWindow.isVisible()) {
    log.info('Toggling window: visible -> hiding');
    hideMainWindow();
  } else {
    log.info('Toggling window: hidden -> showing');
    showMainWindow();
  }
}

export function setWindowMode(mode: import('./windowManager').WindowMode): void {
  if (mainWindow) {
    windowManager.setMode(mode, mainWindow);
  }
}

export function getWindowMode(): import('./windowManager').WindowMode {
  return windowManager.getCurrentMode();
}

export function toggleWindowMode(): import('./windowManager').WindowMode {
  if (mainWindow) {
    return windowManager.toggleMode(mainWindow);
  }
  return windowManager.getCurrentMode();
}
