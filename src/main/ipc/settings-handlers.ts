import { ipcMain, BrowserWindow } from 'electron';
import { loadPreferences, savePreferences } from '../preferences';
import { createLogger } from '../utils/logger';
import { setUserReducedMotion } from '../utils/platform';
import { openSettingsWindow } from '../settings-window';
import type { SettingsSnapshot, SettingsPatch } from '../../shared/ipc/settings';

const log = createLogger('Settings');

// Main is the source of truth for appearance. `system` is the default (follow the OS colour scheme),
// which is the 2026 norm and means a fresh install with no stored value never forces light-on-dark.
export const DEFAULT_SETTINGS: SettingsSnapshot = {
  theme: 'system',
  reducedMotion: false,
};

function currentSettings(): SettingsSnapshot {
  const stored = loadPreferences().settings;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Push the new snapshot to every open webContents so the palette and settings windows stay in step. */
function publishSettings(snapshot: SettingsSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('settings:changed', snapshot);
    }
  }
}

export function registerSettingsHandlers(): void {
  // The OS animation read resolves fire-and-forget after the window is created, so a stored
  // reduced-motion override must be applied the moment the registrar runs — before the first height
  // tween can read `prefersWindowAnimation()`.
  setUserReducedMotion(currentSettings().reducedMotion);

  ipcMain.handle('settings:open', () => {
    openSettingsWindow();
    return { success: true };
  });

  ipcMain.handle('settings:get', (): SettingsSnapshot => {
    return currentSettings();
  });

  ipcMain.handle('settings:set', (_event, patch: SettingsPatch): SettingsSnapshot => {
    const next: SettingsSnapshot = { ...currentSettings(), ...patch };
    savePreferences({ settings: next });
    if (patch.reducedMotion !== undefined) {
      setUserReducedMotion(next.reducedMotion);
    }
    log.debug('Settings updated:', next);
    publishSettings(next);
    return next;
  });
}
