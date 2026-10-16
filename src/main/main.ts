// Load environment variables from .env file — MUST be first so dotenv runs
// before anything reads process.env at import time. (Pi's provider reads at the
// point of use, but preferences and platform config still read during import.)
import 'dotenv/config';

import { app, Menu, ipcMain } from 'electron';
import { createMainWindow } from './windows';
import { destroySettingsWindow } from './settings-window';
import { registerIPCHandlers } from './ipc/handlers';
import { registerApiConfigHandlers } from './ipc/api-config';
import { registerSettingsHandlers } from './ipc/settings-handlers';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { createTray, destroyTray } from './tray';
import { initializePreferences } from './preferences';
import { initializeEs } from './utils/esDownloader';
import { initializeDatabaseManager, getDatabaseManager } from './services/database/database-manager';
import { logSystemInfo, getPlatformName, isWindows, isMacOS, initializeAnimationPreference } from './utils/platform';
import { mcpService } from './services/mcp/client';
import { registerBrowserHandlers } from './ipc/browser-handlers';
import { createShutdown, type ShutdownStep } from './lifecycle';
import { execSync } from 'child_process';
import { createLogger } from './utils/logger';

// Polyfill Node.js globals for ESM compatibility (used by native `bindings` lookups)
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

// SIGTERM/SIGINT handlers - graceful shutdown for container orchestrators and Ctrl+C.
// Without these, Node.js exits immediately without cleanup when receiving these signals.
// Docker, Kubernetes, and systemd send SIGTERM; Ctrl+C sends SIGINT.
// Research: "Once you add your own listener, Node removes that default exit behavior"
// so we MUST call app.quit() to trigger the normal Electron shutdown path.
let signalReceived = false;
const handleShutdownSignal = (signal: string) => {
  if (signalReceived) {
    log.warn(`Received ${signal} during shutdown, already processing`);
    return;
  }
  signalReceived = true;
  log.info(`Received ${signal}, initiating graceful shutdown...`);
  // Route into Electron's normal quit path so will-quit fires and runs the ordered teardown.
  app.quit();
};

