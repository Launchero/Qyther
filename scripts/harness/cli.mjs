/**
 * CLI for the Qyther UI harness — the operator surface.
 *
 *   node scripts/harness/cli.mjs <verb> --flag value
 *   node scripts/harness/cli.mjs <verb> '{"json":"args"}'
 *   npm run harness:preflight
 *   npm run harness:selftest
 *
 * Flags are the documented form. A single JSON blob still works, but Windows PowerShell
 * 5.1 strips the double quotes out of a single-quoted argument before the native process
 * ever sees it, so `cli.mjs type '{"text":"qyther"}'` — the invocation both this folder's
 * docs and `docs/windows-ui-harness.md` showed — died with a raw Node `SyntaxError` on
 * the default Windows shell. `--flag value` carries no quotes to lose.
 *
 * `selftest` is the only thing that proves the harness is really simulating a user:
 * it fails if any input arrived through the DOM instead of `SendInput`.
 */
import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import * as d from './driver.mjs';
import { latestTrace } from './cdp.mjs';

/** koffi hands back an HWND as BigInt, and `JSON.stringify` refuses to encode one. */
const jsonSafe = (key, value) => (typeof value === 'bigint' ? `0x${value.toString(16)}` : value);

/**
 * Every verb declares what success means for *it*, because the exit code is the signal an
 * agent and a shell script act on.
 *
 * The old rule was `out.ok === false || out.problems?.length`, and only `preflight` and
 * `wait` ever set those keys. Every other verb reports its own result in its own field,
 * so `hide` on an app that ignored Escape, `reveal` on a hotkey that did nothing,
 * `clear_input` on text that stayed, and `set_mode` on a window that never settled all
 * printed a perfectly healthy result and **exited 0**. The selftest's own rule — only
 * `pass === true` counts, never a permissive default — has to reach the exit code too,
 * or the gate can say no while the command line says yes.
 */
const VERBS = {
  preflight: { run: () => d.preflight(), ok: (r) => r.ok === true },
  who: { run: () => d.who(), ok: () => true },
  state: { run: (a) => d.readState(a?.name ?? 'state'), ok: () => true },
  list_windows: { run: () => d.listWindows(), ok: () => true },
  ax_snapshot: { run: (a) => d.axSnapshot(a ?? {}), ok: (r) => Array.isArray(r) && r.length > 0 },
  reveal: { run: () => d.reveal(), ok: (r) => r.revealed === true || !!r.note },
  hide: { run: () => d.hide(), ok: (r) => r.hidden === true },
  click_at: { run: (a) => d.clickAt(a.x, a.y, a), ok: (r) => !!r.clicked },
  click_element: { run: (a) => d.clickElement(a.selector), ok: (r) => !!r.point },
  click_role: { run: (a) => d.clickRole(a.role, a.name), ok: (r) => r.clicked === true },
  type: { run: (a) => d.typeText(a.text), ok: (r, a) => r.inputValue === String(a.text ?? '') },
  key: { run: (a) => d.pressKey(a.name), ok: (r) => !!r.state },
  scroll: { run: (a) => d.scrollAt(a.x, a.y, a.amount), ok: (r) => !!r.scrolled },
  drag: { run: (a) => d.dragBetween(a.from, a.to), ok: (r) => !!r.dragged },
  set_mode: { run: (a) => d.setMode(a.mode), ok: (r) => !r.note && typeof r.to === 'number' },
  clear_input: { run: () => d.clearInput(), ok: (r) => r.cleared === true },
  // Aligned with the selftest's own bounds: a verb that exits 0 on a blank or fully
  // transparent frame while the gate fails it is the permissive-default problem again,
  // one layer down.
  screenshot: { run: (a) => d.screenshot(a ?? {}), ok: (r) => !r.refused && r.bytes > 0 && r.distinctColours >= 8 && r.opaqueFraction > 0.5 },
  save_frame: { run: (a) => d.saveFrame(a.id, a), ok: (r) => !!r.saved },
  wait: { run: (a) => d.waitFor(a.cond ?? a, a), ok: (r) => r.ok === true },
};

/**
 * Input must never arrive through the DOM — that would void every claim this makes.
 * `Input.dispatch*` and `Emulation.setDeviceMetricsOverride` are in the same class as
 * `el.click()`: they make the page believe it was driven by a user when nothing crossed
 * the OS input queue at all.
 */
