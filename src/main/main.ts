// Load environment variables from .env file — MUST be first so dotenv runs
// before any module-scope ChatOpenAI instances read process.env.*
import 'dotenv/config';

import { app, Menu } from 'electron';
import { createMainWindow } from './windows';
import { registerIPCHandlers } from './ipc/handlers';
import { registerApiConfigHandlers } from './ipc/api-config';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { createTray, destroyTray } from './tray';
import { initializePreferences } from './preferences';
import { initializeEs } from './utils/esDownloader';
import { logSystemInfo, getPlatformName, isWindows, isMacOS } from './utils/platform';
import { mcpService } from './services/mcp/client';
import { registerBrowserHandlers } from './ipc/browser-handlers';
import { statefulBrowserAgent } from './services/browser/stateful-browser-agent';
import { getAskGraph } from './services/langgraph/research-agent';
import { execSync } from 'child_process';
import { createLogger } from './utils/logger';

// Polyfill Node.js globals for ESM compatibility (required by better-sqlite3)
import { fileURLToPath } from 'url';
import { dirname } from 'path';
globalThis.__filename = fileURLToPath(import.meta.url);
globalThis.__dirname = dirname(globalThis.__filename);

const log = createLogger('App');

// Global error handlers - prevent silent crashes
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Enable security features
app.enableSandbox();

// Disable GPU disk cache to prevent Windows permission errors
// These errors occur when Electron tries to create GPU cache in protected directories
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-direct-composition');

// Disable storage quota management to prevent quota database errors
// These errors occur when Chromium can't access quota database files
app.commandLine.appendSwitch('disable-features', 'PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies');

// Enable CDP (Chrome DevTools Protocol) on default port for external debugging (development only)
if (process.env.NODE_ENV === 'development') {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

log.info('Electron app starting...');
logSystemInfo();

app.whenReady().then(async () => {
  log.info('App ready');

  // Validate required environment variables for API features
  const missingEnvVars: string[] = [];
  if (!process.env.API_KEY) missingEnvVars.push('API_KEY');
  if (!process.env.BASE_URL) missingEnvVars.push('BASE_URL');
  if (!process.env.MODEL) missingEnvVars.push('MODEL');

  if (missingEnvVars.length > 0) {
    log.warn('Missing required environment variables for API features:', missingEnvVars.join(', '));
    log.info('Users will be prompted to configure these via API Key Setup');
  }

  initializePreferences();
  
  if (isWindows()) {
    log.info('Initializing file search...');
    const esInitialized = await initializeEs();
    if (esInitialized) {
      log.info('File search ready');
    } else {
      log.warn('File search initialization failed');
    }
  } else {
    log.info('File search not available on', getPlatformName());
  }
  
  // Remove default menu bar
  Menu.setApplicationMenu(null);
  
  registerIPCHandlers();
  log.info('IPC handlers registered');

  registerApiConfigHandlers();
  log.info('API config handlers registered');
  
  registerBrowserHandlers();
  log.info('Browser handlers registered');
  
  // Pre-compile LangGraph in background - shifts cost from first message to startup
  getAskGraph()
    .then(() => log.info('LangGraph compiled and cached'))
    .catch((err) => log.warn('LangGraph pre-compilation failed (will retry on first chat):', err));

  try {
    log.info('Checking Playwright installation...');
    execSync('npx playwright install chromium', { stdio: 'ignore' });
    log.info('Playwright Chromium installed');
  } catch (error) {
    log.warn('Playwright installation failed:', error instanceof Error ? error.message : 'Unknown error');
    log.info('Browser automation will install Playwright on first use');
  }
  
  registerGlobalShortcuts();
  log.info('Global shortcuts registered');
  
  // Create system tray
  createTray();
  log.info('System tray created');
  
  // Create main window
  createMainWindow();
  log.info('Main window created');
  
  // Prevent menu bar from appearing on Alt key press
  app.on('browser-window-focus', (_, window) => {
    window.setMenuBarVisibility(false);
    window.setAutoHideMenuBar(true);
  });
  
  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (require('electron').BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      log.info('Window recreated (macOS activate)');
    }
  });
  
  log.info('App initialization complete');
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  log.info('All windows closed');
  if (!isMacOS()) {
    log.info('Quitting app', getPlatformName());
    app.quit();
  }
});

app.on('will-quit', () => {
  log.info('App quitting...');
  unregisterGlobalShortcuts();
  destroyTray();
  
  mcpService.cleanup().catch(err => {
    log.warn('MCP cleanup error:', err);
  });
  
  statefulBrowserAgent.cleanup().catch(err => {
    log.warn('Browser agent cleanup error:', err);
  });
  
  log.info('Cleanup complete');
});

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
  log.info('Web contents created (security enabled)');
  
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
  
  // Prevent navigation to external URLs
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'http://localhost:5173' && !url.startsWith('file://')) {
      log.info('Blocked navigation to:', url);
      event.preventDefault();
    }
  });
});