process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.on('SIGINT', () => handleShutdownSignal('SIGINT'));

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
  
  // Initialize SQLite database for desktop agent memory and persistence
  try {
    log.info('Initializing desktop agent database...');
    const dbManager = await initializeDatabaseManager();
    const stats = dbManager.stats();
    log.info(`Database ready: ${stats.trajectoryCount} trajectories, ${stats.failureCount} failures`);
  } catch (err) {
    log.warn('Desktop agent database initialization failed, continuing without persistence:', err instanceof Error ? err.message : err);
  }
  
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

  // Initialize MCP service — loads tools from mcp-config.json for the Ask-mode agent
  try {
    await mcpService.initializeWithRetry();
    log.info('MCP service initialized');
  } catch (err) {
    log.warn('MCP service initialization failed (will retry via IPC):', err instanceof Error ? err.message : err);
  }

  // Remove default menu bar
  Menu.setApplicationMenu(null);
  
  registerIPCHandlers();
  log.info('IPC handlers registered');

  registerApiConfigHandlers();
  log.info('API config handlers registered');

  registerSettingsHandlers();
  log.info('Settings handlers registered');

  registerBrowserHandlers();
  log.info('Browser handlers registered');
  
  // Nothing to pre-compile. This used to warm `getAskGraph()`, which built the 5-node
  // AskGraph ahead of the first message. There is no graph now: the Ask-mode agent and its
  // toolbox are built lazily by `pi/ask-turn.ts` on the first turn, which is also what keeps
  // the tesseract worker and UIA facade off the boot path.

  try {
    log.info('Checking Playwright installation...');
    // Bounded: `execSync` defaults to no timeout, so a network or npm hang would block the
    // entire boot indefinitely. 120s is generous for a first-time Chromium download but short
    // enough that a stuck install does not strand the app on the boot path.
    execSync('npx playwright install chromium', { stdio: 'ignore', timeout: 120_000 });
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

  // Off the first-paint path: the mode-height tween honours the OS "Show animations" setting
  // once this resolves, and animates by default until it does.
  void initializeAnimationPreference();
  
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

/**
 * The ordered teardown, in one list, so the sequence is a readable contract rather than a chain of
 * statements — and so each release reports a name and a duration.
 *
 * Order is load-bearing:
 *  - The koffi hook and its 10 ms message-pump interval go first. That interval is what keeps the
 *    message loop alive, so nothing that can throw may sit in front of releasing it.
 *  - `langchain` next, because its browser-session inactivity timer is a live handle that would
 *    otherwise outlive the process, and `cleanupBrowserAgent` is also the browser subtree's release
 *    path — one owner, one call, no second `statefulBrowserAgent.cleanup()` step.
 *  - MCP after it, because the shared `mcpService` client owns the Playwright stdio child in the
 *    normal (config-driven) case; the fallback client that the browser agent holds only exists when
 *    MCP did not initialise, and it is released by the step above.
 *  - The Pi desktop agent is second-to-last and the database last, so a trajectory written during
 *    teardown is still on disk when `close()` flushes. Each step is individually bounded, so a
 *    slow native release costs its own deadline and not the ones behind it.
 */
function buildShutdownSteps(): ShutdownStep[] {
  return [
    { name: 'global-shortcuts', dispose: () => unregisterGlobalShortcuts() },
    { name: 'tray', dispose: () => destroyTray() },
    {
      // A lazily-opened settings window is a long-lived renderer/GPU child like any window; release
      // it before `ipc-handlers` removes the bridges it may still use, and no-op when it was never
      // opened. `destroySettingsWindow()` guards on `isDestroyed()`, so no try/catch is needed.
      name: 'settings-window',
      dispose: () => destroySettingsWindow(),
    },
    {
      // The browser subtree's release path — `cleanupBrowserAgent()` clears the inactivity
      // timer and tears down the Playwright session. There is deliberately no separate
      // `browser` step: one owner, one call. The method still lives on the legacy-named
      // `LangChainAgent` session store, which is why the dynamic import is of that module.
      // It buys no cold-start laziness — the three IPC registrars import it statically, so the
      // build reports INEFFECTIVE_DYNAMIC_IMPORT for it. The import doubles as the "was a
      // browser session ever opened?" test, which is what decides whether the timer could
      // still be armed.
      name: 'browser-agent',
      dispose: async () => {
        const { langChainAgent } = await import('./services/langchain/agent');
        await langChainAgent.cleanupBrowserAgent();
      },
    },
    { name: 'mcp', dispose: () => mcpService.cleanup() },
    {
      // The dynamic import buys no cold-start laziness either — `ipc/chat-handlers.ts` already
      // imports this module statically, so the build reports INEFFECTIVE_DYNAMIC_IMPORT for it too.
      // What it does buy is a cheap exit: the singleton only exists once a desktop task has run, so
      // this import doubles as the check for whether there is anything to release, and
      // `closePiDesktopAgent()` is a no-op otherwise.
      name: 'pi-desktop-agent',
      dispose: async () => {
        const { closePiDesktopAgent } = await import('./services/pi/agent');
        await closePiDesktopAgent();
      },
    },
    {
      // IPC handler cleanup — removes all handlers to prevent memory leaks and ensure
      // no new requests arrive during final teardown. Research shows unregistered IPC listeners
      // are a common Electron memory leak source. This runs late in the sequence because
      // earlier cleanup steps might still need to notify the renderer, and the renderer might
      // still be sending messages until the window is destroyed.
      name: 'ipc-handlers',
      dispose: () => {
        try {
          ipcMain.removeAllListeners();
          log.debug('All IPC handlers removed');
        } catch (error) {
          log.warn('Failed to remove IPC handlers:', error);
        }
      },
    },
    {
      name: 'database',
      dispose: () => {
        // Boot wraps initialisation in try/catch and degrades to a warn, so the manager may simply
        // not exist. That is not a shutdown failure — there is nothing to flush.
        try {
          getDatabaseManager().close();
        } catch {
          log.debug('Database manager was never initialised, nothing to close');
        }
      },
    },
  ];
}

const shutdown = createShutdown();

/**
 * `will-quit` cannot await, so teardown is deferred to `app.exit(0)`: veto the quit once, run the
 * ordered releases, then exit. The veto is unconditional for the same reason the window's `close`
 * veto is — a quit that lands mid-run would end the process with live children. `shutdown.run` is
 * memoised, so a second `will-quit` joins the run in flight instead of disposing twice.
 */
app.on('will-quit', (event) => {
  event.preventDefault();

  void shutdown.run(buildShutdownSteps()).then((outcomes) => {
    for (const outcome of outcomes) {
      if (outcome.status === 'ok') {
        log.info(`Released ${outcome.name} in ${outcome.ms}ms`);
      } else {
        log.warn(`Released ${outcome.name} FAILED (${outcome.status}) after ${outcome.ms}ms:`, outcome.error);
      }
    }
    log.info('Shutdown complete');
    app.exit(0);
  });
});

// Final quit confirmation - fires after will-quit completes and app.exit() is called.
// This is the last chance to log or clean up before the process actually terminates.
// Note: On Windows, this event does NOT fire if the app is closed due to system shutdown/restart
// or user logout (Electron docs). The will-quit handler above is the reliable cleanup path.
app.on('quit', (exitCode) => {
  log.info(`App quitting with exit code ${exitCode}`);
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


