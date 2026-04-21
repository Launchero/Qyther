import { BrowserWindow, screen } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { windowManager } from './windowManager';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    webPreferences: {
      // CRITICAL: Security settings
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/preload.js'),
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
  const isDev = process.env.DEV === 'true' || process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

export function showMainWindow(): void {
  if (mainWindow) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 👁️  Showing main window`);
    // Reposition based on current mode
    windowManager.repositionWindow(mainWindow);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('window:shown');
  }
}

export function hideMainWindow(): void {
  if (mainWindow) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 👁️  Hiding main window`);
    // Preserve current mode for next open
    const currentMode = windowManager.getCurrentMode();
    console.log(`[${timestamp}] 💾 Preserving window mode: ${currentMode}`);
    // Notify renderer to store active element before hiding
    mainWindow.webContents.send('window:will-hide');
    mainWindow.hide();
  }
}

export function toggleMainWindow(): void {
  const timestamp = new Date().toLocaleTimeString();
  if (mainWindow && mainWindow.isVisible()) {
    console.log(`[${timestamp}] 🔄 Toggling window: visible → hiding`);
    hideMainWindow();
  } else {
    console.log(`[${timestamp}] 🔄 Toggling window: hidden → showing`);
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
