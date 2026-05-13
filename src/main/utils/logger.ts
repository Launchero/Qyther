/**
 * Centralized logging system for the Electron main process.
 *
 * Provides a factory function `createLogger(subsystem)` that returns a typed
 * logger instance scoped to a named subsystem. Each logger respects a global
 * minimum log level and optional per-subsystem overrides read from `process.env`.
 *
 * Log level hierarchy (numeric):
 *   silent(0) > error(1) > warn(2) > info(3) > debug(4)
 *
 * Environment variables:
 *   LOG_LEVEL          — global minimum level (default: 'info' in dev, 'error' in prod)
 *   LOG_APP / LOG_WINDOW / LOG_IPC / … — per-subsystem override ('true' = debug, 'false' = silent)
 */

// ── Level constants ──────────────────────────────────────────────────────────

export enum LogLevel {
  silent = 0,
  error = 1,
  warn = 2,
  info = 3,
  debug = 4,
}

// Map string names (from env) to enum values.
const LEVEL_MAP: Record<string, LogLevel> = {
  silent: LogLevel.silent,
  error: LogLevel.error,
  warn: LogLevel.warn,
  info: LogLevel.info,
  debug: LogLevel.debug,
};

// ── Global configuration ─────────────────────────────────────────────────────

/**
 * Determine the global minimum log level from LOG_LEVEL env var.
 * Falls back to 'info' in development, 'error' in production.
 */
function getGlobalLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && raw in LEVEL_MAP) {
    return LEVEL_MAP[raw];
  }
  // Default based on environment
  const isDev = process.env.ELECTRON_VITE_DEV_MODE === 'true' || process.env.NODE_ENV === 'development';
  return isDev ? LogLevel.info : LogLevel.error;
}

const globalLevel = getGlobalLevel();

/**
 * Subsystem-specific env var names that can override the global level.
 * The keys here match the values passed to `createLogger()` (uppercased with LOG_ prefix).
 */
const SUBSYSTEM_ENV_VARS: Record<string, string> = {
  App: 'LOG_APP',
  Tray: 'LOG_APP',
  Shortcuts: 'LOG_APP',
  Platform: 'LOG_APP',
  Prefs: 'LOG_APP',
  Window: 'LOG_WINDOW',
  WindowMgr: 'LOG_WINDOW',
  IPC: 'LOG_IPC',
  Chat: 'LOG_CHAT',
  BrowserHandlers: 'LOG_BROWSER',
  BrowserAgent: 'LOG_BROWSER',
  BrowserSessionMgr: 'LOG_BROWSER',
  MCP: 'LOG_MCP',
  LangChain: 'LOG_LANGCHAIN',
  Graph: 'LOG_GRAPH',
  ESDownloader: 'LOG_SEARCH',
  ESRunner: 'LOG_SEARCH',
  DocLoader: 'LOG_SEARCH',
  DesktopAgent: 'LOG_DESKTOP',
  DesktopTools: 'LOG_DESKTOP',
  DesktopVerifier: 'LOG_DESKTOP',
  DesktopPlanner: 'LOG_DESKTOP',
  DesktopMemory: 'LOG_DESKTOP',
  DesktopRecovery: 'LOG_DESKTOP',
  DesktopSubgraph: 'LOG_DESKTOP',
  DB: 'LOG_DB',
};

/**
 * Determine the effective log level for a subsystem.
 * - If the env override is 'true', force debug.
 * - If the env override is 'false', force silent.
 * - Otherwise inherit from the global level.
 */
function getSubsystemLevel(subsystem: string): LogLevel {
  const envKey = SUBSYSTEM_ENV_VARS[subsystem];
  if (!envKey) {
    return globalLevel;
  }
  const raw = process.env[envKey]?.trim().toLowerCase();
  if (raw === 'true') return LogLevel.debug;
  if (raw === 'false') return LogLevel.silent;
  return globalLevel;
}

// ── Logger factory ───────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toISOString().split('T')[1].split('.')[0];
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/**
 * Create a logger instance scoped to a named subsystem.
 *
 * ```ts
 * const log = createLogger('IPC');
 * log.info('Handler registered');
 * log.debug('Payload:', payload);
 * ```
 */
export function createLogger(subsystem: string): Logger {
  const level = getSubsystemLevel(subsystem);
  const prefix = `[${subsystem}]`;

  return {
    info(...args: unknown[]) {
      if (level >= LogLevel.info) {
        console.log(`${prefix}`, timestamp(), ...args);
      }
    },
    warn(...args: unknown[]) {
      if (level >= LogLevel.warn) {
        console.warn(`${prefix}`, timestamp(), ...args);
      }
    },
    error(...args: unknown[]) {
      if (level >= LogLevel.error) {
        console.error(`${prefix}`, timestamp(), ...args);
      }
    },
    debug(...args: unknown[]) {
      if (level >= LogLevel.debug) {
        console.log(`${prefix}`, timestamp(), ...args);
      }
    },
  };
}

/**
 * Timing helper that wraps an async operation with debug-level duration logging.
 * Only records when the logger's effective level is >= debug.
 *
 * ```ts
 * const log = createLogger('Graph');
 * await withTiming(log, 'compile', () => compileGraph());
 * ```
 */
export async function withTiming<T>(
  logger: Logger,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.debug(`${label} completed in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    // GraphInterrupt/NodeInterrupt are LangGraph's HITL mechanism, not failures
    const isInterrupt = err instanceof Error &&
      (err.name === 'GraphInterrupt' || err.name === 'NodeInterrupt');
    if (isInterrupt) {
      logger.debug(`${label} interrupted after ${Date.now() - start}ms (HITL pause)`);
    } else {
      logger.debug(`${label} failed after ${Date.now() - start}ms:`, err);
    }
    throw err;
  }
}
