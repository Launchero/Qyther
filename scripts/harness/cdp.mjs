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
const PORT_PID_TIMEOUT_MS = 5000;
/** Bump whenever the recorder starts recording something different. See `installRecorder`. */
const RECORDER_VERSION = 5;
/** Whole-walk budget for the per-node `DOM.getBoxModel` round trips. */
const AX_BUDGET_MS = 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A caller-supplied deadline is JSON, so it arrives as a string often enough — and
 * `Date.now() + "5000"` is string *concatenation*, not addition. The result compares
 * greater than any timestamp forever, so the wait loop below never terminates and the
 * process holds its CDP socket open spinning. Coerce at the boundary instead.
 */
export function positiveMs(value, fallback, { max = 120000 } = {}) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/**
 * Named DOM reads. `text` values here are the only code that runs in the page, and
 * none of them take an argument from the caller.
 */
export const READS = {
  /**
   * `dialog` is the app's own Escape-ladder precondition: `isDialogOpen()`
   * (src/renderer/hooks/useKeyboard.ts:21-23) is a `[role="dialog"]` query, and Radix Popover
   * content carries that role at runtime, so this field is the difference between "something
   * mounted swallows Escape" and "the app ignores Escape". It used to be `text.includes('Keyboard
   * Shortcuts')`, which measured a different fact entirely — that is now `helpOpen`.
   */
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
      dialog: document.querySelector('[role="dialog"]') !== null,
      helpOpen: text.includes('Keyboard Shortcuts'),
      loading: text.includes('Connecting to the model'),
      unavailable: text.includes('File search unavailable') || text.includes('es.exe is missing'),
      url: location.href,
      title: document.title,
    };
  })()`,
  geometry: `({ x: innerWidth, y: innerHeight, dpr: window.devicePixelRatio, scrollY: Math.round(window.scrollY || 0) })`,
  /**
   * The per-frame trace armed by `installRecorder`, drained once. Takes no argument, so
   * it obeys the closed-registry rule; the series itself is data, not caller code.
   * Each frame carries `trace`, so a consumer can isolate one animation — see `latestTrace`.
   */
  frames: `(() => {
    const frames = window.__qytherFrames || [];
    window.__qytherFrames = [];
    return { count: frames.length, armedUntil: Math.round(window.__qytherArmUntil || 0), traces: window.__qytherTrace || 0, frames };
  })()`,
};

function readExpression(name) {
  const expr = READS[name];
  if (!expr) throw new Error(`Unknown read "${name}" — allowed: ${Object.keys(READS).join(', ')}`);
  return expr;
}

/**
 * Isolate one animation from the shared buffer.
 *
 * One buffer records every window animation in the session, so a consumer that scores
 * "the reveal faded in over ≤260 ms" by differencing the first and last dim frames will
 * silently measure the gap between two unrelated reveals — measured at 6859280 ms, almost
 * two hours, on a session that had been alive a while. Pure, so it is testable without a
 * browser, and it returns an empty array rather than throwing on empty input.
 *
 * "Newest" is not sufficient on its own, and "newest that varies" is not either.
 * `setMode` emits `mode-changed` when the tween starts and `mode-settled` when it ends,
 * and the settle trace holds the last tween step plus the final constraint: measured as
 * `602,602,602,602,603,603,…`, a 1 px change. That trace is newer than the real
 * transition and it *does* vary, so asking for the newest varying trace made the tween
 * step report "no height transition observed" on a tween it had just measured perfectly
 * (the real trace was 75→603, 11 distinct heights). Hence `minRange`: walk traces
 * newest-first and take the first one whose `field` moves by at least that much, falling
 * back to any variation and then to the newest. Pass `op` for a fade and the default `h`
 * for a resize.
 */
export function latestTrace(trace, field = 'h', minRange = 0) {
  const frames = trace?.frames ?? [];
  if (!frames.length) return [];
  const groups = new Map();
  for (const f of frames) {
    const id = f.trace ?? 0;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(f);
  }
  const ids = [...groups.keys()].sort((a, b) => b - a);
  const spanOf = (group) => {
    const values = group.map((f) => Number(f[field]) || 0);
    return Math.max(...values) - Math.min(...values);
  };
  for (const id of ids) if (spanOf(groups.get(id)) >= minRange) return groups.get(id);
  for (const id of ids) if (spanOf(groups.get(id)) > 0) return groups.get(id);
  return groups.get(ids[0]) ?? [];
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
    // Bounded, per the root AGENTS.md rule that every child process carries a timeout: a
    // PowerShell that stalls on module load or a wedged adapter would otherwise hold
    // preflight open forever with no error and no exit. `windowsHide` keeps a console
    // window from flashing over the palette, and `maxBuffer` covers the 1 MB default.
    const opts = { encoding: 'utf8', timeout: PORT_PID_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true };
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], opts, (err, out) => {
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
    let port;
    try {
      port = Number(new URL(fromEnv).port);
    } catch {
      throw new Error(`CDP_ENDPOINT is not a URL: ${fromEnv}`);
    }
    // Unvalidated, an empty port yielded 0 and garbage yielded NaN, and the refusal then
    // named "port 0" or "port NaN" while shelling out `Get-NetTCPConnection -LocalPort 0`.
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`CDP_ENDPOINT must carry an explicit 1-65535 port: ${fromEnv}`);
    }
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
  const deadline = Date.now() + positiveMs(timeoutMs, 8000);
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
    // One malformed frame must not take down the harness: an unguarded JSON.parse throws
    // out of the event handler and kills the process with no transcript.
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  /**
   * A dead socket used to surface as `Runtime.evaluate timed out after 20000ms` on
   * every in-flight call, which reads like a slow app rather than a dead session —
   * and the renderer reloading (DevTools reload, a crash) is the common cause. Reject
   * everything pending the moment the close lands, naming the close, so a lost session
   * is diagnosable from the first error instead of from the twentieth timeout.
   */
  ws.onclose = (e) => {
    const reason = `CDP socket closed (code ${e?.code ?? '?'}${e?.reason ? `, ${e.reason}` : ''})`;
    for (const [id, settle] of waiting) { waiting.delete(id); settle({ error: { message: reason } }); }
    waiting.clear();
  };

  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result ?? m)));
    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch (e) {
      waiting.delete(id);
      rej(new Error(`${method}: CDP socket is not open — ${e.message}`));
      return;
    }
    const timer = setTimeout(() => {
      if (waiting.has(id)) { waiting.delete(id); rej(new Error(`${method} timed out after ${CALL_TIMEOUT_MS}ms`)); }
    }, CALL_TIMEOUT_MS);
    // A call still in flight must not be the reason a finished CLI verb stays alive.
    timer.unref();
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
   *
   * The same install also arms a per-frame sampler. Main eases the window height over
   * `MODE_HEIGHT_TWEEN_MS` and the renderer reveals over `--duration-150`, both far
   * shorter than the 150 ms `waitOn` poll, so nothing else in this repo can see those
   * frames at all. Sampling inside the page rather than from `setBounds` calls is
   * deliberate: it measures what the user actually gets, and it keeps working when the
   * tween implementation in `src/main/windowManager.ts` changes.
   */
  /**
   * Install, or report that a current recorder is already there.
   *
   * The guard used to be "is anything installed", which meant the recorder was written
   * once per app session and never again — so a long-running dev app kept measuring with
   * whatever the first harness process installed. When frames gained their `trace` id
   * (which is what stops the reveal step differencing two animations together), a
   * `selftest` against an already-running app still reported `tracesSeen: 0` and scored
   * a merged buffer, because the live page was serving the previous generation. Bump
   * RECORDER_VERSION with any change to what is recorded, and the next preflight replaces
   * the stale recorder instead of trusting it.
   */
  const installRecorder = () => cdp('Runtime.evaluate', {
    expression: `(() => {
      if (window.__qytherHarness && window.__qytherRecorderVersion === ${RECORDER_VERSION}) return 'already';
      window.__qytherHarness = [];
      window.__qytherFrames = [];
      window.__qytherArmUntil = 0;
      window.__qytherTrace = 0;
      window.__qytherRecorderVersion = ${RECORDER_VERSION};
      // Cancel the loop the previous generation left running. Each sampler owns a rAF
      // loop that reads the SHARED armUntil, which the live recorder keeps extending, so
      // an old loop never retires on its own: with two live the buffer gained three frames
      // per frame (gaps of 0,0,17 ms) and the tween became unreadable. Loops from before
      // this cancel existed still cannot be stopped — restart the app once after such a
      // bump; every generation after this one replaces its predecessor cleanly.
      if (window.__qytherRafId) cancelAnimationFrame(window.__qytherRafId);
      const TRACE_MS = 500;
      const MAX_FRAMES = 900;
      let tracing = false;

      const surfaceOpacity = () => {
        const el = document.querySelector('.palette-revealing');
        if (!el) return 1;
        const o = Number(getComputedStyle(el).opacity);
        return Number.isFinite(o) ? Number(o.toFixed(3)) : 1;
      };

      const tick = (now) => {
        // A recorder from an earlier generation keeps its own closure and its own
        // tracing flag, and it reads the SHARED armUntil — which the live recorder keeps
        // extending — so it never retires on its own. Bumping RECORDER_VERSION therefore
        // installed a second sampler beside the first, and the old one pushed untagged
        // frames forever: latestTrace saw 33 frames carrying no trace id at all, a 584 ms
        // hole where the tween should have been, and heights that jumped 75 -> 602. Any
        // superseded loop retires on its next frame.
        if (window.__qytherRecorderVersion !== ${RECORDER_VERSION}) {
          tracing = false;
          return;
        }
        if (now >= window.__qytherArmUntil || window.__qytherFrames.length >= MAX_FRAMES) {
          tracing = false;
          return;
        }
        // Every frame carries the trace it belongs to. One buffer serves every animation
        // in the session, so a consumer must be able to isolate the single trace it is
        // scoring: the reveal-opacity step measured dimForMs = 6859280 ms because it
        // differenced the last dim frame of one reveal against the first dim frame of a
        // later one. Grouping by \`trace\` makes that arithmetic impossible to get wrong.
        window.__qytherFrames.push({
          trace: window.__qytherTrace,
          at: Math.round(now),
          h: Math.round(innerHeight),
          w: Math.round(innerWidth),
          op: surfaceOpacity(),
        });
        window.__qytherRafId = requestAnimationFrame(tick);
      };

      const arm = () => {
        const now = performance.now();
        // One trace per animation *episode*, not per event. setMode emits
        // mode-changed at the start of the tween and mode-settled at its end, both
        // inside one 500 ms window: bumping the trace id on each left the settled frames
        // as the newest trace, so a consumer isolating "the last animation" got 30 frames
        // of one settled height and reported "no height transition observed". A new trace
        // therefore starts only when the previous one has expired or none is running.
        const expired = !tracing || now >= window.__qytherArmUntil;
        window.__qytherArmUntil = now + TRACE_MS;
        if (expired) {
          window.__qytherTrace += 1;
          // Drop the oldest rather than stop: the cap exists to bound memory, and the
          // frames worth keeping are the newest — they belong to what is being measured.
          if (window.__qytherFrames.length >= MAX_FRAMES) {
            window.__qytherFrames.splice(0, Math.floor(MAX_FRAMES / 2));
          }
        }
        if (tracing) return;
        tracing = true;
        window.__qytherRafId = requestAnimationFrame(tick);
      };

      for (const name of ['electron-window-shown', 'electron-window-will-hide', 'electron-window-mode-changed', 'electron-window-mode-settled']) {
        window.addEventListener(name, (e) => {
          window.__qytherHarness.push({ event: name, at: Date.now(), detail: e.detail ?? null });
          if (window.__qytherHarness.length > 200) window.__qytherHarness.shift();
          if (name !== 'electron-window-will-hide') arm();
        });
      }
      return 'installed';
    })()`,
    returnByValue: true,
  }).then((r) => r.result?.value);

  /**
   * Peek at the lifecycle events, WITHOUT clearing. This used to drain, which made two
   * waiters a race: `set_mode` polls every 25 ms and `wait_for {kind:'event'}` every
   * 150 ms, so whichever ran first consumed the event and the other reported it as
   * never having happened. Callers filter on `at >= since`, so each waiter sees every
   * event and judges it against its own window.
   */
  const recorderEvents = () => cdp('Runtime.evaluate', {
    expression: `(() => JSON.stringify(window.__qytherHarness || []))()`,
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

  /**
   * The accessibility tree, as a user and a screen reader perceive the app, each node
   * paired with its CSS rect.
   *
   * `docs/windows-ui-harness.md` and `scripts/harness/AGENTS.md` both recorded that
   * `Accessibility.getFullAXTree` "returns 0 nodes" here and that DOM queries were the
   * only reliable tree. That was measured without `Accessibility.enable`, which is what
   * turns the tree on for a CDP-driven read. With it enabled the palette returns **101
   * nodes**, including `textbox "Search for files, tools, actions..."`, `listbox "Search
   * results"`, `option` rows with their computed accessible names, and `button "Keyboard
   * shortcuts"`. The old claim was an artefact of the measurement, so `ax_snapshot` is
   * built on the real tree now.
   *
   * Every node costs one `DOM.getBoxModel` round trip, so this is bounded by `limit`
   * and `disable` runs in `finally` — leaving the tree on has a documented cost.
   */
  const axNodes = async ({ limit = 40 } = {}) => {
    const cap = Math.max(1, Math.min(300, Math.trunc(Number(limit) || 40)));
    const budgetUntil = Date.now() + AX_BUDGET_MS;
    await cdp('Accessibility.enable');
    try {
      const { nodes = [] } = await cdp('Accessibility.getFullAXTree');
      const meaningful = nodes.filter((n) => !AX_LAYOUT_ROLES.has(n.role?.value) && (n.name?.value ?? '').trim() !== '');
      const out = [];
      for (const n of meaningful) {
        // One round trip per node, so bound the whole walk: `limit` alone left a caller's
        // 200-node request able to run 200 sequential calls with no overall deadline.
        if (out.length >= cap || Date.now() > budgetUntil) break;
        out.push({
          role: n.role?.value ?? null,
          name: String(n.name?.value ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          rect: await axRect(cdp, n.backendDOMNodeId),
        });
      }
      return out;
    } finally {
      await cdp('Accessibility.disable').catch(() => {});
    }
  };

  return {
    endpoint: base,
    target: { url: page.url, title: page.title },
    read, rectOf, installRecorder, recorderEvents, capturePalette, axNodes,
    cdp,
    // A cached session outlives a dead socket on the long-lived MCP server: after the app
    // restarts, every verb failed with "CDP socket closed" until the server itself was
    // restarted. `driver.need()` watches this and rebuilds the session once.
    isOpen: () => ws.readyState === 1,
    close: () => ws.close(),
  };
}

