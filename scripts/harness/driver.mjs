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

/** Measured CSS heights per mode; `MODE_CONFIGS` in `src/main/windowManager.ts` is the DIP source. Live-verified at dpr 1.25: compact asks 72 → realizes 74; expanded asks 600 → 603. */
const MODE_HEIGHTS = { compact: 74, expanded: 603 };

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
    // Unawaited on purpose: the recorder only upgrades `wait` from polling to events.
    // Left unhandled it rejects after its call timeout and kills the CLI with it.
    conn.installRecorder().catch(() => {});
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
  // A dead socket must not be reused. The CLI is safe (one verb per process) but the MCP
  // server is long-lived: after the app restarted, every verb failed with "CDP socket
  // closed" until the server process itself was restarted. Rebuild the session once.
  if (session && !session.conn.isOpen()) session = null;
  if (!session) {
    const info = await preflight();
    if (!info.ok) throw new Error(`preflight refused:\n- ${info.problems.join('\n- ')}`);
  }
  return session;
}

/**
 * Argument checks live here, not only in the MCP handlers: the CLI reaches these verbs
 * directly, so validating at the layer both surfaces cross is what makes a non-finite
 * coordinate impossible to turn into a dead `SendInput`.
 */
function requireNumber(value, what) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${what} must be a finite number, got ${JSON.stringify(value)}`);
  return n;
}

/** `GetWindowRect` changes when the window resizes, so never trust the boot snapshot. */
function syncWindow(s) {
  const fresh = findPaletteForPid(s.pid, os.listWindows());
  if (fresh) s.palette = fresh;
  if (!s.palette) {
    // Previously this returned null and every caller dereferenced it, so a vanished
    // window surfaced as `Cannot read properties of null (reading 'rect')` — which says
    // nothing about what happened. Name it: the app is gone, or its window class changed.
    throw new Error(
      `the palette window for pid ${s.pid} no longer exists — it was closed, the app exited, `
      + `or the window class changed. Re-run preflight.`,
    );
  }
  return s.palette;
}

/**
 * Is the PALETTE the foreground window — not merely some window of the app's process?
 *
 * Comparing pids was wrong and the mistake was invisible: `npm run dev` opens DevTools detached
 * (`src/main/windows.ts`), DevTools belongs to the same pid, and it can hold the foreground. Every
 * OS keystroke then went to DevTools while the harness believed the palette was focused — measured
 * as three VK_ESCAPE presses that hid nothing, `focused: {how:'already'}`, and a palette whose
 * `document.activeElement` was still a button. The handle comparison makes that state report as
 * unfocused, which is when `ensureFocused` clicks the palette's own input and activates it for real.
 */
function paletteHasFocus(s) {
  const fg = os.getForegroundWindow();
  if (!fg) return false;
  // Handles are koffi pointers, which `JSON.stringify` refuses (`Do not know how to serialize a
  // BigInt`) and which do not compare equal across call sites by identity, so compare their
  // decimal/hex text and never let a raw pointer into a returned object.
  const hwnd = s.palette?.hwnd ?? null;
  if (hwnd) return String(fg.hwnd) === String(hwnd);
  return fg.pid === s.pid;
}