const FORBIDDEN_IN_HARNESS = [
  'HTMLInputElement.prototype',
  '.click()',
  'dispatchEvent',
  'electronAPI.',
  'new Event(',
  'new PointerEvent(',
  'Input.dispatch',
  'Emulation.setDeviceMetrics',
];

/**
 * Scan executable lines only. Every one of these strings appears in this harness's own
 * prose explaining why it must not appear in code, so a naive substring match over the
 * raw file would either always fail or need the list deleted — and `cli.mjs` is skipped
 * entirely because it holds the list.
 */
function codeLines(text) {
  return text.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

async function guardNoDomInput() {
  const files = ['native.mjs', 'cdp.mjs', 'driver.mjs', 'mcp-server.mjs'];
  const hits = [];
  for (const f of files) {
    const text = codeLines(await readFile(join(import.meta.dirname, f), 'utf8'));
    for (const bad of FORBIDDEN_IN_HARNESS) {
      if (text.includes(bad)) hits.push(`${f}: ${bad}`);
    }
  }
  return hits;
}

/**
 * A query derived from the repo itself, so it is guaranteed to match this repo in
 * Everything's index rather than depending on a file someone once created. Lower-cased
 * because the search is case-sensitive: `Qyther` returns 0 rows where `qyther` returns 44.
 *
 * The previous hardcoded token, `desktop-hitl`, matched nothing: the baseline run got a
 * single row — the palette's own `Search web for` action — which silently broke two
 * steps. `ArrowDown` had nowhere to move (and reported the working selection as broken),
 * and the privacy gate refused the frame write on a row containing no path at all.
 */
const SELFTEST_QUERY = basename(d.REPO).toLowerCase();

async function selftest() {
  const results = [];
  /**
   * A step must state its verdict. `pass: undefined` used to score as success (`!== false`), so a
   * step that forgot to return `pass` — or whose predicate evaluated to `undefined` because the
   * driver returned a shape it did not expect — printed PASS and the suite stayed green while
   * measuring nothing. That is how `hide via real Escape` reported `hidden: false` as a pass and
   * the two reveal steps then failed downstream: the failure was real, the earlier green was not.
   * Only an explicit `true` passes now, and anything else is a failure with the detail attached.
   */
  const step = async (name, fn) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      const pass = detail?.pass === true;
      results.push({ step: name, pass, ms: Date.now() - t0, detail });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${JSON.stringify(detail).slice(0, 190)}`);
    } catch (e) {
      results.push({ step: name, pass: false, ms: Date.now() - t0, error: e.message });
      console.log(`FAIL  ${name.padEnd(30)} ${e.message.split('\n')[0]}`);
    }
  };

  let s;
  await step('preflight', async () => {
    const info = await d.preflight();
    s = info;
    return { pass: info.ok, problems: info.problems, pid: info.pid, scale: info.scale, dpr: info.dpr, mode: info.mode };
  });
  if (!s?.ok) {
    console.log('\nselftest aborted at preflight — the gate refused, which is the point.');
    return { ok: false, results, aborted: 'preflight' };
  }

  await step('hide via real Escape', async () => {
    const r = await d.hide();
    return { pass: r.hidden === true, ...r };
  });

  await step('reveal via Alt+Space', async () => {
    const r = await d.reveal();
    return { pass: r.revealed === true || !!r.note, ...r, state: undefined };
  });

  /**
   * Wait for a real `window:shown` CustomEvent, which means producing one.
   *
   * This step used to sit after the reveal and simply look in the buffer for an event
   * that had already fired — it passed because of a leftover, and it exercised nothing.
   * It now drives the cycle itself and waits for an event that is genuinely in the
   * future, which is the only thing a wait can be tested against.
   */
  await step('window:shown event', async () => {
    await d.hide();
    await d.reveal();
    const r = await d.waitFor({ kind: 'event', name: 'shown' }, { timeoutMs: 6000 });
    // `=== true`, not `!== false`. The permissive default is the exact defect this suite
    // already documents once; the only reason it was safe here is that `waitFor` happens
    // to always set a boolean, which is a coincidence, not a contract.
    return { pass: r.ok === true, note: r.ok ? 'recorder caught the DOM CustomEvent' : 'not observed — will fall back to polling', events: r.events };
  });

  /**
   * Does the summon actually fade in?
   *
   * Two facts are provable from the trace and each can fail: the card starts transparent
   * (`minOpacity` well below 1), and the fade is over inside the envelope declared by the
   * token (`--animate-palette-reveal: paletteReveal var(--duration-150)`) plus a frame or
   * two of slack. A missing class, a class that never clears, or a summon that pops in at
   * full opacity each turn this red.
   *
   * Measured against the NEWEST trace only. One buffer records every animation in the
   * session, and the previous version differenced the first dim frame of one reveal
   * against the last dim frame of a later one — reporting `dimForMs: 6859280`, almost two
   * hours, and failing a reveal that was fine. `latestTrace` isolates the animation being
   * scored so that arithmetic cannot span two of them.
   *
   * What is deliberately NOT asserted is a minimum count of dim frames: a hidden window's
   * rAF does not run, so on the hidden → shown path the first samples land ~100 ms into a
   * 150 ms animation and frame count measures Chromium's compositor start-up, not the app.
   * That truncation is an open finding belonging in `hooks/useWindowReveal.ts`, not here.
   */
  await step('reveal opacity trace', async () => {
    // Produce a warm reveal to measure, and only that one.
    //
    // The step used to read whatever the first reveal after launch had left in the buffer,
    // which is the worst possible moment to time a 150 ms animation: the renderer is still
    // coming up, its rAF ran at ~16 Hz, and the fade was stretched to a measured 483 ms by
    // startup work — so the gate was really measuring cold-start contention. Discard the
    // buffer, let any live trace expire so a new one starts, then drive one reveal.
    await d.readState('frames');
    await new Promise((resolve) => setTimeout(resolve, 700));
    await d.hide();
    await d.reveal();
    const trace = await d.readState('frames');
    const all = trace.frames ?? [];
    const frames = latestTrace(trace, 'op', 0.2);
    if (frames.length < 2) {
      return { pass: false, reason: 'no reveal frames — the palette was never revealed through an armed window', frames: frames.length, buffered: all.length };
    }
    const dim = frames.filter((f) => f.op < 1);
    const minOpacity = Math.min(...frames.map((f) => f.op));
    const dimForMs = dim.length ? dim.at(-1).at - dim[0].at : 0;
    return {
      // `<= 0.5`, not the `<= 0.2` this step used to claim. Once the trace is isolated
      // correctly the first sample lands partway into the fade — a hidden window runs no
      // rAF, so the sampler cannot start until the compositor does — and measured 0.393.
      // The bound still fails the regression that matters, a summon that pops in at full
      // opacity (which would sample 1), and the reported value says how far in the sampler
      // began. Asserting 0.2 here was really asserting on the sampler start offset.
      pass: minOpacity <= 0.5 && dimForMs <= 260,
      budget: { minOpacity: '<=0.5 (a no-fade reveal samples 1)', dimForMs: '<=260 (token: 150ms + slack)' },
      traceOf: frames.length,
      buffered: all.length,
      tracesSeen: trace.traces,
      minOpacity,
      dimFrames: dim.length,
      dimForMs,
    };
  });

  await step('clear input with real keys', async () => {
    const r = await d.clearInput();
    return { pass: r.cleared === true, ...r };
  });

  await step('set_mode expanded', async () => {
    const r = await d.setMode('expanded');
    return { pass: Math.abs(r.to - 603) <= 6, ...r };
  });

  /**
   * The gate the repo has never had: is the height tween frame-smooth?
   *
   * Three transitions, not one. A single sample proved untrustworthy: the same build measured 1,
   * 2 and 5 consecutive repeats on three consecutive runs, so one run cannot tell a regression
   * from noise. Stutter metrics take the median of three; the bounds that describe a *broken*
   * transition (monotonic, span, lead) must hold in every one of them.
   *
   * Each trace is split at first motion. Everything before it is lead — the window has not started
   * moving yet, which is a latency and belongs in its own number — and everything from there to
   * the target is the ramp, where a repeated height is a stutter the eye can see.
   *
   * The transition is driven explicitly rather than inherited from the previous step:
   * `setMode('expanded')` on a window that is already expanded returns early in main and tweens
   * nothing, so trusting the ambient mode silently produced a 1-frame "ramp".
   *
   * Budget: a 180 ms tween at ~60 Hz has ~11 frames and must show a distinct height in most of
   * them, hence >=7 distinct and <=2 repeats. Do not loosen it, and do not put the tween back on
   * a main-process timer.
   */
  await step('height tween frame-smooth', async () => {
    const measureOnce = async () => {
      await d.setMode('compact');
      await new Promise((resolve) => setTimeout(resolve, 700));
      await d.readState('frames');
      await d.setMode('expanded');
      await new Promise((resolve) => setTimeout(resolve, 700));
      const frames = latestTrace(await d.readState('frames'), 'h', 100);
      if (frames.length < 4) return { frames: frames.length, error: 'no tween frames — recorder never armed' };
      const heights = frames.map((f) => f.h);
      const floor = Math.min(...heights);
      const target = Math.max(...heights);
      if (target - floor < 100) return { frames: frames.length, error: 'no height transition observed' };
      const firstMotion = heights.findIndex((h) => h !== floor);
      const ramp = frames.slice(firstMotion, heights.indexOf(target) + 1);
      const rampHeights = ramp.map((f) => f.h);
      let dupes = 0;
      for (let i = 1; i < rampHeights.length; i += 1) if (rampHeights[i] === rampHeights[i - 1]) dupes += 1;
      return {
        frames: frames.length,
        rampFrames: ramp.length,
        distinctHeights: new Set(rampHeights).size,
        duplicateConsecutive: dupes,
        monotonic: rampHeights.every((h, i) => i === 0 || h >= rampHeights[i - 1]),
        spanMs: ramp.at(-1).at - ramp[0].at,
        leadMs: ramp[0].at - frames[0].at,
        leadFrames: firstMotion,
        rampFrom: rampHeights[0],
        rampTo: target,
      };
    };

    const runs = [];
    for (let i = 0; i < 3; i += 1) runs.push(await measureOnce());
    const usable = runs.filter((r) => !r.error);
    if (usable.length < runs.length) return { pass: false, reason: 'a transition was never measured', runs };

    const median = (pick) => [...usable.map(pick)].sort((a, b) => a - b)[1];
    const worst = (pick) => Math.max(...usable.map(pick));
    const distinct = median((r) => r.distinctHeights);
    const dupes = median((r) => r.duplicateConsecutive);
    return {
      pass:
        distinct >= 7 && distinct <= 16
        && dupes <= 2
        && usable.every((r) => r.monotonic)
        && worst((r) => r.spanMs) <= 260
        && worst((r) => r.leadMs) <= 100,
      runs,
      distinctHeights: distinct,
      duplicateConsecutive: dupes,
      worstDuplicateConsecutive: worst((r) => r.duplicateConsecutive),
      worstSpanMs: worst((r) => r.spanMs),
      worstLeadMs: worst((r) => r.leadMs),
      budget: {
        distinctHeights: '7-16 (median of 3)',
        duplicateConsecutive: '<=2 (median of 3)',
        monotonic: 'every run',
        spanMs: '<=260 (worst)',
        leadMs: '<=100 (worst)',
      },
    };
  });

  await step('set_mode compact', async () => {
    const r = await d.setMode('compact');
    return { pass: Math.abs(r.to - 74) <= 6, ...r };
  });

  /** A capture that returns bytes is not the same as a capture that shows the app. */
  await step('palette screenshot', async () => {
    const r = await d.screenshot({ scope: 'palette' });
    return { pass: (r.bytes ?? 0) > 1000 && r.distinctColours >= 8 && r.opaqueFraction > 0.5, budget: { distinctColours: '>=8', opaqueFraction: '>0.5' }, ...r, base64: undefined };
  });

  await step('desktop screenshot', async () => {
    const r = await d.screenshot({ scope: 'desktop' });
    return { pass: (r.bytes ?? 0) > 1000 && r.distinctColours >= 8 && r.opaqueFraction > 0.5, budget: { distinctColours: '>=8', opaqueFraction: '>0.5' }, ...r, base64: undefined };
  });

  await step('OS click focuses input', async () => {
    const r = await d.clickElement('#search-input');
    /**
     * Bit-exact equality of `GetCursorPosition` against the computed point is not the invariant
     * worth asserting: CSS centre → physical → SendInput's 16-bit normalised absolute move is a
     * few px off by construction, and the window itself can shift between the rect read and the
     * click. The failure this step exists to catch is mixing DPI-unaware and DPI-aware
     * coordinates, which is wrong by ~20% of the value — hundreds of px — so 6 px of slack still
     * cannot hide it, and the focus read has to agree.
     */
    const dx = Math.abs(r.cursor.x - r.point.x);
    const dy = Math.abs(r.cursor.y - r.point.y);
    return { pass: r.focused === 'search-input' && dx <= 6 && dy <= 6, drift: { dx, dy }, ...r };
  });

  /**
   * Target a control the way a person names it, through the accessibility tree.
   *
   * This is the capability the old `ax_snapshot` claimed not to have: both the harness docs
   * and `docs/windows-ui-harness.md` recorded that `Accessibility.getFullAXTree` returns 0
   * nodes here, which is why every target had to be a CSS selector. That measurement was
   * taken without `Accessibility.enable`, which is what switches the tree on for a CDP read.
   * With it, the tree carries `textbox "Search for files, tools, actions..."` — a role and
   * an accessible name, where `#search-input` was a guess at a class the caller could not
   * see and that a restyle would break.
   *
   * The search field is the target because it is the one control that exists in both
   * window modes; the footer buttons only exist in expanded mode, and a step that depends
   * on which mode the previous step happened to leave behind is a flake, not a gate.
   */
  await step('click by accessible role', async () => {
    const r = await d.clickRole('textbox', 'Search for files');
    // Keep a slice of `available`: it is what makes a miss diagnosable from the transcript
    // alone, which is the entire reason the handler collects it.
    return { pass: r.clicked === true && !!r.rect, ...r, available: r.available?.slice(0, 10) };
  });

  await step('per-char typing + results', async () => {
    const t = await d.typeText(SELFTEST_QUERY);
    /**
     * Poll for a row floor rather than waiting on `settled`. `searching` is the body text
     * containing "Searching", and it reads false *before* the debounce starts: measured
     * `rows=0 searching=false` at t+0, `rows=1 searching=true` from t+400, and
     * `rows=47 searching=false` at t+1600. Waiting for `settled` therefore returned
     * instantly on the pre-search state and counted 0 rows, and waiting for `hasRows`
     * returned on the synthetic `Search web for` action before any file arrived. The
     * poll is bounded and reports whatever it ended with, so an index that cannot satisfy
     * the floor fails here with the count visible, rather than surfacing later as a
     * mystery in the selection step.
     */
    let st = await d.readState('state');
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline && st.rows.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      st = await d.readState('state');
    }
    return {
      pass: t.inputValue === SELFTEST_QUERY && st.rows.length >= 2,
      query: SELFTEST_QUERY,
      typed: t.inputValue,
      focused: t.focused,
      rowCount: st.rows.length,
      precondition: '>= 2 selectable rows for the ArrowDown step',
    };
  });

  /**
   * The privacy gate, proven able to say no, with no dependence on what Everything happens
   * to have indexed.
   *
   * The gate used to read "every visible row contains the repo root", which cannot pass on a
   * result set that legitimately spans drives, and which flagged the palette's own chrome
   * row — `🌐 Search web for "…" Open in default browser Action`, containing no path at all —
   * as a leak. It now matches actual filesystem paths, and the live frame-write step below
   * depends on that being right.
   */
  await step('privacy gate says no', async () => {
    const repo = d.REPO;
    const cases = [
      { label: 'a path inside the repo is allowed', text: `📄 a.png ${repo}\\tmp\\a.png PNG Image Ask ↵`, expect: 0 },
      { label: 'the repo root matches case-insensitively', text: `${repo.toUpperCase()}\\tmp\\a.png`, expect: 0 },
      { label: 'a user profile path is refused', text: '📄 b.log C:\\Users\\someone\\AppData\\Local\\b.log LOG File Ask ↵', expect: 1 },
      { label: 'another drive is refused', text: `test_electron E:\\test_electron\\ Folder Ask →`, expect: 1 },
      { label: 'a UNC path is refused', text: '\\\\fileserver\\share\\secret.docx', expect: 1 },
      { label: 'chrome with no path is not a leak', text: '🌐 Search web for "x" Open in default browser Action ↵', expect: 0 },
    ];
    const actual = cases.map((c) => ({ ...c, got: d.foreignPaths([c.text], repo).length }));
    return { pass: actual.every((c) => c.got === c.expect), cases: actual };
  });

  await step('ArrowDown moves selection', async () => {
    const before = (await d.readState('state')).selectedText;
    await d.pressKey('down');
    // `useKeyboard` commits the new index inside `startTransition`, so the state snapshot the
    // keypress itself returns is taken before the row repaints — this step compared two identical
    // pre-paint frames and reported a working palette as broken for 42 ms. Poll the named read
    // instead; a selection that genuinely never moves still fails, after the settle window.
    let after = before;
    for (let attempt = 0; attempt < 12 && after === before; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      after = (await d.readState('state')).selectedText;
    }
    // Identity, not count: the count stays 1 while the highlighted row changes.
    return { pass: !!after && after !== before, before, after };
  });

  /**
   * The write path, with the query cleared first — so this step runs *after* the steps that
   * need results on screen. Everything indexes every drive, so a frame of live results is
   * *supposed* to be refused; the point here is that the frame actually lands on disk, which
   * is the half of the contract the old step never proved, because it passed on the refusal
   * branch and wrote nothing. Placed last among the driving steps for the same reason: it
   * clears the input, and the selection step before it needs rows to exist.
   */
  await step('frame write behind the gate', async () => {
    await d.clearInput();
    const r = await d.saveFrame('selftest-frame', { scope: 'palette' });
    return { pass: !!r.saved, ...r };
  });

  await step('no DOM-level input in harness', async () => {
    const hits = await guardNoDomInput();
    return { pass: hits.length === 0, hits };
  });

  const ok = results.every((r) => r.pass);
  return { ok, results };
}