/**
 * Roles Chromium emits for layout boxes rather than things a person can act on. Listing
 * them is what turns a 101-node tree into the dozen controls an agent actually wants.
 */
const AX_LAYOUT_ROLES = new Set([
  'none', 'generic', 'GenericContainer', 'InlineTextBox', 'StaticText', 'paragraph',
  'section', 'main', 'banner', 'LineBreak',
]);

/** CSS rect of one AX node, or null when the node has no box (as some do). */
async function axRect(cdp, backendNodeId) {
  try {
    const r = await cdp('DOM.getBoxModel', { backendNodeId });
    const quad = r?.model?.content ?? r?.model?.border;
    if (!quad || quad.length !== 8) return null;
    return { x: Math.round(quad[0]), y: Math.round(quad[1]), width: Math.round(quad[2] - quad[0]), height: Math.round(quad[5] - quad[1]) };
  } catch {
    return null;
  }
}

/** Poll a named read until a predicate holds; returns the last observed value. */
export async function waitOn(conn, name, predicate, { timeoutMs = 9000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + positiveMs(timeoutMs, 9000);
  let last;
  for (;;) {
    try { last = await conn.read(name); } catch { last = undefined; }
    if (last !== undefined && predicate(last)) return { ok: true, value: last };
    if (Date.now() > deadline) return { ok: false, value: last };
    await sleep(intervalMs);
  }
}