/** What actually holds the keyboard, so a refusal is diagnosable from the transcript alone. */
function foregroundInfo() {
  const fg = os.getForegroundWindow();
  if (!fg) return null;
  return { hwnd: String(fg.hwnd), pid: fg.pid, title: (fg.title || '').slice(0, 60) };
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
  return { focused: paletteHasFocus(s), how: 'real click', point, foreground: foregroundInfo() };
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

/**
 * CSS-px rect → physical screen point, through the scale measured right now.
 *
 * Scale is re-derived per call from `GetWindowRect.width / innerWidth` rather than
 * trusted from the session, because the window resizes between verbs — the tween alone
 * changes it by 500 px — and a cached scale is a click in the wrong place.
 */
function cssCentreToScreen(s, box, innerWidth) {
  const win = syncWindow(s).rect;
  // A hidden or mid-teardown window can report `innerWidth` 0, which made the scale NaN
  // and produced a click point of NaN rather than a diagnosable refusal.
  if (!Number.isFinite(innerWidth) || innerWidth <= 0) {
    throw new Error(`the palette reported innerWidth ${innerWidth} — cannot map CSS to screen pixels`);
  }
  const scale = win.width / innerWidth;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {
    point: { x: Math.round(win.left + cx * scale), y: Math.round(win.top + cy * scale) },
    scale, cssCentre: { x: cx, y: cy },
  };
}

/** CSS-px element centre → physical screen point, through the measured scale. */
async function cssToScreen(selector) {
  const s = await need();
  const live = await s.conn.read('state');
  const box = await s.conn.rectOf(selector);
  if (!box) throw new Error(`no element matches "${selector}"`);
  return { rect: box, ...cssCentreToScreen(s, box, live.width) };
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
  /**
   * Escape is graded (`useKeyboard.ts:249-264`): a mounted dialog takes the first press, a
   * non-empty query takes the next, and only then does the palette hide. A single press was
   * therefore read as "the app ignores Escape" whenever a previous run left text in the field —
   * measured: 3 presses on a stale expanded palette with a query, versus 2 presses from a known
   * state. Clear to a defined state first, then allow three presses so a stranded
   * `[role="dialog"]` (see `hooks/AGENTS.md`) is still survivable, and fail honestly if the
   * window never hides.
   */
  if ((await s.conn.read('state')).inputValue) await clearInput();
  let presses = 0;
  let seen = { ok: false };
  while (presses < 3) {
    await os.pressKey('escape');
    presses += 1;
    seen = await cdp.waitOn(s.conn, 'state', (v) => v.hidden, { timeoutMs: 4000 });
    if (seen.ok) break;
  }
  return { hidden: seen.ok, escapePresses: presses, via: 'real VK_ESCAPE → useKeyboard.ts → window:hide', focus };
}

/**
 * Clear the query with real keys (Ctrl+A, then Delete). Needed because a live result
 * list auto-grows the window and fights a mode change — the same reason
 * `capture-ui.mjs` empties the input before setting a mode.
 */
export async function clearInput() {
  const s = await need();
  const before = (await s.conn.read('state')).inputValue;
  // `null` means there is no `#search-input` in the DOM at all, which is not the same as
  // an already-empty field: reporting `cleared: true` there scored a missing element as a
  // successful clear.
  if (before === null) throw new Error('no #search-input in the DOM — is the palette mounted?');
  if (!before) return { cleared: true, before: '', how: 'nothing to clear' };
  const focus = await ensureFocused(s);
  if (!focusedForInput(focus)) return { cleared: false, refused: 'unfocused', before, focus };
  await os.pressCombo({ modifiers: ['ctrl'], key: 'a' });
  await os.pressKey('delete');
  const done = await cdp.waitOn(s.conn, 'state', (v) => v.inputValue === '', { timeoutMs: 3000 });
  return { cleared: done.ok, before, after: done.value?.inputValue };
}

export async function clickAt(x, y, { button = 'left', anywhere = false } = {}) {
  const px = requireNumber(x, 'x');
  const py = requireNumber(y, 'y');
  // Previously anything that was not exactly 'right' became a left click, so a typo like
  // `middle` silently left-clicked and still reported success.
  if (!['left', 'right'].includes(button)) throw new Error(`button must be left or right, got ${JSON.stringify(button)}`);
  const s = await need();
  if (!anywhere) {
    const rect = syncWindow(s).rect;
    const inside = px >= rect.left && px < rect.left + rect.width
      && py >= rect.top && py < rect.top + rect.height;
    if (!inside) throw new Error(`(${px}, ${py}) is outside the palette rect ${JSON.stringify(rect)} — pass anywhere only when you mean to click another app`);
  }
  await os.clickAt(px, py, { button });
  return { clicked: { x: px, y: py, button }, cursor: os.getCursorPosition() };
}

/** Real cursor move + `SendInput` click. Never `el.click()`. */
export async function clickElement(selector) {
  const s = await need();
  const { point, rect, cssCentre } = await cssToScreen(selector);
  await os.clickAt(point.x, point.y);
  const after = await s.conn.read('state');
  return { selector, rect, cssCentre, point, cursor: os.getCursorPosition(), focused: after.activeElementId };
}

/**
 * Keystrokes only reach the FOREGROUND window, so a verb that injects keys without
 * confirming the palette holds the keyboard is reporting another application's
 * keystrokes as a Qyther result. `hide()` already refused on this; typing and key
 * presses did not, which is how the harness would type its probe query into a foreign
 * session dialog and report that Qyther ignored typing.
 */
function focusedForInput(focus) {
  return focus.focused === true;
}

export async function typeText(text) {
  // `String(undefined)` is "undefined", so an omitted argument used to type that literal
  // into the palette instead of failing.
  if (typeof text !== 'string') throw new Error(`type needs a string, got ${typeof text}`);
  if (!text.length) throw new Error('type needs a non-empty string');
  if (text.length > 500) throw new Error(`refusing to type ${text.length} characters`);
  const s = await need();
  const focus = await ensureFocused(s);
  if (!focusedForInput(focus)) return { typed: false, refused: 'unfocused', focus };
  await os.typeText(text);
  const after = await s.conn.read('state');
  return { typed: text, inputValue: after.inputValue, focused: after.activeElementId, focus };
}

export async function pressKey(name) {
  const s = await need();
  const focus = await ensureFocused(s);
  if (!focusedForInput(focus)) return { key: name, pressed: false, refused: 'unfocused', focus };
  await os.pressKey(name);
  return { key: name, pressed: true, focus, state: await s.conn.read('state') };
}

export async function scrollAt(x, y, amount = -3) {
  await need();
  await os.scrollAt(requireNumber(x, 'x'), requireNumber(y, 'y'), requireNumber(amount, 'amount'));
  return { scrolled: { x, y, amount } };
}

export async function dragBetween(from, to) {
  await need();
  if (!from || !to) throw new Error('drag needs {from:{x,y}} and {to:{x,y}}');
  await os.drag(
    { x: requireNumber(from.x, 'from.x'), y: requireNumber(from.y, 'from.y') },
    { x: requireNumber(to.x, 'to.x'), y: requireNumber(to.y, 'to.y') },
  );
  return { dragged: { from, to } };
}

/**
 * Wait for main's measured `window:modeSettled` rather than polling `innerHeight`. The poll runs
 * at 150 ms against a 180 ms tween, so it could never resolve the transition — it could only
 * notice that the window had already finished. The event carries main's own `height`, so the
 * caller can assert the announced geometry against the geometry the renderer sees.
 */
async function waitModeSettled(conn, mode, timeoutMs = 1200) {
  const since = Date.now();
  const deadline = since + cdp.positiveMs(timeoutMs, 1200);
  for (;;) {
    const events = await conn.recorderEvents();
    const hit = events.find((e) => e.at >= since && e.event === 'electron-window-mode-settled' && e.detail?.mode === mode);
    if (hit) return { ok: true, height: hit.detail?.height };
    if (Date.now() > deadline) return { ok: false };
    await sleep(25);
  }
}

/** Real Alt+Shift+M, the app's own cross-platform mode shortcut — not `window:setMode`. */
export async function setMode(mode) {
  const s = await need();
  const want = MODE_HEIGHTS[mode];
  if (!want) throw new Error(`unknown mode "${mode}" — expected ${Object.keys(MODE_HEIGHTS).join(' or ')}`);
  const from = (await s.conn.read('state')).height;
  for (let attempt = 0; attempt < 2; attempt++) {
    await tapHotkey({ modifiers: ['alt', 'shift'], key: 'm' });
    const settled = await waitModeSettled(s.conn, mode);
    if (settled.ok) {
      const to = (await s.conn.read('state')).height;
      // The whole point of carrying main's own number is comparing it with what the
      // renderer sees, so say so rather than reporting both and calling it a check.
      const mainDisagrees = Number.isFinite(settled.height) && Math.abs(settled.height - to) > 6;
      if (Math.abs(to - want) <= 6) {
        return {
          mode, from, to, mainReportedHeight: settled.height, attempts: attempt + 1,
          settledBy: 'window:modeSettled',
          ...(mainDisagrees ? { geometryMismatch: { main: settled.height, dom: to } } : {}),
        };
      }
    }
    const polled = await cdp.waitOn(s.conn, 'state', (v) => Math.abs(v.height - want) <= 6, { timeoutMs: 3000 });
    if (polled.ok) return { mode, from, to: polled.value.height, attempts: attempt + 1, settledBy: 'poll' };
  }
  return { mode, from, to: (await s.conn.read('state')).height, attempts: 2, note: `did not settle at ${want}px — the hotkey may not accept injected input` };
}

async function capture({ scope = 'palette' } = {}) {
  const s = await need();
  if (scope !== 'palette' && scope !== 'desktop') {
    throw new Error(`unknown scope "${scope}" — palette or desktop`);
  }
  const st = await s.conn.read('state');
  // Measured: Page.captureScreenshot never returns against a hidden window — it hangs
  // to the 20 s timeout. Refuse fast instead of pretending the frame is empty.
  //
  // This refusal used to be palette-only, which was the more dangerous of the two: a
  // `desktop` grab of a hidden window's rect is not empty, it is *the desktop behind the
  // palette* — another application's window, composited into a frame the harness then
  // reports as a successful capture of this app, and (via `save_frame`) onto disk.
  if (st.hidden) {
    return {
      refused: 'hidden',
      scope,
      hint: 'call reveal — a hidden window renders no frames, and the desktop behind it is not this app',
      state: st,
    };
  }
  if (scope === 'desktop') {
    const frame = os.captureScreenRect(syncWindow(s).rect);
    return { scope, source: 'gdi-bitblt', width: frame.width, height: frame.height, png: encodePng(frame) };
  }
  return { scope, source: 'cdp-page-capture', png: await s.conn.capturePalette() };
}

/**
 * Pixel statistics, so "the capture returned bytes" is not mistaken for "the capture
 * shows the app". `bytes > 1000` passes for a uniformly transparent PNG and for a frame
 * of the desktop showing someone else's window, which are exactly the two failures the
 * two capture scopes exist to catch. The palette is `transparent: true`, so a real frame
 * has both an alpha-varying margin and an opaque card; the desktop grab is composited
 * and is opaque throughout.
 */
export function frameStats(png) {
  const img = PNG.sync.read(png);
  const seen = new Set();
  let opaque = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 8) opaque += 1;
    if (seen.size < 4096) seen.add(((img.data[i] << 24) ^ (img.data[i + 1] << 16) ^ (img.data[i + 2] << 8) ^ img.data[i + 3]) >>> 0);
  }
  const pixels = img.width * img.height || 1;
  return {
    width: img.width,
    height: img.height,
    distinctColours: seen.size,
    opaqueFraction: Number((opaque / pixels).toFixed(4)),
  };
}

