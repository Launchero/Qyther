/**
 * Ad-hoc driver for poking the live palette from a REPL. `cli.mjs` is the supported
 * entrypoint; this exists only because importing `driver.mjs` directly is convenient
 * when experimenting with several calls in one process.
 *
 * It must close the session: `driver.preflight` caches an open CDP socket, and without
 * this the process prints its answer and then never exits — the exact hang the harness
 * contract warns about, reproduced by the simplest possible script.
 */
import { closeSession, readState, setMode, typeText, pressKey, clearInput } from './driver.mjs';

const verb = process.argv[2];
const run = async () => {
  switch (verb) {
    case 'expanded': return setMode('expanded');
    case 'compact': return setMode('compact');
    case 'state': return readState('state');
    case 'type': return typeText(process.argv[3] ?? '');
    case 'key': return pressKey(process.argv[3] ?? '');
    case 'clear': return clearInput();
    default: throw new Error(`unknown verb "${verb ?? ''}" — expanded|compact|state|type|key|clear`);
  }
};

try {
  console.log(JSON.stringify(await run()));
} catch (e) {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
} finally {
  await closeSession();
}
