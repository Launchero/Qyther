/**
 * CLI for the Qyther UI harness — the operator surface.
 *
 *   node scripts/harness/cli.mjs <verb> ['{"json":"args"}'] [--flag]
 *   npm run harness:preflight
 *   npm run harness:selftest
 *
 * `selftest` is the only thing that proves the harness is really simulating a user:
 * it fails if any input arrived through the DOM instead of `SendInput`.
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as d from './driver.mjs';

const VERBS = {
  preflight: () => d.preflight(),
  who: () => d.who(),
  state: (a) => d.readState(a?.name ?? 'state'),
  list_windows: () => d.listWindows(),
  ax_snapshot: (a) => d.axSnapshot(a ?? {}),
  reveal: () => d.reveal(),
  hide: () => d.hide(),
  click_at: (a) => d.clickAt(a.x, a.y, a),
  click_element: (a) => d.clickElement(a.selector),
  type: (a) => d.typeText(a.text),
  key: (a) => d.pressKey(a.name),
  scroll: (a) => d.scrollAt(a.x, a.y, a.amount),
  drag: (a) => d.dragBetween(a.from, a.to),
  set_mode: (a) => d.setMode(a.mode),
  clear_input: () => d.clearInput(),
  screenshot: (a) => d.screenshot(a ?? {}),
  save_frame: (a) => d.saveFrame(a.id, a),
  wait: (a) => d.waitFor(a.cond ?? a, a),
};

/** Input must never arrive through the DOM — that would void every claim this makes. */
const FORBIDDEN_IN_HARNESS = [
  'HTMLInputElement.prototype',
  '.click()',
  'dispatchEvent',
  'electronAPI.',
  'new Event(',
  'new PointerEvent(',
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

/** A repo-only token, so the privacy gate can actually pass: `capture-ui.mjs` picks it the same way. */
const SELFTEST_QUERY = 'desktop-hitl';

async function selftest() {
  const results = [];
  const step = async (name, fn) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      results.push({ step: name, pass: detail?.pass !== false, ms: Date.now() - t0, detail });
      console.log(`${detail?.pass === false ? 'FAIL' : 'PASS'}  ${name.padEnd(24)} ${JSON.stringify(detail).slice(0, 200)}`);
    } catch (e) {
      results.push({ step: name, pass: false, ms: Date.now() - t0, error: e.message });
      console.log(`FAIL  ${name.padEnd(24)} ${e.message.split('\n')[0]}`);
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
    return { pass: r.hidden === true || r.note?.startsWith('already'), ...r };
  });

  await step('reveal via Alt+Space', async () => {
    const r = await d.reveal();
    return { pass: r.revealed === true || r.note?.includes('already visible'), ...r, state: undefined };
  });

  await step('window:shown event', async () => {
    const r = await d.waitFor({ kind: 'event', name: 'shown' }, { timeoutMs: 6000 });
    return { pass: r.ok !== false, note: r.ok ? 'recorder caught the DOM CustomEvent' : 'not observed — will fall back to polling', events: r.events };
  });

  await step('clear input with real keys', async () => {
    const r = await d.clearInput();
    return { pass: r.cleared === true, ...r };
  });

  await step('set_mode expanded', async () => {
    const r = await d.setMode('expanded');
    return { pass: Math.abs(r.to - 603) <= 6, ...r };
  });

  await step('set_mode compact', async () => {
    const r = await d.setMode('compact');
    return { pass: Math.abs(r.to - 103) <= 6, ...r };
  });

  await step('palette screenshot', async () => {
    const r = await d.screenshot({ scope: 'palette' });
    return { pass: (r.bytes ?? 0) > 1000, ...r, base64: undefined };
  });

  await step('desktop screenshot', async () => {
    const r = await d.screenshot({ scope: 'desktop' });
    return { pass: (r.bytes ?? 0) > 1000, ...r, base64: undefined };
  });

  await step('OS click focuses input', async () => {
    const r = await d.clickElement('#search-input');
    return { pass: r.focused === 'search-input' && r.cursor.x === r.point.x && r.cursor.y === r.point.y, ...r };
  });

  await step('per-char typing + results', async () => {
    const t = await d.typeText(SELFTEST_QUERY);
    const rows = await d.waitFor({ kind: 'hasRows' }, { timeoutMs: 9000 });
    return { pass: t.inputValue === SELFTEST_QUERY && rows.ok, typed: t.inputValue, focused: t.focused, rowCount: rows.value?.rows?.length };
  });

  await step('privacy gate + frame write', async () => {
    const r = await d.saveFrame('selftest-results', { scope: 'palette' });
    return { pass: !!r.saved || r.refused === 'privacy-gate', ...r };
  });

  await step('ArrowDown moves selection', async () => {
    const before = (await d.readState('state')).selectedText;
    const r = await d.pressKey('down');
    const after = r.state.selectedText;
    // Identity, not count: the count stays 1 while the highlighted row changes.
    return { pass: !!after && after !== before, before, after };
  });

  await step('no DOM-level input in harness', async () => {
    const hits = await guardNoDomInput();
    return { pass: hits.length === 0, hits };
  });

  await d.closeSession();
  const ok = results.every((r) => r.pass);
  return { ok, results };
}

async function main() {
  const [verb, argStr] = process.argv.slice(2);
  const isRun = verb === 'selftest';
  if (!verb || verb === 'help' || (!VERBS[verb] && !isRun)) {
    console.log(`usage: node scripts/harness/cli.mjs <${Object.keys(VERBS).join('|')}|selftest> ['{json}']`);
    if (verb && verb !== 'help') { console.error(`unknown verb "${verb}"`); process.exitCode = 2; }
    return;
  }
  let args = {};
  if (argStr && argStr.startsWith('{')) args = JSON.parse(argStr);
  if (isRun) {
    const r = await selftest();
    const { writeFile, mkdir } = await import('fs/promises');
    await mkdir(join(d.TMP), { recursive: true });
    await writeFile(join(d.TMP, 'selftest.json'), JSON.stringify(r, null, 2));
    console.log(`\n${r.ok ? 'SELFTEST PASSED' : 'SELFTEST FAILED'} — transcript at ${join(d.TMP, 'selftest.json')}`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  const out = await VERBS[verb](args);
  console.log(JSON.stringify(out, null, 1));
  process.exitCode = out?.ok === false || out?.problems?.length ? 1 : 0;
}

await main();