/**
 * `palette` = the app's own pixels via CDP (true alpha, exact resolution, blind to
 * z-order). `desktop` = a GDI grab of the real composited region (true occlusion).
 * Reporting only one hides occlusion bugs, so a run captures both and compares.
 */
export async function screenshot({ scope = 'palette', inline = false } = {}) {
  const shot = await capture({ scope });
  if (shot.refused) return shot;
  const out = { scope: shot.scope, source: shot.source, bytes: shot.png.length, ...frameStats(shot.png) };
  if (inline) out.base64 = shot.png.toString('base64');
  return out;
}

function encodePng({ width, height, rgba }) {
  const png = new PNG({ width, height });
  rgba.copy(png.data);
  return PNG.sync.write(png);
}

function framePath(id) {
  const safe = String(id ?? '').replace(/[^\w.-]/g, '_');
  // The sanitiser already strips separators, so this cannot traverse; an empty result
  // would just write `.png`, which is a junk artifact rather than a named one.
  if (!safe) throw new Error('save_frame needs a non-empty id');
  return join(TMP_DIR, `${safe}.png`);
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
 * Absolute filesystem paths anywhere in a string: `C:\…`, `D:/…` and UNC `\\host\share`.
 *
 * The privacy gate used to be "every visible row contains the repo root", which is wrong
 * in a way this repo can measure. A result row is chrome plus a path plus a file-type
 * badge, so a row with no path at all — the palette's own `🌐 Search web for "query"`
 * action — was reported as a leak: the baseline run refused the frame with
 * `leaked: 1, samples: ["🌐 Search web for \"desktop-hitl\" Open in default browser Action ↵"]`,
 * which contains no path and nothing personal. Meanwhile the gate read only the rows,
 * so a path typed into the search box was rendered into the captured pixels unchecked.
 *
 * What actually leaks is a filesystem path, so that is what is matched. The match is
 * deliberately over-eager at the edges — a path containing spaces is cut short, and the
 * truncated prefix is still outside the repo, so the gate keeps refusing. Failing closed
 * is the correct direction for a privacy gate.
 */
const ABS_PATH = /(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>|]*/g;

/** Pure, so the selftest can prove the gate can say no without an Everything index. */
export function foreignPaths(strings, root = REPO_ROOT) {
  const rootLower = String(root).toLowerCase();
  const out = [];
  for (const s of strings ?? []) {
    for (const match of String(s).match(ABS_PATH) ?? []) {
      if (!match.toLowerCase().startsWith(rootLower)) out.push(match);
    }
  }
  return out;
}

/**
 * Writes a frame only if the privacy gate passes. Everything indexes every drive, so a
 * captured result list leaks personal paths (measured: an ordinary word query returned
 * dozens of rows, most of them under the user profile or `C:\Windows\WinSxS`).
 *
 * The scan covers the rows, the selected row, and the query itself: the input field is
 * rendered into the frame, so an agent that typed a path and captured would have written
 * that path to disk without ever touching a result row.
 */
export async function saveFrame(id, { scope = 'palette' } = {}) {
  const shot = await capture({ scope });
  if (shot.refused) return shot;
  const st = await readState('state');
  const scanned = [st.inputValue, st.selectedText, ...(st.rows ?? [])].filter((v) => typeof v === 'string');
  const foreign = foreignPaths(scanned, REPO_ROOT);
  if (foreign.length) {
    return {
      refused: 'privacy-gate',
      leaked: foreign.length,
      scanned: scanned.length,
      samples: [...new Set(foreign)].slice(0, 3),
    };
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
  /**
   * The recorder buffer is persistent and bounded, so an event that fired between the
   * caller's action and this wait is still in it — and that is normally the event the
   * caller is waiting for. Filtering by "since the wait started" therefore discarded the
   * very event being waited on and reported `ok: false` while listing the event in its own
   * `events` payload.
   *
   * So there is no implicit time filter. A caller that genuinely needs only future events
   * passes `cond.sinceMs` (epoch ms, captured before its action); callers that drove the
   * action themselves get the whole buffer, which is what makes the wait able to report
   * an event that already arrived.
   */
  if (cond.kind === 'event') {
    const since = Number.isFinite(Number(cond.sinceMs)) ? Number(cond.sinceMs) : -Infinity;
    const deadline = Date.now() + cdp.positiveMs(timeoutMs, 9000);
    for (;;) {
      const events = await s.conn.recorderEvents();
      const hit = events.find((e) => e.at >= since && e.event === `electron-window-${cond.name}`);
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
 * Interactive elements as a user and a screen reader perceive them, with CSS rects.
 *
 * Built on the real accessibility tree (`Accessibility.enable` → `getFullAXTree`), not a
 * DOM selector sweep. The difference is what the `name` is: Chromium computes it from
 * the accessible name specification, so it is the label a person reads — "Keyboard
 * shortcuts", "Search for files, tools, actions...", "Switch to light mode" — rather
 * than a textContent scrape that changes with styling. See `cdp.mjs` `axNodes` for why
 * the previously recorded "0 nodes" was a measurement artefact.
 */
export async function axSnapshot({ limit = 40 } = {}) {
  const s = await need();
  return s.conn.axNodes({ limit });
}

/**
 * Click a control the way a person names it — role plus accessible name — instead of
 * asking the caller for a CSS selector it cannot see. This is the `getByRole` model:
 * targeting survives a restyle that renames a class, and it cannot silently address the
 * wrong element by matching a loose selector.
 *
 * Matching is a case-insensitive substring on the accessible name, and the failure path
 * lists what *was* on screen, so a miss is diagnosable from the transcript alone.
 */
export async function clickRole(role, name) {
  const s = await need();
  const nodes = await s.conn.axNodes({ limit: 200 });
  const wantRole = String(role ?? '').toLowerCase();
  const wantName = String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const matches = nodes.filter((n) => (n.role ?? '').toLowerCase() === wantRole && (n.name ?? '').toLowerCase().includes(wantName));
  if (!matches.length) {
    return { clicked: false, role, name, reason: `no ${role} whose name contains "${name}"`, available: nodes.map((n) => `${n.role}: ${n.name}`) };
  }
  const node = matches[0];
  if (!node.rect) return { clicked: false, role, name, reason: 'matched node has no box', available: matches.map((n) => n.name) };
  const live = await s.conn.read('state');
  const { point, scale, cssCentre } = cssCentreToScreen(s, node.rect, live.width);
  await os.clickAt(point.x, point.y);
  const after = await s.conn.read('state');
  return {
    clicked: true, role: node.role, name: node.name, rect: node.rect,
    // Substring matching can legitimately be ambiguous, and silently taking the first hit
    // is a wrong-element click reported as success. Report it so the caller can narrow.
    ambiguous: matches.length > 1 ? matches.map((n) => n.name) : undefined,
    point, scale, cssCentre, cursor: os.getCursorPosition(), focused: after.activeElementId,
  };
}

export async function closeSession() {
  session?.conn?.close();
  session = null;
}

export const TMP = TMP_DIR;
export const REPO = REPO_ROOT;
