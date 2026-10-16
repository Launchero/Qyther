import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Drives the production settings registrar. Pins the two contracts the settings window depends on:
 * `settings:get` reports the stored snapshot (falling back to the default, not a lie), and
 * `settings:set` persists through `savePreferences`, applies a reduced-motion override to the
 * main-process tween, and pushes the new value to every open webContents so the palette and the
 * settings window never drift.
 */
const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, arg?: unknown) => unknown>(),
  windows: [] as Array<{ webContents: { send: (channel: string, payload: unknown) => void }; isDestroyed: () => boolean }>,
  loadPreferences: vi.fn<() => { settings?: { theme?: string; reducedMotion?: boolean; recentFilesLimit?: number } }>(() => ({})),
  savePreferences: vi.fn(),
  setUserReducedMotion: vi.fn(),
  openSettingsWindow: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, arg?: unknown) => unknown) => {
      hoisted.handlers.set(channel, fn);
    },
  },
  BrowserWindow: {
    getAllWindows: () => hoisted.windows,
  },
}));

vi.mock('../preferences', () => ({
  loadPreferences: hoisted.loadPreferences,
  savePreferences: hoisted.savePreferences,
}));

vi.mock('../utils/platform', () => ({ setUserReducedMotion: hoisted.setUserReducedMotion }));

vi.mock('../settings-window', () => ({ openSettingsWindow: hoisted.openSettingsWindow }));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { registerSettingsHandlers } from './settings-handlers';

function invoke(channel: string, arg?: unknown): unknown {
  const handler = hoisted.handlers.get(channel);
  if (!handler) throw new Error(`channel "${channel}" was never registered`);
  return handler({ sender: { send: vi.fn(), isDestroyed: () => false } }, arg);
}

beforeAll(() => {
  registerSettingsHandlers();
});

describe('settings channels', () => {
  it('registers open/get/set', () => {
    for (const channel of ['settings:open', 'settings:get', 'settings:set']) {
      expect(hoisted.handlers.has(channel), channel).toBe(true);
    }
  });

  it('settings:get reports the stored snapshot, and a default when nothing is stored', () => {
    hoisted.loadPreferences.mockReturnValue({});
    expect(invoke('settings:get')).toEqual({ theme: 'system', reducedMotion: false });

    hoisted.loadPreferences.mockReturnValue({ settings: { theme: 'dark', reducedMotion: true, recentFilesLimit: 8 } });
    expect(invoke('settings:get')).toEqual({ theme: 'dark', reducedMotion: true, recentFilesLimit: 8 });
  });

  it('settings:set persists, applies the reduced-motion override, and pushes to every window', () => {
    hoisted.loadPreferences.mockReturnValue({});
    hoisted.windows.length = 0;
    const windowA = { webContents: { send: vi.fn() }, isDestroyed: () => false };
    const windowB = { webContents: { send: vi.fn() }, isDestroyed: () => false };
    hoisted.windows.push(windowA, windowB);

    const result = invoke('settings:set', { reducedMotion: true }) as { theme: string; reducedMotion: boolean };
    expect(result).toEqual({ theme: 'system', reducedMotion: true });
    expect(hoisted.savePreferences).toHaveBeenCalledWith({ settings: { theme: 'system', reducedMotion: true } });
    expect(hoisted.setUserReducedMotion).toHaveBeenCalledWith(true);
    for (const win of [windowA, windowB]) {
      expect(win.webContents.send).toHaveBeenCalledWith('settings:changed', result);
    }
  });

  it('settings:set does not touch the animation flag for a theme-only change', () => {
    hoisted.loadPreferences.mockReturnValue({});
    hoisted.setUserReducedMotion.mockClear();
    invoke('settings:set', { theme: 'dark' });
    expect(hoisted.setUserReducedMotion).not.toHaveBeenCalled();
  });

  it('settings:open opens the settings window', () => {
    invoke('settings:open');
    expect(hoisted.openSettingsWindow).toHaveBeenCalled();
  });
});
