/**
 * Centralized debug logging utility for the renderer process.
 *
 * Respects the VITE_LOG_LEVEL environment variable to gate output.
 * Log level hierarchy: silent(0) > error(1) > warn(2) > info(3) > debug(4)
 */

enum LogLevel {
  silent = 0,
  error = 1,
  warn = 2,
  info = 3,
  debug = 4,
}

function getRendererLogLevel(): LogLevel {
  const raw = import.meta.env.VITE_LOG_LEVEL?.trim().toLowerCase();
  const map: Record<string, LogLevel> = {
    silent: LogLevel.silent,
    error: LogLevel.error,
    warn: LogLevel.warn,
    info: LogLevel.info,
    debug: LogLevel.debug,
  };
  if (raw && raw in map) return map[raw];
  return import.meta.env.DEV ? LogLevel.info : LogLevel.error;
}

const rendererLevel = getRendererLogLevel();

interface LogData {
  location?: string;
  message?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

function shouldLog(level: LogLevel): boolean {
  return level <= rendererLevel;
}

/**
 * Log error (always visible unless silent)
 */
export function logError(message: string, ...args: unknown[]): void {
  if (shouldLog(LogLevel.error)) {
    console.error(message, ...args);
  }
}

/**
 * Log warning (visible when level >= warn)
 */
export function logWarn(message: string, ...args: unknown[]): void {
  if (shouldLog(LogLevel.warn)) {
    console.warn(message, ...args);
  }
}

/**
 * Log info (visible when level >= info)
 */
export function logInfo(message: string, ...args: unknown[]): void {
  if (shouldLog(LogLevel.info)) {
    console.log(message, ...args);
  }
}

/**
 * Log debug (visible when level >= debug or VITE_DEBUG_SEARCH=true)
 */
export function logDebug(message: string, ...args: unknown[]): void {
  const debugSearchEnabled = import.meta.env.VITE_DEBUG_SEARCH === 'true';
  if (shouldLog(LogLevel.debug) || debugSearchEnabled) {
    console.debug(message, ...args);
  }
}

/**
 * Legacy: Log debug information to main process via IPC.
 * Respects the current VITE_LOG_LEVEL.
 */
export function debugLog(context: string, data: LogData = {}) {
  if (!shouldLog(LogLevel.debug)) return;
  window.electronAPI?.debug?.log(`[${context}]`, data).catch(console.error);
}

/**
 * Measure performance of async operations.
 * Only logs when debug level is enabled.
 */
export async function measurePerformance<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    if (shouldLog(LogLevel.debug)) {
      const duration = performance.now() - start;
      debugLog('performance', { label, duration });
    }
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    debugLog('performance', { label, duration, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

/**
 * Log window mode changes.
 */
export function logWindowMode(
  mode: string,
  viewportSize?: string,
  electronWindow?: string
) {
  if (!shouldLog(LogLevel.info)) return;
  const logData: any = { mode };

  if (viewportSize) {
    logData.viewportSize = viewportSize;
  }

  if (electronWindow) {
    logData.electronWindow = electronWindow;
  }

  debugLog('CommandPalette', logData);
}

/**
 * Log component measurements.
 */
export function logComponentSizes(
  measurements: Record<string, string>
) {
  if (!shouldLog(LogLevel.debug)) return;
  debugLog('CommandPalette', measurements);
}
