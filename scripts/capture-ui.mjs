/**
 * Qyther UI capture harness — regenerates the README screenshot set.
 *
 * Prerequisites: `npm run dev` running with CDP enabled (dev-only:
 * src/main/main.ts opens 127.0.0.1:9222 when NODE_ENV=development).
 * Attaches to the live palette window, drives it through the same controls a
 * person uses (mode IPC, the footer theme toggle, the shortcut-reference button),
 * and writes transparent PNGs. Nothing is composited or staged.
 *
 * Two behaviours this harness has to work around:
 * - Escape hides the window (src/renderer/hooks/useKeyboard.ts) and a hidden
 *   window renders no frames, so the harness re-reveals it with a real Alt+Space
 *   key event, which src/main/shortcuts.ts catches on the low-level hook.
 * - File search runs against every indexed drive, so a published capture can leak
 *   personal paths. `captureResults` refuses to write any frame whose visible rows
 *   are not all inside the repository.
 *
 * Usage: node scripts/capture-ui.mjs [--out docs/assets/screenshots] [--only <id>]
 */
import { mkdir, writeFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { execFile } from 'child_process';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CDP = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const argv = process.argv;
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i > -1 ? argv[i + 1] : fallback; };
const OUT = resolve(flag('out', 'docs/assets/screenshots'));
const ONLY = flag('only', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ALT_SPACE_PS = [
  'Add-Type -Namespace Qyther -Name Key -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, uint e);\'',
  '[Qyther.Key]::keybd_event(0x12,0,0,0)', '[Qyther.Key]::keybd_event(0x20,0,0,0)',
  '[Qyther.Key]::keybd_event(0x20,0,2,0)', '[Qyther.Key]::keybd_event(0x12,0,2,0)',
].join('; ');

const reveal = () => new Promise((res) => {
  const encoded = Buffer.from(ALT_SPACE_PS, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], () => res());
});

const targets = await (await fetch(`${CDP}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:5173'));
if (!page) throw new Error(`No palette page target at ${CDP} — start the app with \`npm run dev\`.`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
let seq = 0;
const waiting = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m)));
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); rej(new Error(`${method} timed out`)); } }, 20000);
});

const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};

/** React owns the input, so set the value through the native setter and fire `input`. */
const type = (text) => evaluate(`(() => {
  const el = document.getElementById('search-input');
  if (!el) throw new Error('search input not mounted');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  el.focus(); set.call(el, ${JSON.stringify(text)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el.value;
})()`);

