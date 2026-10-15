import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Failure honesty on the window and dialog channels, driven through the production registrar.
 *
 * Three specific lies are pinned here. `window:getMode` and `window:toggleMode` answered a thrown
 * error with the string `'compact'`, which the renderer then laid out against — an ordinary read
 * could report a compact palette while the real bounds were expanded, and nothing downstream could
 * tell the lie from a fact. `dialog:openFile`/`dialog:openFolder` answered an exception with
 * `{ cancelled: true }`, so a caller could not distinguish "the user chose nothing" from "the
 * dialog broke". `handlers.test.ts` cannot see any of this because it imports nothing from
 * production; these tests import `registerIPCHandlers` and call what it actually registered.
 */
const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, arg?: unknown) => unknown>(),
  getWindowMode: vi.fn<() => string>(),
  toggleWindowMode: vi.fn<() => string>(),
  setWindowMode: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, arg?: unknown) => unknown) => {
      hoisted.handlers.set(channel, fn);
    },
    on: vi.fn(),
  },
  app: { getPath: () => '/tmp', getAppPath: () => '/tmp', getVersion: () => '0.0.0' },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), openExternal: vi.fn() },
  dialog: { showOpenDialog: hoisted.showOpenDialog },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../windows', () => ({
  hideMainWindow: vi.fn(),
  setWindowMode: hoisted.setWindowMode,
  getWindowMode: hoisted.getWindowMode,
  toggleWindowMode: hoisted.toggleWindowMode,
  getMainWindow: () => ({ id: 1 }),
}));

vi.mock('../windowManager', () => ({
  windowManager: {
    getCurrentMode: () => 'compact',
    clampExpandedHeight: (h: number) => h,
    setMode: vi.fn(),
    toggleMode: vi.fn(),
    onAnimationFrame: vi.fn(),
    applyModeConstraints: vi.fn(),
  },
}));

vi.mock('../utils/esRunner', () => ({
  searchFiles: async () => [],
  formatFileSize: (n: number) => String(n),
  formatDate: (d: Date) => String(d),
  isEverythingRunning: () => false,
}));

vi.mock('../utils/platform', () => ({
  getSystemInfo: () => ({}),
  getPlatform: () => 'win32',
  getPlatformName: () => 'Windows',
  isWindows: () => true,
  isMacOS: () => false,
  isLinux: () => false,
  prefersWindowAnimation: () => true,
}));

vi.mock('./chat-handlers', () => ({ registerChatHandlers: vi.fn() }));
vi.mock('./mcp-handlers', () => ({ registerMCPHandlers: vi.fn() }));

import { registerIPCHandlers } from './handlers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call(channel: string, arg?: unknown): any {
  const handler = hoisted.handlers.get(channel);
  if (!handler) throw new Error(`channel "${channel}" was never registered`);
  return handler({ sender: { send: vi.fn(), isDestroyed: () => false } }, arg);
}

beforeAll(() => {
  registerIPCHandlers();
});

describe('window mode reads fail honestly', () => {
  it('registers the channels this test needs', () => {
    for (const channel of ['window:getMode', 'window:toggleMode', 'window:setMode', 'dialog:openFile', 'dialog:openFolder']) {
      expect(hoisted.handlers.has(channel), channel).toBe(true);
    }
  });

  it('rejects instead of answering `compact` when the mode read throws', () => {
    hoisted.getWindowMode.mockImplementation(() => {
      throw new Error('window gone');
    });
    // The handler is synchronous; `ipcMain.handle` turns this throw into a rejected invoke, which
    // is what the renderer's `await window.electronAPI.window.getMode()` sees. Asserting on the
    // call itself is the honest shape — `rejects` would be asserting on a promise that does not exist.
    expect(() => call('window:getMode')).toThrow('window gone');
  });

  it('returns the real mode when nothing throws', () => {
    hoisted.getWindowMode.mockReturnValue('expanded');
    expect(call('window:getMode')).toBe('expanded');
  });

  it('rejects instead of answering `compact` when the toggle throws', () => {
    hoisted.toggleWindowMode.mockImplementation(() => {
      throw new Error('toggle failed');
    });
    expect(() => call('window:toggleMode')).toThrow('toggle failed');
  });

  it('still re-throws a failed setMode, which is the idiom the other two joined', () => {
    hoisted.setWindowMode.mockImplementation(() => {
      throw new Error('set failed');
    });
    expect(() => call('window:setMode', 'expanded')).toThrow('set failed');
  });
});

describe('dialog cancel is not an error', () => {
  it('reports a dismissed file dialog as a cancel with no error', async () => {
    hoisted.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await call('dialog:openFile', {});
    expect(result).toEqual({ cancelled: true });
    expect(result.error).toBeUndefined();
  });

  it('reports a thrown file dialog as an error, not as a cancel', async () => {
    hoisted.showOpenDialog.mockRejectedValue(new Error('no display'));
    const result = await call('dialog:openFile', {});
    expect(result.cancelled).toBeUndefined();
    expect(result.error).toBe('no display');
  });

  it('keeps the same distinction for the folder picker', async () => {
    hoisted.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await call('dialog:openFolder', {})).toEqual({ cancelled: true });

    hoisted.showOpenDialog.mockRejectedValueOnce(new Error('acl denied'));
    const failed = await call('dialog:openFolder', {});
    expect(failed.cancelled).toBeUndefined();
    expect(failed.error).toBe('acl denied');
  });

  it('returns the chosen path when the dialog succeeds', async () => {
    hoisted.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['D:\\a\\b.txt'] });
    expect(await call('dialog:openFile', {})).toEqual({ path: 'D:\\a\\b.txt' });
  });
});
