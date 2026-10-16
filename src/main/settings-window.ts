import { BrowserWindow, nativeImage } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './utils/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('Window');

// The settings window is a second, ordinary BrowserWindow alongside the frameless always-on-top
// palette in `windows.ts`. It is created lazily (on a tray item or `settings:open`), never at boot.
let settingsWindow: BrowserWindow | null = null;

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    return settingsWindow;
  }

  const isDev = process.env.DEV === 'true' || process.env.NODE_ENV === 'development';
  const iconDir = isDev
    ? join(__dirname, '../../build/icons')
    : join(process.resourcesPath, 'icons');
  const appIcon = nativeImage.createFromPath(join(iconDir, 'icon.ico'));

  // Deliberately NOT the palette's options: no `transparent`, no `alwaysOnTop`, no `skipTaskbar`.
  // A settings pane is a normal app window you linger in — taskbar-present, resizable, opaque — even
  // though it is frameless (the renderer paints its own drag titlebar).
  settingsWindow = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 560,
    minHeight: 400,
    show: false,
    frame: false,
    title: 'Qyther Settings',
    resizable: true,
    maximizable: true,
    minimizable: true,
    alwaysOnTop: false,
    hasShadow: true,
    autoHideMenuBar: true,
    roundedCorners: true,
    backgroundColor: '#1e1e2e',
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/preload.cjs'),
    },
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
    settingsWindow?.focus();
  });

  // A plain close destroys this window. It cannot trigger the app's quit on its own: `close` here
  // is not vetoed to hide (unlike the palette at `windows.ts`), and the palette window — which
  // hides rather than closes — is always still present in `BrowserWindow.getAllWindows()`, so
  // `window-all-closed` (which quits on non-macOS) does not fire. If that invariant ever breaks,
  // closing settings alone would quit the app; the `settings-window` shutdown step is the backstop.
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  if (isDev) {
    settingsWindow.loadURL('http://localhost:5173/settings.html');
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'));
  }

  return settingsWindow;
}

export function openSettingsWindow(): void {
  log.info('Opening settings window');
  const win = createSettingsWindow();
  win.show();
  win.focus();
}

export function closeSettingsWindow(): void {
  settingsWindow?.close();
}

/**
 * The `settings-window` step of `buildShutdownSteps()`: destroy a live settings window so no
 * renderer/GPU child outlives the main pid. A no-op when the window was never opened.
 */
export function destroySettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.destroy();
  }
  settingsWindow = null;
}
