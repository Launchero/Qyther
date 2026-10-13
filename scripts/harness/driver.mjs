/**
 * The harness verbs. This is the only file that decides between OS input and CDP
 * observation, so it is also the only place the "real user" claim can be checked.
 *
 * Rule: anything that changes app state goes through `native.mjs` (`SendInput`,
 * `SetCursorPos`) — never `Runtime.evaluate`, never `window.electronAPI`. CDP is used
 * to read DOM ground truth and to grab the palette's own pixels.
 *
 * Deliberately absent: `evaluate`, `launch`, `quit`, `close_window`, `ipc_invoke`,
 * `navigate`. A hidden palette quits the app if it is closed (`src/main/windows.ts`
 * only preventDefaults the close while visible, and `src/main/main.ts` quits on
 * `window-all-closed`), so no verb here can close anything.
 */
import { mkdir, writeFile, readdir, stat, unlink, statfs } from 'fs/promises';
import { join, resolve } from 'path';
import { PNG } from 'pngjs';
import * as os from './native.mjs';
import * as cdp from './cdp.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const TMP_DIR = join(REPO_ROOT, 'tmp', 'harness');
const WINDOW_TITLE = 'Qyther';
const WINDOW_CLASS = 'Chrome_WidgetWin_1';

/** Constants, not flags: no unrequested configurability (root AGENTS.md). */
const MAX_FRAMES = 40;
const MAX_FRAME_BYTES = 150 * 1024 * 1024;
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;
/** Above the app's 300 ms toggle debounce (`src/main/shortcuts.ts`), so a re-tap is never eaten. */
const HOTKEY_FLOOR_MS = 400;
const SCALE_TOLERANCE = 0.02;

