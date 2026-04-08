/**
 * Centralized debug logging utility for Command Palette
 * 
 * Purpose: Consolidate logging for easier removal later
 * All data points currently logged are preserved
 */

interface LogData {
  location?: string;
  message?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

/**
 * Log debug information to main process
 */
export function debugLog(context: string, data: LogData = {}) {
  window.electronAPI?.debug?.log(`[${context}]`, data).catch(console.error);
}

/**
 * Measure performance of async operations
 */
export async function measurePerformance<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    debugLog('performance', { label, duration });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    debugLog('performance', { label, duration, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

/**
 * Log window mode changes
 */
export function logWindowMode(
  mode: string,
  viewportSize?: string,
  electronWindow?: string
) {
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
 * Log component measurements
 */
export function logComponentSizes(
  measurements: Record<string, string>
) {
  debugLog('CommandPalette', measurements);
}
