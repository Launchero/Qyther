/**
 * MCP front door for the Qyther UI harness, so an agent can drive the live app with
 * tool calls instead of shell invocations.
 *
 * Security stance — this server is the part an untrusted caller talks to, so:
 * - it exposes a fixed table of verbs and NO caller-supplied code. There is no
 *   `evaluate`, no `expression`, no `script`, no `ipc_invoke`. The app's
 *   `command:execute` bridge is reachable from any DevTools `Runtime.evaluate`, and
 *   main only learned to police it recently; the wire format here never carries
 *   JavaScript, so the hole is not what a driver walks into.
 * - no `close_window` and no `quit`: a hidden palette that gets closed takes the whole
 *   app down with it (`src/main/windows.ts` only preventDefaults the close while
 *   visible; `src/main/main.ts` quits on `window-all-closed`).
 * - `click_at` defaults to palette-only; `anywhere` must be passed deliberately.
 *
 * Lives in `scripts/`, never `src/`: `src/main/services/mcp/AGENTS.md` requires
 * `grep -rn "McpServer|StdioServerTransport" src/` to stay empty.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as d from './driver.mjs';

const str = { type: 'string' };
const num = { type: 'number' };
const obj = { type: 'object' };

/**
 * Numeric arguments arrive as whatever JSON the caller sent, and `NaN` does not fail
 * loudly downstream — it becomes a dead `SendInput` or a comparison that is never true.
 * Reject it at the boundary instead.
 */
function asNumber(value, what) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${what} must be a number, got ${JSON.stringify(value)}`);
  return n;
}

const TOOLS = [
  { name: 'preflight', description: 'Gate: refuses unless exactly one Qyther palette window is owned by the pid serving CDP, DPI scale agrees with devicePixelRatio, and the artifact drive has room. Call first.', schema: { type: 'object' } },
  { name: 'who', description: 'pid, mode (dev/packaged), CDP endpoint+port+owner, window rect, window DPI, measured scale, virtual screen.', schema: { type: 'object' } },
  { name: 'state', description: 'Read DOM ground truth: hidden, size, theme, result rows, focused element id, input value, searching/dialog/loading flags.', schema: { type: 'object', properties: { name: { ...str, enum: ['state', 'geometry', 'frames'] } } } },
  { name: 'list_windows', description: 'All top-level windows with title, Win32 class, visibility, pid, rect and per-window DPI.', schema: { type: 'object' } },
  { name: 'ax_snapshot', description: 'The accessibility tree as a user perceives it: role plus the Chromium-computed accessible name plus a CSS rect for each control. Target controls with click_role rather than inventing CSS selectors.', schema: { type: 'object', properties: { limit: num } } },
  { name: 'click_role', description: 'SendInput-click a control by accessibility role and name, e.g. role "button" name "Keyboard shortcuts". Survives a restyle that renames a class. On no match it returns everything that was on screen.', schema: { type: 'object', properties: { role: str, name: str }, required: ['role', 'name'] } },
  { name: 'reveal', description: 'Show the palette with a real Alt+Space through the low-level hook. No-ops when already visible, because the shortcut is a toggle.', schema: { type: 'object' } },
  { name: 'hide', description: 'Hide it with a real Escape keypress — focuses the window first, since OS keystrokes only reach the foreground window.', schema: { type: 'object' } },
  { name: 'click_at', description: 'SendInput click at PHYSICAL screen pixels. Refuses points outside the palette rect unless anywhere is true.', schema: { type: 'object', properties: { x: num, y: num, button: { type: 'string', enum: ['left', 'right'] }, anywhere: { type: 'boolean' } }, required: ['x', 'y'] } },
  { name: 'click_element', description: 'Move the real cursor onto a CSS selector\'s centre (converted through the measured DPI scale) and SendInput-click it. Never a synthetic DOM click.', schema: { type: 'object', properties: { selector: str }, required: ['selector'] } },
  { name: 'type_text', description: 'Type with per-character KEYEVENTF_UNICODE SendInput, so React sees real input events.', schema: { type: 'object', properties: { text: str }, required: ['text'] } },
  { name: 'press_key', description: 'Real virtual-key press: escape, enter, tab, arrows, backspace, a-z, 0-9.', schema: { type: 'object', properties: { name: str }, required: ['name'] } },
  { name: 'scroll', description: 'Mouse-wheel SendInput at physical pixels.', schema: { type: 'object', properties: { x: num, y: num, amount: num }, required: ['x', 'y'] } },
  { name: 'set_mode', description: 'Real Alt+Shift+M, the app\'s own mode shortcut, then wait for the height to settle.', schema: { type: 'object', properties: { mode: { type: 'string', enum: ['compact', 'expanded'] } }, required: ['mode'] } },
  { name: 'clear_input', description: 'Clear the query with Ctrl+A then Delete. Do this before set_mode: a live result list auto-grows the window and fights the mode change.', schema: { type: 'object' } },
  { name: 'screenshot', description: 'scope=palette: the app\'s own pixels via CDP (true alpha). scope=desktop: GDI grab of the real composited region, which is what a user sees including occlusion. Refuses fast when hidden — a hidden window makes CDP capture hang.', schema: { type: 'object', properties: { scope: { type: 'string', enum: ['palette', 'desktop'] }, inline: { type: 'boolean' } } } },
  { name: 'save_frame', description: 'Write a frame to tmp/harness behind the privacy gate: refuses if any visible result row falls outside this repo, because Everything indexes every drive.', schema: { type: 'object', properties: { id: str, scope: { type: 'string', enum: ['palette', 'desktop'] } }, required: ['id'] } },
  { name: 'wait_for', description: 'Wait on a closed condition vocabulary: visible | hidden | hasRows | settled | focused{id} | value{value} | mode{mode} | event{name}.', schema: { type: 'object', properties: { kind: { type: 'string', enum: ['visible', 'hidden', 'hasRows', 'settled', 'focused', 'value', 'mode', 'event'] }, id: str, value: str, mode: { type: 'string', enum: ['compact', 'expanded'] }, name: str, timeoutMs: num }, required: ['kind'] } },
];

const HANDLERS = {
  preflight: () => d.preflight(),
  who: () => d.who(),
  state: (a) => d.readState(a?.name ?? 'state'),
  list_windows: () => d.listWindows(),
  ax_snapshot: (a) => d.axSnapshot(a ?? {}),
  click_role: (a) => d.clickRole(a.role, a.name),
  reveal: () => d.reveal(),
  hide: () => d.hide(),
  click_at: (a) => d.clickAt(asNumber(a.x, 'x'), asNumber(a.y, 'y'), a),
  click_element: (a) => d.clickElement(a.selector),
  type_text: (a) => d.typeText(a.text),
  press_key: (a) => d.pressKey(a.name),
  scroll: (a) => d.scrollAt(asNumber(a.x, 'x'), asNumber(a.y, 'y'), a.amount === undefined ? -3 : asNumber(a.amount, 'amount')),
  set_mode: (a) => d.setMode(a.mode),
  clear_input: () => d.clearInput(),
  screenshot: (a) => d.screenshot(a ?? {}),
  save_frame: (a) => d.saveFrame(a.id, a),
  wait_for: (a) => d.waitFor(a, a),
};

const server = new Server(
  { name: 'qyther-ui-harness', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = HANDLERS[name];
  if (!handler) return { isError: true, content: [{ type: 'text', text: `unknown tool "${name}"` }] };
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await handler(args ?? {}), null, 1) }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: String(e.message ?? e) }] };
  }
});

await server.connect(new StdioServerTransport());
