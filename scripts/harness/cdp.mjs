/**
 * CDP layer for the Qyther UI harness — observation only.
 *
 * Nothing in this file may synthesize input. All interaction goes through
 * `native.mjs` (`SendInput`), because a DOM-level click or `Runtime.evaluate`
 * bypasses focus, hit-testing and the app's `WH_KEYBOARD_LL` hook, which is exactly
 * the behaviour under test. Reads here answer "what does the app believe right now".
 *
 * Forked from `scripts/capture-ui.mjs`, the working precedent, with three changes:
 * - the target is found by window title, not `url.includes('localhost:5173')`, so it
 *   also resolves in packaged builds (`windows.ts` uses `loadFile` there);
 * - the port is discovered and attributed to a pid, because `DevToolsActivePort`
 *   survives the app exiting and a stale file would otherwise read a dead endpoint;
 * - the caller can never supply JavaScript: reads are this closed registry.
 */
import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { join } from 'path';

const TITLE = 'Qyther';
const CALL_TIMEOUT_MS = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Named DOM reads. `text` values here are the only code that runs in the page, and
 * none of them take an argument from the caller.
 */
export const READS = {
  state: `(() => {
    const text = document.body ? (document.body.innerText || '') : '';
    return {
      hidden: document.hidden,
      width: innerWidth,
      height: innerHeight,
      dpr: window.devicePixelRatio,
      theme: document.documentElement.className,
      rows: [...document.querySelectorAll('[role="option"]')].map((r) => (r.innerText || '').replace(/\\s+/g, ' ').trim()),
      selected: [...document.querySelectorAll('[role="option"][aria-selected="true"],[role="option"][data-selected="true"],[role="option"][aria-current="true"]')].length,
      selectedText: (() => {
        const hit = document.querySelector('[role="option"][aria-selected="true"],[role="option"][data-selected="true"],[role="option"][aria-current="true"]');
        if (hit) return (hit.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
        const ad = document.querySelector('[aria-activedescendant]')?.getAttribute('aria-activedescendant');
        const via = ad && document.getElementById(ad);
        return via ? (via.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) : null;
      })(),
      activeElementId: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
      inputValue: document.getElementById('search-input') ? document.getElementById('search-input').value : null,
      searching: text.includes('Searching'),
      dialog: text.includes('Keyboard Shortcuts'),
      loading: text.includes('Initializing AI'),
      unavailable: text.includes('File search unavailable') || text.includes('es.exe is missing'),
      url: location.href,
      title: document.title,
    };
  })()`,
  geometry: `({ x: innerWidth, y: innerHeight, dpr: window.devicePixelRatio, scrollY: Math.round(window.scrollY || 0) })`,
};

function readExpression(name) {
  const expr = READS[name];
  if (!expr) throw new Error(`Unknown read "${name}" — allowed: ${Object.keys(READS).join(', ')}`);
  return expr;
}

/** Where Electron/Chromium wrote the live port. `%APPDATA%\qyther\DevToolsActivePort`. */
async function portFromDevToolsActivePort(appData) {
  const file = join(appData, 'qyther', 'DevToolsActivePort');
  const first = (await readFile(file, 'utf8')).split('\n')[0].trim();
  const port = Number(first);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Bad port in ${file}: ${first}`);
  return port;
}

/**
 * Which OS process owns the loopback listener on `port`. Preflight compares this with
 * the pid of the window it is about to click, because two Qyther instances can share a
 * title while only one carries the endpoint — Alt+Space goes to whichever hook is first
 * in the chain, and a mismatch means the harness would drive one app and read another.
 */
export function portOwnerPid(port) {
  if (!Number.isInteger(port)) return Promise.resolve(null);
  const ps = `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue `
    + '| Select-Object -First 1).OwningProcess';
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }, (err, out) => {
      if (err) return resolve(null);
      const n = Number((out || '').trim().split(/\r?\n/)[0]);
      resolve(Number.isInteger(n) && n > 0 ? n : null);
    });
  });
}

/** env override → DevToolsActivePort → the dev default. Returns `{ endpoint, port }`. */
export async function resolveEndpoint({ env = process.env } = {}) {
  const fromEnv = env.CDP_ENDPOINT;
  if (fromEnv) {
    const port = Number(new URL(fromEnv).port);
    return { endpoint: fromEnv.replace(/\/$/, ''), port };
  }
  const candidates = [];
  try { candidates.push(await portFromDevToolsActivePort(env.APPDATA)); } catch { /* no file */ }
  candidates.push(9222);
  for (const port of candidates) {
    const endpoint = `http://127.0.0.1:${port}`;
    try {
      const r = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return { endpoint, port };
    } catch { /* try the next candidate */ }
  }
  throw new Error(`No live CDP endpoint on ${candidates.join(' / ')} — start the app (dev: \`npm run dev\`; packaged: pass --remote-debugging-port=0).`);
}