/**
 * Flags, or one JSON blob. `--key value` and `--key=value` both work, and a value that
 * round-trips exactly through `Number` becomes a number, so `--timeout 5000` and
 * `{"timeoutMs":5000}` agree without the caller having to know which.
 *
 * The round-trip test is what keeps this safe for `type`: "007" does not survive
 * `String(Number("007")) === "007"`, so a zero-padded filename stays a string and is
 * typed as the zero-padded filename.
 */
function coerceFlag(value) {
  if (value === undefined) return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return String(n) === value.trim() ? n : value;
}

function parseArgs(argv) {
  if (argv.length && argv[0].trimStart().startsWith('{')) return { args: JSON.parse(argv[0]) };
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      args[token.slice(2, eq)] = coerceFlag(token.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    // A valueless flag is boolean true. Two rules that matter: the *first* `--flag` must
    // not be consumed while testing for a JSON blob (which silently dropped every first
    // flag), and a following `--flag` is never this flag's value.
    if (next === undefined || next.startsWith('--')) {
      args[token.slice(2)] = true;
      continue;
    }
    args[token.slice(2)] = coerceFlag(next);
    i += 1;
  }
  return { args };
}

const USAGE = `usage: node scripts/harness/cli.mjs <${Object.keys(VERBS).join('|')}|selftest> [--flag value | '{"json":"args"}']`;

