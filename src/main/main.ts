import { app, Menu } from 'electron';
import { createMainWindow } from './windows';
import { registerIPCHandlers } from './ipc/handlers';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { createTray, destroyTray } from './tray';
import { initializePreferences } from './preferences';
import { initializeEs } from './utils/esDownloader';
import { logSystemInfo, getPlatformName, isWindows, isMacOS } from './utils/platform';

// Load environment variables from .env file
import 'dotenv/config';

// Polyfill Node.js globals for ESM compatibility (required by better-sqlite3)
import { fileURLToPath } from 'url';
import { dirname } from 'path';
globalThis.__filename = fileURLToPath(import.meta.url);
globalThis.__dirname = dirname(globalThis.__filename);

// Note: electron-squirrel-startup is optional for Windows installer handling
// Uncomment if you need Windows installer support:
// if (require('electron-squirrel-startup')) app.quit();

// Enable verbose logging to terminal
const isDev = process.env.ELECTRON_VITE_DEV_MODE;

function log(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

// Enable security features
app.enableSandbox();

// Disable GPU disk cache to prevent Windows permission errors
// These errors occur when Electron tries to create GPU cache in protected directories
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-direct-composition');

// Disable storage quota management to prevent quota database errors
// These errors occur when Chromium can't access quota database files
app.commandLine.appendSwitch('disable-features', 'PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies');

// Log app startup with platform info
log('🚀 Electron app starting...');
logSystemInfo();

app.whenReady().then(async () => {
  log('✅ App ready');
  
  // Initialize preferences (create directory and files if needed)
  initializePreferences();
  
  // Initialize es.exe for file search (Windows only)
  if (isWindows()) {
    log('🔍 Initializing file search...');
    const esInitialized = await initializeEs();
    if (esInitialized) {
      log('✅ File search ready');
    } else {
      log('⚠️  File search initialization failed');
    }
  } else {
    log(`ℹ️  File search not available on ${getPlatformName()}`);
  }
  
  // Remove default menu bar
  Menu.setApplicationMenu(null);
  
  // Register IPC handlers
  registerIPCHandlers();
  log('📡 IPC handlers registered');
  
  // Register global shortcuts
  registerGlobalShortcuts();
  log('⌨️  Global shortcuts registered');
  
  // Create system tray
  createTray();
  log('📍 System tray created');
  
  // Create main window
  createMainWindow();
  log('🪟 Main window created');
  
  // Prevent menu bar from appearing on Alt key press
  app.on('browser-window-focus', (_, window) => {
    window.setMenuBarVisibility(false);
    window.setAutoHideMenuBar(true);
  });
  
  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (require('electron').BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      log('🪟 Window recreated (macOS activate)');
    }
  });
  
  log('✨ App initialization complete');
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  log('🚪 All windows closed');
  if (!isMacOS()) {
    log(`👋 Quitting app (${getPlatformName()})`);
    app.quit();
  }
});

// Cleanup shortcuts and tray on quit
app.on('will-quit', () => {
  log('👋 App quitting...');
  unregisterGlobalShortcuts();
  destroyTray();
  log('✅ Cleanup complete');
});

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
  log('🔒 Web contents created (security enabled)');
  
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
  
  // Prevent navigation to external URLs
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'http://localhost:5173' && !url.startsWith('file://')) {
      log(`⛔ Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });
});