/**
 * Open a session against the palette. Returns null when no page target carries the
 * window title yet — the title is empty until the renderer's `<title>Qyther</title>`
 * parses, so callers wait rather than assume.
 */
export async function connect({ endpoint, timeoutMs = 8000 } = {}) {
  const base = endpoint || (await resolveEndpoint()).endpoint;
  const deadline = Date.now() + timeoutMs;
  let page = null;
  for (;;) {
    try {
      const targets = await (await fetch(`${base}/json`, { signal: AbortSignal.timeout(3000) })).json();
      page = targets.find((t) => t.type === 'page' && t.title === TITLE && t.webSocketDebuggerUrl);
      if (page) break;
    } catch { /* endpoint may have just died */ }
    if (Date.now() > deadline) throw new Error(`No "${TITLE}" page target at ${base} (looked for ${timeoutMs}ms).`);
    await sleep(250);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error(`CDP socket to ${page.url} failed`));
  });

  let seq = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };

  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result ?? m)));
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (waiting.has(id)) { waiting.delete(id); rej(new Error(`${method} timed out after ${CALL_TIMEOUT_MS}ms`)); }
    }, CALL_TIMEOUT_MS);
  });

  /** A named read from the closed registry — never a caller-supplied expression. */
  const read = async (name) => {
    const r = await cdp('Runtime.evaluate', { expression: readExpression(name), returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`${name}: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
    return r.result.value;
  };

  /** CSS-px rect of one element, for `driver.cssToScreen` to turn into a click point. */
  const rectOf = async (selector) => {
    const expr = `(() => {
      const el = document.querySelector(${JSON.stringify(String(selector))});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height });
    })()`;
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result.value ? JSON.parse(r.result.value) : null;
  };

  /**
   * Subscribe to the DOM CustomEvents preload re-dispatches for window lifecycle, so
   * waits are event-driven instead of the 200 ms polling `capture-ui.mjs` uses.
   * Deliberately not `electronAPI.*` — that would put the harness in the business of
   * calling IPC, which is an action, not an observation.
   */
  const installRecorder = () => cdp('Runtime.evaluate', {
    expression: `(() => {
      if (window.__qytherHarness) return 'already';
      window.__qytherHarness = [];
      for (const name of ['electron-window-shown', 'electron-window-will-hide', 'electron-window-mode-changed']) {
        window.addEventListener(name, (e) => {
          window.__qytherHarness.push({ event: name, at: Date.now(), detail: e.detail ?? null });
          if (window.__qytherHarness.length > 200) window.__qytherHarness.shift();
        });
      }
      return 'installed';
    })()`,
    returnByValue: true,
  }).then((r) => r.result?.value);

  const drainRecorder = () => cdp('Runtime.evaluate', {
    expression: `(() => { const a = window.__qytherHarness || []; window.__qytherHarness = []; return JSON.stringify(a); })()`,
    returnByValue: true,
  }).then((r) => JSON.parse(r.result.value || '[]'));

  /**
   * The palette window is `transparent: true` (`src/main/windows.ts`), so
   * `omitBackground` is required or the whole frame comes back as alpha. CDP returns
   * device pixels: measured 1000x754 for an 800x603 CSS window at dpr 1.25.
   */
  const capturePalette = async () => {
    const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, omitBackground: true });
    return Buffer.from(r.data, 'base64');
  };

  return {
    endpoint: base,
    target: { url: page.url, title: page.title },
    read, rectOf, installRecorder, drainRecorder, capturePalette,
    cdp,
    close: () => ws.close(),
  };
}

/** Poll a named read until a predicate holds; returns the last observed value. */
export async function waitOn(conn, name, predicate, { timeoutMs = 9000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try { last = await conn.read(name); } catch { last = undefined; }
    if (last !== undefined && predicate(last)) return { ok: true, value: last };
    if (Date.now() > deadline) return { ok: false, value: last };
    await sleep(intervalMs);
  }
}