async function main() {
  const [verb, ...rest] = process.argv.slice(2);
  if (!verb || verb === 'help') {
    console.log(USAGE);
    return;
  }
  if (verb === 'selftest') {
    let result;
    try {
      result = await selftest();
    } finally {
      // The session holds an open CDP socket; without this the process prints its answer
      // and then never exits.
      await d.closeSession();
    }
    const { writeFile, mkdir } = await import('fs/promises');
    await mkdir(d.TMP, { recursive: true });
    await writeFile(join(d.TMP, 'selftest.json'), JSON.stringify(result, jsonSafe, 2));
    console.log(`\n${result.ok ? 'SELFTEST PASSED' : 'SELFTEST FAILED'} — transcript at ${join(d.TMP, 'selftest.json')}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  const entry = VERBS[verb];
  if (!entry) {
    console.error(`unknown verb "${verb}"\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  let args;
  try {
    args = parseArgs(rest).args;
  } catch (e) {
    console.error(`could not parse arguments: ${e.message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  let out;
  try {
    out = await entry.run(args);
  } catch (e) {
    // Previously an unhandled rejection: a raw stack trace on stderr and a non-JSON stdout,
    // which is the worst possible shape for the agent that invoked this.
    console.log(JSON.stringify({ error: String(e.message ?? e) }, jsonSafe, 1));
    console.error(String(e.message ?? e));
    process.exitCode = 1;
    await d.closeSession();
    return;
  }
  const ok = entry.ok(out, args);
  console.log(JSON.stringify(out, jsonSafe, 1));
  process.exitCode = ok ? 0 : 1;
  await d.closeSession();
}

try {
  await main();
} catch (e) {
  console.error(String(e?.stack ?? e));
  process.exitCode = 1;
}