const click = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'not-found';
  el.click();
  return 'clicked';
})()`);

const clickText = (label) => evaluate(`(() => {
  const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim().startsWith(${JSON.stringify(label)}));
  if (!el) return 'not-found';
  el.click();
  return 'clicked';
})()`);

const api = (call) => evaluate(`(async () => await window.electronAPI.${call})()`);

/** Radix closes on the header X or an outside pointerdown/pointerup. Escape is unusable here: it hides the whole window. */
const dismissDialog = async () => {
  const closed = await click('button[aria-label="Close"]');
  if (closed !== 'clicked') {
    await evaluate(`(() => {
      const overlay = document.querySelector('[data-slot="dialog-overlay"]') || document.querySelector('[role="dialog"]')?.parentElement;
      if (!overlay) return;
      ['pointerdown', 'pointerup'].forEach((t) => overlay.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: 4, clientY: 4 })));
    })()`);
  }
  const s = await poll((x) => !x.dialog, { ms: 2500 });
  if (s.dialog) console.log('  ! shortcut dialog did not close; later shots may be occluded');
};

const uiState = () => evaluate(`(() => {
  const text = document.body.innerText || '';
  const rows = [...document.querySelectorAll('[role="option"]')].map((r) => (r.innerText || '').replace(/\\s+/g, ' ').trim());
  return {
    hidden: document.hidden,
    width: innerWidth,
    height: innerHeight,
    theme: document.documentElement.className,
    rows,
    searching: text.includes('Searching'),
    dialog: text.includes('Keyboard Shortcuts'),
    loading: text.includes('Initializing AI'),
    unavailable: text.includes('File search unavailable') || text.includes('es.exe is missing'),
  };
})()`);

const poll = async (predicate, { ms = 9000, interval = 200 } = {}) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const s = await uiState();
    if (predicate(s)) return s;
    if (Date.now() > deadline) return s;
    await sleep(interval);
  }
};

const shown = async () => {
  const s = await poll((x) => !x.hidden, { ms: 2500 });
  if (s.hidden) { await reveal(); return poll((x) => !x.hidden, { ms: 5000 }); }
  return s;
};

/** Window height animates 30px per 16ms, so wait for the geometry to settle before shooting. */
const setMode = async (mode) => {
  await shown();
  // A live result list auto-grows the window and fights the requested mode, so empty it first.
  await evaluate(`(() => {
    const el = document.getElementById('search-input');
    if (!el) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`).catch(() => {});
  const want = mode === 'compact' ? 103 : 603;
  for (let attempt = 0; attempt < 3; attempt++) {
    await api(`window.setMode('${mode}')`);
    const s = await poll((x) => !x.hidden && Math.abs(x.height - want) <= 2, { ms: 4000 });
    if (!s.hidden && Math.abs(s.height - want) <= 2) return s;
  }
  return uiState();
};

/** Click the app's own footer control; falls back to the class the ThemeProvider sets. */
const setTheme = async (theme) => {
  const wantTitle = theme === 'dark' ? 'Switch to dark mode' : 'Switch to light mode';
  const clicked = await click(`button[title="${wantTitle}"]`);
  if (clicked !== 'clicked') {
    await evaluate(`(() => {
      localStorage.setItem('app-theme', ${JSON.stringify(theme)});
      document.documentElement.className = ${JSON.stringify(theme)};
    })()`);
  }
  await poll((s) => s.theme === theme, { ms: 2500 });
};

const write = async (id, img) => writeFile(resolve(OUT, `${id}.png`), Buffer.from(img.result.data, 'base64'));

const shot = async (id, extraMs = 300) => {
  if (ONLY && ONLY !== id) return;
  await shown();
  await sleep(extraMs);
  const s = await uiState();
  const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, omitBackground: true });
  await write(id, img);
  const notes = [s.rows.length + ' rows', s.dialog && 'dialog', s.loading && 'LOADING-STATE', s.unavailable && 'SEARCH-UNAVAILABLE', s.hidden && 'STILL-HIDDEN'].filter(Boolean);
  console.log(`  ${id.padEnd(28)} ${s.width}x${s.height} ${s.theme.padEnd(6)} ${notes.join(' ')}`);
};

/** Results capture with the privacy gate: refuse to write a frame showing anything outside the repo. */
const shotResults = async (id, query) => {
  if (ONLY && ONLY !== id) return;
  await type(query);
  const s = await poll((x) => !x.searching && x.rows.length > 0, { ms: 9000 });
  if (!s.rows.length) {
    console.log(`  ${id.padEnd(28)} SKIPPED — no result rows (search unavailable or query matched nothing)`);
    await unlink(resolve(OUT, `${id}.png`)).catch(() => {});
    return;
  }
  const foreign = s.rows.filter((r) => !r.includes(REPO_ROOT));
  if (foreign.length) {
    console.log(`  ${id.padEnd(28)} SKIPPED — ${foreign.length}/${s.rows.length} rows outside ${REPO_ROOT}:`);
    foreign.slice(0, 3).forEach((r) => console.log(`      ${r.slice(0, 110)}`));
    await unlink(resolve(OUT, `${id}.png`)).catch(() => {});
    return;
  }
  const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, omitBackground: true });
  await write(id, img);
  console.log(`  ${id.padEnd(28)} ${s.width}x${s.height} ${s.theme.padEnd(6)} ${s.rows.length} rows, all inside repo`);
};

await cdp('Page.enable');
await mkdir(OUT, { recursive: true });
console.log(`Attaching to ${page.url}\nWriting ${OUT}\n`);

for (const theme of ['light', 'dark']) {
  await type('');           // a live result list keeps the window auto-grown, so clear first
  await setMode('compact');
  await setTheme(theme);
  await shot(`01-compact-idle-${theme}`);
}

// Expanded landing surface: quick actions grid + footer.
for (const theme of ['light', 'dark']) {
  await setMode('expanded');
  await type('');
  await setTheme(theme);
  await shot(`02-expanded-home-${theme}`, 600);
}

// In-app shortcut reference. Must be shot while expanded: the footer that owns the
// trigger is hidden in compact mode.
await setTheme('dark');
await click('button[title="Keyboard shortcuts"]');
await poll((s) => s.dialog, { ms: 4000 });
await shot('05-shortcuts-reference-dark', 700);
await dismissDialog();

// Live Everything results. The token names a file that exists only in this checkout,
// which matters because the index covers every drive and this machine holds a second
// clone of the project. The gate in shotResults still verifies every visible row.
await setMode('expanded');
await setTheme('dark');
await shotResults('04-expanded-results-dark', 'desktop-hitl');

// Ask mode is deliberately not captured: with no API_KEY the app never leaves its
// initialising state, so any frame of it would be a spinner or a duplicate of the
// Files landing screen. Add scenarios here once a model endpoint is configured.

ws.close();
console.log('\nDone. Review every PNG before publishing — they carry real file names and live window state.');