/** Measured CSS heights per mode; `MODE_CONFIGS` in `src/main/windowManager.ts` is the DIP source. */
const MODE_HEIGHTS = { compact: 103, expanded: 603 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let session = null;
let lastHotkeyAt = 0;

function findPalettes() {
  return os.listWindows().filter((w) => w.title === WINDOW_TITLE && w.className === WINDOW_CLASS);
}

/**
 * The palette is identified by class + the pid that owns the CDP port, NOT by its
 * window title. Measured here: the HWND is created with `title: ''` (`src/main/windows.ts`)
 * and only picks up `Qyther` once the renderer's `<title>` propagates, so a title-only
 * filter silently misses the window for the first seconds of every launch.
 */
function findPaletteForPid(pid, windows) {
  const ofPid = (windows ?? os.listWindows()).filter((w) => w.className === WINDOW_CLASS && w.pid === pid && w.rect);
  return ofPid.find((w) => w.title === WINDOW_TITLE) ?? ofPid.find((w) => !w.title) ?? null;
}

async function freeBytesOnArtifactDrive() {
  try {
    const s = await statfs(REPO_ROOT);
    return Number(s.bsize) * Number(s.bavail);
  } catch {
    return Number.POSITIVE_INFINITY; // unverifiable space must not block a run
  }
}

/**
 * The gate that can say no. Two Qyther instances can share a title while only one
 * owns the CDP endpoint, and `WH_KEYBOARD_LL` hooks chain globally — so Alt+Space may
 * toggle a different process than the one being read. That produces confident lies,
 * which is why every verb starts here.
 */
export async function preflight() {
  const problems = [];
  const awareness = os.makePerMonitorAware();
  if (!awareness.ok) problems.push('this process is not DPI-aware; coordinates would be virtualized');

  const all = os.listWindows();
  let endpoint = null; let port = null; let portPid = null; let conn = null; let domState = null; let scale = null;
  try {
    ({ endpoint, port } = await cdp.resolveEndpoint());
    portPid = await cdp.portOwnerPid(port);
  } catch (e) {
    problems.push(e.message);
  }
  if (!portPid) problems.push(`cannot attribute port ${port ?? '?'} to a pid — refusing rather than drive one app and read another`);

  const palette = portPid ? findPaletteForPid(portPid, all) : findPalettes()[0] ?? null;
  if (!palette) {
    problems.push(portPid
      ? `no ${WINDOW_CLASS} window belongs to pid ${portPid} — the app may still be starting, or CDP is owned by a helper`
      : `no window of class ${WINDOW_CLASS} at all — is the app running?`);
  }

  const rivalPids = [...new Set(all.filter((w) => w.className === WINDOW_CLASS && (w.title === WINDOW_TITLE || w.pid === portPid)).map((w) => w.pid))];
  if (rivalPids.length > 1) {
    problems.push(`${rivalPids.length} processes own a ${WINDOW_CLASS} palette: ${rivalPids
      .map((p) => `${p}(${all.filter((w) => w.pid === p && w.className === WINDOW_CLASS).map((w) => `${w.rect?.width}x${w.rect?.height}${w.visible ? '+shown' : '+hidden'}`).join(',')})`)
      .join(' | ')} — Alt+Space goes to whichever low-level hook registered first, not necessarily the one under test`);
  }

  try {
    conn = await cdp.connect({ endpoint });
    domState = await conn.read('state');
    conn.installRecorder();
  } catch (e) {
    problems.push(e.message);
  }
  if (palette?.rect && domState) {
    scale = palette.rect.width / domState.width;
    if (Math.abs(scale - domState.dpr) > SCALE_TOLERANCE) {
      problems.push(`scale drift: window ${palette.rect.width}px / innerWidth ${domState.width}px = ${scale.toFixed(3)}, but devicePixelRatio is ${domState.dpr} (mixed DPI or a non-aware helper process)`);
    }
  }

  const free = await freeBytesOnArtifactDrive();
  if (free < MIN_FREE_BYTES) problems.push(`only ${(free / 1024 ** 3).toFixed(2)} GB free on the artifact drive; needs ≥ ${(MIN_FREE_BYTES / 1024 ** 3).toFixed(0)} GB`);

  const info = {
    ok: problems.length === 0,
    problems,
    pid: portPid ?? palette?.pid ?? null,
    hwnd: palette?.hwnd ?? null,
    windowVisible: palette?.visible ?? null,
    windowRect: palette?.rect ?? null,
    windowDpi: palette?.dpi ?? null,
    mode: domState?.url?.startsWith('http') ? 'dev' : domState ? 'packaged' : null,
    endpoint, port, portPid,
    scale, dpr: domState?.dpr ?? null,
    dom: domState ? { hidden: domState.hidden, width: domState.width, height: domState.height, theme: domState.theme, title: domState.title } : null,
    freeBytes: free,
    virtualScreen: os.virtualScreen(),
  };
  if (info.ok) session = { ...info, conn, palette };
  else conn?.close();
  return info;
}

async function need() {
  if (!session) {
    const info = await preflight();
    if (!info.ok) throw new Error(`preflight refused:\n- ${info.problems.join('\n- ')}`);
  }
  return session;
}

/** `GetWindowRect` changes when the window resizes, so never trust the boot snapshot. */
function syncWindow(s) {
  const fresh = findPaletteForPid(s.pid, os.listWindows());
  if (fresh) s.palette = fresh;
  return s.palette;
}

function paletteHasFocus(s) {
  const fg = os.getForegroundWindow();
  return !!fg && fg.pid === s.pid;
}

/**
 * OS keystrokes go to the FOREGROUND window. Measured here: pressing VK_ESCAPE while
 * another app held focus did nothing to Qyther at all — the palette is frameless and
 * `skipTaskbar`, so it is not even alt-tab-reachable. A real user clicks it or opens it
 * with Alt+Space, so that is exactly what this does: no `SetForegroundWindow`.
 */
async function ensureFocused(s) {
  if (paletteHasFocus(s)) return { focused: true, how: 'already' };
  const rect = syncWindow(s).rect;
  const target = await cssToScreen('#search-input').catch(() => null);
  const point = target?.point ?? { x: rect.left + Math.round(rect.width / 2), y: rect.top + Math.round(rect.height / 2) };
  await os.clickAt(point.x, point.y);
  await sleep(80);
  return { focused: paletteHasFocus(s), how: 'real click', point };
}

export async function who() {
  const s = await need();
  return {
    pid: s.pid, mode: s.mode, endpoint: s.endpoint, port: s.port, portPid: s.portPid,
    windowRect: s.windowRect, windowDpi: s.windowDpi, scale: s.scale, dpr: s.dpr,
    target: s.conn.target, virtualScreen: s.virtualScreen,
  };
}

export async function readState(name = 'state') {
  const s = await need();
  return s.conn.read(name);
}

export async function listWindows() {
  os.makePerMonitorAware();
  return os.listWindows()
    .filter((w) => w.title || w.visible)
    .map(({ hwnd, ...w }) => w);
}

/** CSS-px element centre → physical screen point, through the measured scale. */
async function cssToScreen(selector) {
  const s = await need();
  const rect = syncWindow(s).rect;
  const live = await s.conn.read('state');
  const scale = rect.width / live.width;
  const box = await s.conn.rectOf(selector);
  if (!box) throw new Error(`no element matches "${selector}"`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {
    point: { x: Math.round(rect.left + cx * scale), y: Math.round(rect.top + cy * scale) },
    rect: box, cssCentre: { x: cx, y: cy }, scale,
  };
}

async function tapHotkey(combo) {
  const since = Date.now() - lastHotkeyAt;
  if (since < HOTKEY_FLOOR_MS) await sleep(HOTKEY_FLOOR_MS - since);
  lastHotkeyAt = Date.now();
  await os.pressCombo(combo);
}

/**
 * State-driven, never a blind toggle: Alt+Space is a toggle, so sending it when the
 * palette is already up hides it. `src/main/shortcuts.ts` blocks the combo for every
 * other app, and the hook only fires if Alt is genuinely held (`GetAsyncKeyState`).
 */
export async function reveal() {
  const s = await need();
  const pal = syncWindow(s);
  const before = pal.visible ? 'visible' : 'hidden';
  if (pal.visible) return { revealed: false, before, note: 'already visible; no key sent' };
  await tapHotkey({ modifiers: ['alt'], key: 'space' });
  const seen = await cdp.waitOn(s.conn, 'state', (v) => !v.hidden, { timeoutMs: 4000 });
  return { revealed: seen.ok, before, altHeldDuringInject: os.isKeyDown('alt'), state: seen.value };
}

export async function hide() {
  const s = await need();
  if (!syncWindow(s).visible) return { hidden: true, note: 'already hidden' };
  const focus = await ensureFocused(s);
  if (!focus.focused) return { hidden: false, focus, note: 'palette never took focus; Escape would go elsewhere' };
  await os.pressKey('escape');
  const seen = await cdp.waitOn(s.conn, 'state', (v) => v.hidden, { timeoutMs: 4000 });
  return { hidden: seen.ok, via: 'real VK_ESCAPE → useKeyboard.ts → window:hide', focus };
}

/**
 * Clear the query with real keys (Ctrl+A, then Delete). Needed because a live result
 * list auto-grows the window and fights a mode change — the same reason
 * `capture-ui.mjs` empties the input before setting a mode.
 */
export async function clearInput() {
  const s = await need();
  const before = (await s.conn.read('state')).inputValue;
  if (!before) return { cleared: true, before: '', how: 'nothing to clear' };
  await ensureFocused(s);
  await os.pressCombo({ modifiers: ['ctrl'], key: 'a' });
  await os.pressKey('delete');
  const done = await cdp.waitOn(s.conn, 'state', (v) => v.inputValue === '', { timeoutMs: 3000 });
  return { cleared: done.ok, before, after: done.value?.inputValue };
}

export async function clickAt(x, y, { button = 'left', anywhere = false } = {}) {
  const s = await need();
  if (!anywhere) {
    const rect = syncWindow(s).rect;
    const inside = x >= rect.left && x < rect.left + rect.width
      && y >= rect.top && y < rect.top + rect.height;
    if (!inside) throw new Error(`(${x}, ${y}) is outside the palette rect ${JSON.stringify(rect)} — pass anywhere only when you mean to click another app`);
  }
  await os.clickAt(x, y, { button });
  return { clicked: { x, y, button }, cursor: os.getCursorPosition() };
}

/** Real cursor move + `SendInput` click. Never `el.click()`. */
export async function clickElement(selector) {
  const s = await need();
  const { point, rect, cssCentre } = await cssToScreen(selector);
  await os.clickAt(point.x, point.y);
  const after = await s.conn.read('state');
  return { selector, rect, cssCentre, point, cursor: os.getCursorPosition(), focused: after.activeElementId };
}

export async function typeText(text) {
  const s = await need();
  const focus = await ensureFocused(s);
  await os.typeText(String(text));
  const after = await s.conn.read('state');
  return { typed: text, inputValue: after.inputValue, focused: after.activeElementId, focus };
}

export async function pressKey(name) {
  const s = await need();
  const focus = await ensureFocused(s);
  await os.pressKey(name);
  return { key: name, focus, state: await s.conn.read('state') };
}

export async function scrollAt(x, y, amount = -3) {
  await need();
  await os.scrollAt(x, y, amount);
  return { scrolled: { x, y, amount } };
}

export async function dragBetween(from, to) {
  await need();
  await os.drag(from, to);
  return { dragged: { from, to } };
}

/** Real Alt+Shift+M, the app's own cross-platform mode shortcut — not `window:setMode`. */
export async function setMode(mode) {
  const s = await need();
  const want = MODE_HEIGHTS[mode];
  if (!want) throw new Error(`unknown mode "${mode}" — expected ${Object.keys(MODE_HEIGHTS).join(' or ')}`);
  const from = (await s.conn.read('state')).height;
  for (let attempt = 0; attempt < 2; attempt++) {
    await tapHotkey({ modifiers: ['alt', 'shift'], key: 'm' });
    const settled = await cdp.waitOn(s.conn, 'state', (v) => Math.abs(v.height - want) <= 6, { timeoutMs: 3000 });
    if (settled.ok) return { mode, from, to: settled.value.height, attempts: attempt + 1 };
  }
  return { mode, from, to: (await s.conn.read('state')).height, attempts: 2, note: `did not settle at ${want}px — the hotkey may not accept injected input` };
}

async function capture({ scope = 'palette' } = {}) {
  const s = await need();
  if (scope === 'desktop') {
    const frame = os.captureScreenRect(syncWindow(s).rect);
    return { scope, source: 'gdi-bitblt', width: frame.width, height: frame.height, png: encodePng(frame) };
  }
  if (scope !== 'palette') throw new Error(`unknown scope "${scope}" — palette or desktop`);
  const st = await s.conn.read('state');
  // Measured: Page.captureScreenshot never returns against a hidden window — it hangs
  // to the 20 s timeout. Refuse fast instead of pretending the frame is empty.
  if (st.hidden) return { refused: 'hidden', hint: 'call reveal — a hidden window renders no frames', state: st };
  return { scope, source: 'cdp-page-capture', png: await s.conn.capturePalette() };
}

/**
 * `palette` = the app's own pixels via CDP (true alpha, exact resolution, blind to
 * z-order). `desktop` = a GDI grab of the real composited region (true occlusion).
 * Reporting only one hides occlusion bugs, so a run captures both and compares.
 */
export async function screenshot({ scope = 'palette', inline = false } = {}) {
  const shot = await capture({ scope });
  if (shot.refused) return shot;
  const out = { scope: shot.scope, source: shot.source, bytes: shot.png.length };
  if (inline) out.base64 = shot.png.toString('base64');
  return out;
}

function encodePng({ width, height, rgba }) {
  const png = new PNG({ width, height });
  rgba.copy(png.data);
  return PNG.sync.write(png);
}

function framePath(id) {
  return join(TMP_DIR, `${String(id).replace(/[^\w.-]/g, '_')}.png`);
}

async function pruneFrames() {
  const entries = await readdir(TMP_DIR);
  const pngs = entries.filter((e) => e.endsWith('.png'));
  const withTime = await Promise.all(pngs.map(async (name) => {
    const p = join(TMP_DIR, name);
    return { p, size: (await stat(p)).size, mtime: (await stat(p)).mtimeMs };
  }));
  withTime.sort((a, b) => b.mtime - a.mtime);
  let total = 0;
  for (const [i, f] of withTime.entries()) {
    total += f.size;
    if (i >= MAX_FRAMES || total > MAX_FRAME_BYTES) await unlink(f.p).catch(() => {});
  }
}

/**
 * Writes a frame only if the privacy gate passes. Everything indexes every drive, so a
 * captured result list leaks personal paths (measured: an ordinary word query returned
 * dozens of rows, most of them under the user profile or `C:\Windows\WinSxS`).
 */
export async function saveFrame(id, { scope = 'palette' } = {}) {
  const shot = await capture({ scope });
  if (shot.refused) return shot;
  const st = await readState('state');
  const foreign = (st.rows ?? []).filter((r) => !r.includes(REPO_ROOT));
  if (foreign.length) {
    return { refused: 'privacy-gate', leaked: foreign.length, total: st.rows.length, samples: foreign.slice(0, 3) };
  }
  const decoded = PNG.sync.read(shot.png);
  await mkdir(TMP_DIR, { recursive: true });
  const path = framePath(id);
  await writeFile(path, shot.png);
  await pruneFrames();
  return { saved: path, bytes: shot.png.length, width: decoded.width, height: decoded.height, scope, source: shot.source, rows: st.rows.length };
}

/** Closed condition vocabulary; the caller picks a kind, never an expression. */
export async function waitFor(cond, { timeoutMs = 9000 } = {}) {
  const s = await need();
  const checks = {
    visible: (v) => !v.hidden,
    hidden: (v) => v.hidden,
    hasRows: (v) => v.rows.length > 0,
    settled: (v) => !v.searching,
    focused: (v) => v.activeElementId === cond.id,
    value: (v) => v.inputValue === cond.value,
    mode: (v) => Math.abs(v.height - MODE_HEIGHTS[cond.mode]) <= 6,
  };
  if (cond.kind === 'event') {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const events = await s.conn.drainRecorder();
      const hit = events.find((e) => e.event === `electron-window-${cond.name}`);
      if (hit) return { ok: true, hit, events };
      if (Date.now() > deadline) return { ok: false, events };
      await sleep(150);
    }
  }
  const predicate = checks[cond.kind];
  if (!predicate) throw new Error(`unknown condition "${cond.kind}" — allowed: ${Object.keys(checks).concat('event').join(', ')}`);
  const r = await cdp.waitOn(s.conn, 'state', predicate, { timeoutMs });
  return { ok: r.ok, value: r.value };
}

/**
 * Interactive elements with their CSS rects, so a driver can pick a target without
 * guessing selectors. This stands in for the accessibility tree: CDP
 * `Accessibility.getFullAXTree` returns 0 nodes against this app, and the OS UIA path
 * cannot load at all in this checkout (`node-winautomation` has no built addon).
 */
export async function axSnapshot({ limit = 40 } = {}) {
  const s = await need();
  const expr = `(() => {
    const sel = '[role],[id],button,input,a[href],[aria-label],[tabindex]:not([tabindex="-1"])';
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.push({
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        name: (el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        id: el.id || null,
        disabled: !!el.disabled,
        rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      });
      if (out.length >= ${Math.trunc(Number(limit) || 40)}) break;
    }
    return JSON.stringify(out);
  })()`;
  const r = await s.conn.cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
  return JSON.parse(r.result.value);
}

export async function closeSession() {
  session?.conn?.close();
  session = null;
}

export const TMP = TMP_DIR;
export const REPO = REPO_ROOT;
