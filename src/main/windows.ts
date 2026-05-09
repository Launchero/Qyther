import { BrowserWindow, screen, nativeImage } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { windowManager } from './windowManager';
import { createLogger } from './utils/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('Window');

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  const config = windowManager.getModeConfig();
  const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width: screenWidth, height: screenHeight } = currentScreen.workAreaSize;

  const windowWidth = config.width;
  const windowHeight = config.height;
  const x = Math.floor((screenWidth - windowWidth) / 2 + currentScreen.bounds.x);
  
  // Keep consistent top position for both modes (expand downward only)
  const y = Math.floor(screenHeight * 0.15 + currentScreen.bounds.y); // 15% from top

  // Cap height to avoid taskbar occlusion on initial launch
  const maxAvailableHeight = screenHeight - (y - currentScreen.bounds.y);
  const effectiveHeight = Math.min(windowHeight, maxAvailableHeight);

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

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.setMenuBarVisibility(false);
    mainWindow?.show();
    // Open DevTools for debugging in detached mode
    if (process.env.ELECTRON_VITE_DEV_MODE === 'true') {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Keep menu bar hidden on window show
  mainWindow.on('show', () => {
    mainWindow?.setMenuBarVisibility(false);
  });

  // Intercept Alt+Space on Windows.
  // Alt+Space is reserved by Windows for the system context menu.
  // The system-context-menu event doesn't capture Alt+Space in Electron 41.x,
  // so we use hookWindowMessage to intercept WM_SYSCOMMAND (0x0112) with SC_KEYMENU (0xF100).
  const WM_SYSCOMMAND = 0x0112;
  const SC_KEYMENU = 0xF100;

  mainWindow.hookWindowMessage(WM_SYSCOMMAND, (wParam) => {
    const command = wParam.readUInt32LE(0) & 0xFFF0;

    if (command === SC_KEYMENU) {
      toggleMainWindow();
      return true; // Prevent default
    }
    return false; // Allow other commands
  });

  // Hide window instead of closing when user presses escape
  mainWindow.on('close', (event) => {
    if (mainWindow?.isVisible()) {
      event.preventDefault();
      // Notify renderer to store active element before hiding
      mainWindow.webContents.send('window:will-hide');
      mainWindow.hide();
    }
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
    mainWindow.webContents.send('window:shown');
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
