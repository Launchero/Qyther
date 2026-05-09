import { app } from 'electron';
import os from 'os';
import { createLogger } from './logger';

const log = createLogger('Platform');

export type Platform = 'win32' | 'darwin' | 'linux' | 'unknown';

export interface SystemInfo {
  platform: Platform;
  platformName: string;
  platformVersion: string;
  arch: string;
  hostname: string;
  release: string;
  totalMemory: string;
  freeMemory: string;
  cpuCount: number;
  cpuModel: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  appVersion: string;
  userDataPath: string;
  currentDate: string;
}

/**
 * Get the current platform
 */
export function getPlatform(): Platform {
  const platform = process.platform;
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform;
  }
  return 'unknown';
}

/**
 * Get human-readable platform name
 */
export function getPlatformName(): string {
  const platform = getPlatform();
  switch (platform) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return 'Unknown';
  }
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return getPlatform() === 'darwin';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Get comprehensive system information
 */
export function getSystemInfo(): SystemInfo {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    platform: getPlatform(),
    platformName: getPlatformName(),
    platformVersion: os.release(),
    arch: process.arch,
    hostname: os.hostname(),
    release: os.release(),
    totalMemory: formatBytes(totalMem),
    freeMemory: formatBytes(freeMem),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'Unknown',
    electronVersion: process.versions.electron || 'Unknown',
    chromeVersion: process.versions.chrome || 'Unknown',
    nodeVersion: process.version,
    appVersion: app.getVersion(),
    userDataPath: app.getPath('userData'),
    currentDate: new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
}

/**
 * Log platform information to console
 */
export function logSystemInfo(): void {
  log.info('Platform:', getPlatformName());
}

/**
 * Get a short platform identifier for logging
 */
export function getPlatformTag(): string {
  const platform = getPlatform();
  switch (platform) {
    case 'win32':
      return '🪟';
    case 'darwin':
      return '🍎';
    case 'linux':
      return '🐧';
    default:
      return '❓';
  }
}
