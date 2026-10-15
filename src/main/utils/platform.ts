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

// `SPI_GETCLIENTAREAANIMATION` is the Win32 form of the "Show animations in Windows"
// accessibility setting — the same request `prefers-reduced-motion` carries to the renderer.
const SPI_GETCLIENTAREAANIMATION = 0x1042;

/** Tri-state: null until `initializeAnimationPreference()` has resolved. */
let clientAreaAnimation: boolean | null = null;

/**
 * Read the OS animation preference once, off the first-paint path.
 *
 * `koffi` is a dynamic import, so the height tween in `windowManager` cannot probe it inline;
 * it reads the cached answer from `prefersWindowAnimation()` instead. Fail-open by design — a
 * palette that never resizes is a worse outcome than one that animates against a setting we
 * could not read.
 */
export async function initializeAnimationPreference(): Promise<void> {
  if (!isWindows()) {
    clientAreaAnimation = true;
    return;
  }

  try {
    const koffiModule = await import('koffi');
    const koffi = koffiModule.default || koffiModule;
    const user32 = koffi.load('user32.dll');
    const SystemParametersInfoW = user32.func('__stdcall', 'SystemParametersInfoW', 'bool', [
      'uint',   // uiAction
      'uint',   // uiParam
      'void *', // pvParam — must be a real pointer, SPI rejects NULL for this action
      'uint',   // fWinIni
    ]);

    const result = koffi.alloc('int32', 1);
    const ok = SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, result, 0);
    clientAreaAnimation = ok ? koffi.decode(result, 'int32') !== 0 : true;
    log.debug('Client area animation enabled:', clientAreaAnimation);
  } catch (error) {
    log.warn('Could not read the OS animation preference; animating by default.', error);
    clientAreaAnimation = true;
  }
}

/** Whether main-process UI motion should run. Defaults to enabled until the read resolves. */
export function prefersWindowAnimation(): boolean {
  return clientAreaAnimation ?? true;
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
