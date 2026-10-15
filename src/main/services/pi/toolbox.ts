/**
 * Pi-native desktop toolbox: the 32 Windows tools as `AgentTool`s.
 *
 * This is a rewrite, not a wrapper, and it is now the **only** desktop tool surface:
 * `desktop-tools.ts` (zod + LangChain) and the whole planner/verifier/recovery ladder were
 * deleted at the cutover, so nothing here has a zod counterpart left to drift from.
 *
 * Three LangChain-era indirections are gone because `AgentTool` makes them unnecessary:
 *  - `inferStatusFromTool` (a tool-name string map) â†’ each tool reports `details.status`.
 *  - `DANGER_POLICY` (32 rows, consulted by name) â†’ `details.verifies` on the one tool
 *    that runs the pixel verifier. A tool cannot forget its own flag, so the
 *    exhaustiveness check that guarded the map is no longer needed.
 *  - the `_type: 'screenshot_result'` marker, which `desktop-agent.ts` string-matched to
 *    build a multimodal ToolMessage â†’ `screenshot` returns a real `ImageContent` block.
 *
 * Contract preserved from `desktop-tools.ts`: **tools never throw.** Every failure is
 * returned as readable text so the model can recover, which is also what
 * `AgentToolResult.isError` is for â€” failures set it rather than relying on a throw.
 */
import { Type, StringEnum } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";
import { clipboard } from "electron";
import type { UiPayload } from "../../../shared/ipc/ui-payload";
import type { Source } from "../../../shared/ipc/source";
import type { DesktopAdapter } from "../desktop/types";
import type { AccessibilityTreeAdapter } from "../desktop/accessibility-tree";
import { createLogger } from "../../utils/logger";

const log = createLogger("Pi");
/**
 * One toolbox entry.
 *
 * `AgentTool`'s `execute` is declared as a property, so under `strictFunctionTypes` its
 * `params: Static<TSchema>` (= `unknown`) is checked contravariantly and *no* concrete
 * `AgentTool[]` annotation accepts a tool that destructures its schema-derived params â€”
 * including `Agent.state.tools`. Re-declaring `execute` with **method** syntax (bivariant
 * parameters) and widening `params` to `any` is the escape. Each tool still declares its
 * real `parameters` schema inline, which stays the single source of truth for its
 * `execute` signature; nothing is hand-duplicated.
 */
export interface PiTool extends AgentTool {
  execute(
    toolCallId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate: see this interface's doc comment. Method-syntax bivariance is what makes it work.
    params: any,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<PiToolDetails>,
  ): Promise<AgentToolResult<PiToolDetails>>;
}

/** Mirrors `DesktopAgent`'s progress union (`desktop-agent.ts:100`). */
export type PiToolStatus =
  | "capturing"
  | "clicking"
  | "typing"
  | "scrolling"
  | "dragging"
  | "key_combo"
  | "window_management"
  | "complete"
  | "error";

export interface PiToolDetails {
  status: PiToolStatus;
  /** Run `GroundTruthVerifier` on this tool's result. Only `close_window` sets it. */
  verifies?: boolean;
  /**
   * A generative-UI payload to push to the renderer. Set only by the `pi/tools/ui-*`
   * family; the chat pump reads it off `tool_execution_end` and ships it in the
   * terminal chunk. This is what replaced `chatModel.withStructuredOutput(..., jsonMode)`
   * — the tool's `parameters` schema *is* the structured output, so the model fills it
   * and the payload rides the result instead of a second, parallel model round trip.
   */
  uiPayload?: UiPayload;
  /** Sources the model actually read, for `SourcesPanel`. Set by `pi/tools/web-*`. */
  sources?: Source[];
  [key: string]: unknown;
}

/** What a tool may add to `details` beyond the status it always reports. */
type DetailsExtra = Omit<PiToolDetails, "status">;

const errText = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

/**
 * Text-only result. Exported because the browser, document, web and ui toolboxes
 * (`pi/tools/*`) build their results through the same two helpers rather than each
 * inventing its own — one vocabulary, one never-throw contract, one status union.
 */
export function text(body: string, status: PiToolStatus, extra: DetailsExtra = {}): AgentToolResult<PiToolDetails> {
  return { content: [{ type: "text", text: body }], details: { status, ...extra } };
}

/** Failure the model can read and recover from. Never a throw. */
export function fail(prefix: string, e: unknown, extra: DetailsExtra = {}): AgentToolResult<PiToolDetails> {
  const body = `${prefix}: ${errText(e)}`;
  log.warn(`[PiTool] ${body}`);
  return { content: [{ type: "text", text: body }], details: { status: "error", ...extra }, isError: true };
}

/** `data:image/png;base64,AAA` -> Pi's `{ data, mimeType }`. */
function dataUrlToImage(dataUrl: string): { data: string; mimeType: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return { data: dataUrl, mimeType: "image/png" };
  return { data: match[2], mimeType: match[1] };
}

const EMPTY = Type.Object({}, { description: "This tool takes no arguments." });

/**
 * Abortable sleep. Pi passes an `AbortSignal` to every `execute`, and the poll loops below
 * are the only places a desktop run can sit for a long time without a network round trip —
 * without this, a Stop press or a stream timeout cannot unblock a `wait` that is mid-sleep.
 *
 * Exported so `cancel.test.ts` asserts this implementation rather than a copy of it.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** True once the run has been cancelled; poll loops check this between iterations. */
const isAborted = (signal?: AbortSignal): boolean => signal?.aborted === true;

// â”€â”€ Pointer + keyboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function screenshotTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "screenshot",
    label: "Screenshot",
    description:
      "Capture the current screen and return a description of what is visible. Optionally specify a monitor index (0 = primary).",
    parameters: Type.Object({
      monitorIndex: Type.Optional(Type.Number({ description: "Which monitor to capture (0 = primary)" })),
    }),
    async execute(_id, { monitorIndex }) {
      try {
        const result = await adapter.captureScreen(monitorIndex);
        const primary = result.monitors[0];
        if (!primary?.dataUrl) return fail("Screenshot failed: no image data captured", "empty");
        const summary = `Screenshot captured: ${primary.width}x${primary.height}${
          result.monitors.length > 1 ? ` (${result.monitors.length} monitors total)` : ""
        }. Monitor names: ${result.monitors.map((m) => m.name).join(", ")}.`;
        return {
          content: [{ type: "text", text: summary }, { ...dataUrlToImage(primary.dataUrl), type: "image" as const }],
          details: { status: "capturing" },
        };
      } catch (e) {
        return fail("Screenshot failed", e);
      }
    },
  };
}

function PointTool(
  name: string,
  label: string,
  description: string,
  status: PiToolStatus,
  run: (x: number, y: number) => Promise<string>,
): PiTool {
  return {
    name,
    label,
    description,
    parameters: Type.Object({
      x: Type.Number({ description: "X coordinate in pixels from left edge" }),
      y: Type.Number({ description: "Y coordinate in pixels from top edge" }),
    }),
    async execute(_id, { x, y }) {
      try {
        return text(await run(x, y), status);
      } catch (e) {
        return fail(`${label} failed`, e);
      }
    },
  };
}

export function clickTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "click",
    label: "Click",
    description:
      "Click at a specific (x, y) coordinate on the screen. Coordinates are in screen pixels from the top-left corner.",
    parameters: Type.Object({
      x: Type.Number({ description: "X coordinate in pixels from left edge" }),
      y: Type.Number({ description: "Y coordinate in pixels from top edge" }),
      button: Type.Optional(StringEnum(["left", "right"], { description: "Mouse button (default: left)" })),
    }),
    async execute(_id, { x, y, button }) {
      try {
        await adapter.click(x, y, (button ?? "left") as "left" | "right");
        return text(`Clicked at (${x}, ${y}) with ${button ?? "left"} button.`, "clicking");
      } catch (e) {
        return fail("Click failed", e);
      }
    },
  };
}

export function doubleClickTool(adapter: DesktopAdapter): PiTool {
  return PointTool(
    "double_click",
    "Double-click",
    "Double-click at a specific (x, y) coordinate on the screen.",
    "clicking",
    async (x, y) => {
      await adapter.doubleClick(x, y);
      return `Double-clicked at (${x}, ${y}).`;
    },
  );
}

export function rightClickTool(adapter: DesktopAdapter) {
  return PointTool("right_click", "Right-click", "Right-click at coordinates to open context menu.", "clicking", async (x, y) => {
    await adapter.rightClick(x, y);
    return `Right-clicked at (${x}, ${y}).`;
  });
}

export function moveMouseTool(adapter: DesktopAdapter) {
  return PointTool("move_mouse", "Move mouse", "Move the mouse cursor to a specific (x, y) coordinate without clicking.", "clicking", async (x, y) => {
    await adapter.setCursorPosition(x, y);
    return `Mouse moved to (${x}, ${y}).`;
  });
}

export function hoverTool(adapter: DesktopAdapter): PiTool {
  return PointTool(
    "hover",
    "Hover",
    "Move the mouse to coordinates and hover briefly. Use to reveal tooltips, dropdown menus, or hover-triggered UI elements.",
    "clicking",
    async (x, y) => {
      await adapter.hover(x, y);
      return `Hovered at (${x}, ${y}). This reveals tooltips, dropdown menus, and hover-triggered elements.`;
    },
  );
}

export function scrollTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "scroll",
    label: "Scroll",
    description: "Scroll the mouse wheel at a specific position. Positive delta scrolls up, negative scrolls down.",
    parameters: Type.Object({
      x: Type.Number({ description: "X coordinate in pixels" }),
      y: Type.Number({ description: "Y coordinate in pixels" }),
      delta: Type.Number({ description: "Scroll amount (positive = up, negative = down)" }),
    }),
    async execute(_id, { x, y, delta }) {
      try {
        await adapter.scroll(x, y, delta);
        return text(`Scrolled at (${x}, ${y}) with delta ${delta} (positive = up, negative = down).`, "scrolling");
      } catch (e) {
        return fail("Scroll failed", e);
      }
    },
  };
}

export function dragTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "drag",
    label: "Drag",
    description: "Drag from one coordinate to another. Useful for moving files, selecting text, or dragging window elements.",
    parameters: Type.Object({
      fromX: Type.Number({ description: "Start X coordinate" }),
      fromY: Type.Number({ description: "Start Y coordinate" }),
      toX: Type.Number({ description: "End X coordinate" }),
      toY: Type.Number({ description: "End Y coordinate" }),
    }),
    async execute(_id, { fromX, fromY, toX, toY }) {
      try {
        await adapter.drag({ x: fromX, y: fromY }, { x: toX, y: toY });
        return text(`Dragged from (${fromX}, ${fromY}) to (${toX}, ${toY}).`, "dragging");
      } catch (e) {
        return fail("Drag failed", e);
      }
    },
  };
}

export function typeTextTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "type_text",
    label: "Type text",
    description: "Type the given text string character by character. Use this to fill in text fields or type into applications.",
    parameters: Type.Object({ text: Type.String({ description: "The text to type" }) }),
    async execute(_id, { text: body }) {
      try {
        await adapter.typeText(body);
        const shown = body.length > 100 ? `${body.slice(0, 100)}...` : body;
        return text(`Typed text: "${shown}"`, "typing");
      } catch (e) {
        return fail("Type text failed", e);
      }
    },
  };
}

export function keyComboTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "key_combo",
    label: "Key combo",
    description: "Press a combination of keys like ctrl+c, alt+tab, win+r, etc. Keys are specified as an array of key names.",
    parameters: Type.Object({
      keys: Type.Array(Type.String(), { description: 'Array of key names to press (e.g., ["ctrl", "c"])' }),
    }),
    async execute(_id, { keys }) {
      try {
        await adapter.pressKeys(keys);
        return text(`Pressed key combination: ${keys.join("+")}`, "key_combo");
      } catch (e) {
        return fail("Key combo failed", e);
      }
    },
  };
}

const VIRTUAL_KEYS: Record<string, number> = {
  ctrl: 0x11, alt: 0x12, shift: 0x10, win: 0x5b,
  left: 0x25, right: 0x27, up: 0x26, down: 0x28,
  space: 0x20, tab: 0x09, enter: 0x0d, escape: 0x1b,
};

async function setVirtualKey(key: string, phase: "down" | "up"): Promise<void> {
  const vk = VIRTUAL_KEYS[key.toLowerCase()];
  if (vk === undefined) return;
  const { pressKeyRaw } = await import("../desktop/input-simulation");
  await pressKeyRaw(vk, phase);
}

export function holdKeyTool(): PiTool {
  return {
    name: "hold_key",
    label: "Hold key",
    description:
      'Press and hold or release a key. Use "down" to press and hold, "up" to release. Useful for drag operations with modifiers (e.g., holding shift while dragging).',
    parameters: Type.Object({
      key: Type.String({
        description: "Key name (ctrl, alt, shift, win, left, right, up, down, space, tab, enter, escape)",
      }),
      action: StringEnum(["down", "up"], { description: "Press down or release the key" }),
    }),
    async execute(_id, { key, action }) {
      try {
        await setVirtualKey(key, action);
        return text(
          action === "down" ? `Holding key "${key}" down.` : `Released key "${key}".`,
          "key_combo",
        );
      } catch (e) {
        return fail("Hold key failed", e);
      }
    },
  };
}

// â”€â”€ Screen reads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getScreenTextTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "get_screen_text",
    label: "Get screen text",
    description: "Extract all visible text from the current screen using OCR. Returns the text content found on screen.",
    parameters: EMPTY,
    async execute() {
      try {
        const body = await adapter.getScreenText();
        const clipped = body.length > 2000 ? `${body.slice(0, 2000)}\n...(truncated)` : body;
        return text(`Screen text extracted:\n${clipped}`, "capturing");
      } catch (e) {
        return fail("Screen text extraction failed", e);
      }
    },
  };
}

async function ocrScreenText(): Promise<string> {
  const { captureAllScreens } = await import("../desktop/screenshot-capture");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const primary = (await captureAllScreens()).monitors[0];
    if (!primary) return "";
    const base64 = primary.dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const { data } = await worker.recognize(Buffer.from(base64, "base64"));
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export function waitTool(): PiTool {
  return {
    name: "wait",
    label: "Wait",
    description: "Wait for a condition: duration, window change, or text appearing on screen. Use to pause while apps load.",
    parameters: Type.Object({
      type: StringEnum(["duration", "window_change", "text_appears"], { description: "Wait condition type" }),
      duration: Type.Optional(Type.Number({ description: "Duration in milliseconds (for duration type)" })),
      textPattern: Type.Optional(Type.String({ description: "Text pattern to wait for (for text_appears type)" })),
      timeout: Type.Optional(Type.Number({ description: "Max wait time in ms (default: 10000)" })),
    }),
    async execute(_id, { type, duration, textPattern, timeout }, signal) {
      const budget = timeout ?? 10000;
      const started = Date.now();
      try {
        if (type === "duration") {
          const ms = duration ?? 1000;
          await sleep(ms, signal);
          return text(isAborted(signal) ? "Wait cancelled." : `Waited for ${ms}ms.`, "complete");
        }
        const { getForegroundWindowInfo } = await import("../desktop/input-simulation");
        if (type === "window_change") {
          const before = (await getForegroundWindowInfo()).title;
          while (!isAborted(signal) && Date.now() - started < budget) {
            const now = (await getForegroundWindowInfo()).title;
            if (now !== before) return text(`Window changed after ${Date.now() - started}ms. New: "${now}".`, "complete");
            await sleep(500, signal);
          }
          return text(
            isAborted(signal) ? "Wait cancelled." : `Timeout: no window change within ${budget}ms.`,
            "complete",
          );
        }
        if (!textPattern) return fail("Error: textPattern required for text_appears", "missing argument");
        while (!isAborted(signal) && Date.now() - started < budget) {
          if ((await ocrScreenText()).toLowerCase().includes(textPattern.toLowerCase())) {
            return text(`Text "${textPattern}" appeared on screen after ${Date.now() - started}ms.`, "complete");
          }
          await sleep(500, signal);
        }
        return text(
          isAborted(signal) ? "Wait cancelled." : `Timeout: text "${textPattern}" did not appear within ${budget}ms.`,
          "complete",
        );
      } catch (e) {
        return fail("Wait failed", e);
      }
    },
  };
}

// â”€â”€ Windows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function handleParam() {
  return Type.String({ description: 'Numeric handle from get_window_list (e.g. "1", "2", "3")' });
}

function windowTool(
  name: string,
  label: string,
  description: string,
  run: (handle: string) => Promise<string>,
  verifies = false,
): PiTool {
  return {
    name,
    label,
    description,
    parameters: Type.Object({ windowHandle: handleParam() }),
    async execute(_id, { windowHandle }) {
      // `verifies` is omitted rather than set false, so "the agent asked and the answer was
      // no" is distinguishable from "this tool never opts into verification".
      const extra: DetailsExtra = verifies ? { verifies: true } : {};
      try {
        return text(await run(windowHandle), "window_management", { ...extra, handle: windowHandle });
      } catch (e) {
        return fail(`${label} failed`, e, { ...extra, handle: windowHandle });
      }
    },
  };
}

export function getWindowInfoTool(adapter: DesktopAdapter): PiTool {
  return {
    name: "get_window_info",
    label: "Get window info",
    description: "Get information about the currently active/focused window including its title.",
    parameters: EMPTY,
    async execute() {
      try {
        const info = await adapter.getWindowInfo();
        return text(`Active window: "${info.title}"`, "window_management");
      } catch (e) {
        return fail("Window info failed", e);
      }
    },
  };
}

export function getWindowListTool(): PiTool {
  return {
    name: "get_window_list",
    label: "List windows",
    description:
      'List all visible windows on desktop with titles, dimensions, and numeric handles. Handles are shown in brackets (e.g. "[1]", "[2]", "[3]") and are used by window management tools (focus_window, minimize_window, etc.).',
    parameters: EMPTY,
    async execute() {
      try {
        const { listWindows } = await import("../desktop/input-simulation");
        const windows = await listWindows();
        if (windows.length === 0) return text("No visible windows found.", "window_management");
        const rows = windows.slice(0, 20).map((w) => {
          const dims = w.width > 0 ? ` (${w.width}x${w.height})` : "";
          return `[${w.handle}] "${w.title}"${dims}`;
        });
        return text(`Found ${windows.length} windows:\n${rows.join("\n")}`, "window_management");
      } catch (e) {
        return fail("List windows failed", e);
      }
    },
  };
}

export function focusWindowTool(adapter: DesktopAdapter): PiTool {
  return windowTool(
    "focus_window",
    "Focus window",
    'Bring a window to the foreground by its handle. Use get_window_list to find window handles (e.g. "1", "2", "3"). Required before interacting with elements in a background window.',
    async (handle) =>
      (await adapter.focusWindow(handle))
        ? "Brought window to foreground."
        : "Failed to focus window. The handle may be invalid or the window may not exist.",
  );
}

export function minimizeWindowTool(adapter: DesktopAdapter): PiTool {
  return windowTool(
    "minimize_window",
    "Minimize window",
    'Minimize a window by its handle. Use get_window_list to find window handles (e.g. "1", "2", "3"). This is far more reliable than clicking title bar minimize buttons.',
    async (handle) =>
      (await adapter.minimizeWindow(handle))
        ? "Window minimized successfully."
        : `Failed to minimize window (handle ${handle}). The window may be protected/sandboxed (like Edge browser), elevated (admin), or no longer exist. Try getting a fresh window list first.`,
  );
}

export function maximizeWindowTool(adapter: DesktopAdapter): PiTool {
  return windowTool(
    "maximize_window",
    "Maximize window",
    'Maximize a window by its handle. Use get_window_list to find window handles (e.g. "1", "2", "3"). This is far more reliable than clicking title bar maximize buttons.',
    async (handle) =>
      (await adapter.maximizeWindow(handle))
        ? "Window maximized successfully."
        : "Failed to maximize window. The handle may be invalid or the window may not exist.",
  );
}

export function restoreWindowTool(adapter: DesktopAdapter): PiTool {
  return windowTool(
    "restore_window",
    "Restore window",
    'Restore a minimized or maximized window to its normal size. Use get_window_list to find window handles (e.g. "1", "2", "3").',
    async (handle) =>
      (await adapter.restoreWindow(handle))
        ? "Window restored to normal size successfully."
        : "Failed to restore window. The handle may be invalid or the window may not exist.",
  );
}

/** The one tool that runs the pixel verifier â€” `details.verifies` replaces `DANGER_POLICY`. */
export function closeWindowTool(adapter: DesktopAdapter): PiTool {
  return windowTool(
    "close_window",
    "Close window",
    'Close a window gracefully by its handle via WM_CLOSE. Use get_window_list to find window handles (e.g. "1", "2", "3"). Use with caution â€” this may close applications with unsaved work.',
    async (handle) =>
      (await adapter.closeWindow(handle))
        ? "Window closed successfully. Sent WM_CLOSE to the window."
        : "Failed to close window. The handle may be invalid or the window may be unresponsive.",
    true,
  );
}

// â”€â”€ UI Automation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getElementInfoTool(a11y: AccessibilityTreeAdapter): PiTool {
  return {
    name: "get_element_info",
    label: "Get element info",
    description:
      "Get accessibility info about the currently focused UI element (name, role, position, state). Use this instead of screenshot for structured, precise element info.",
    parameters: EMPTY,
    async execute() {
      try {
        const el = await a11y.getFocusedElement();
        if (!el) return text("No element currently has keyboard focus.", "capturing");
        const b = el.boundingBox;
        const box = b.width > 0 ? ` (position: ${b.x},${b.y}, size: ${b.width}x${b.height})` : "";
        return text(
          `Focused element: "${el.name}" [${el.controlType}]${box}\nAutomationId: ${el.automationId || "none"}\nClass: ${el.className || "unknown"}\nEnabled: ${el.isEnabled}\nFocused: ${el.isFocused}`,
          "capturing",
        );
      } catch (e) {
        return fail("Get element info failed", e);
      }
    },
  };
}

export function clickElementTool(a11y: AccessibilityTreeAdapter): PiTool {
  return {
    name: "click_element",
    label: "Click element",
    description:
      "Click a UI Automation element directly by name. More reliable than coordinate-based clicking. Use when you know the element name from get_element_info.",
    parameters: Type.Object({ elementName: Type.String({ description: "Name of the UI element to click" }) }),
    async execute(_id, { elementName }) {
      try {
        return text(
          (await a11y.clickElement(elementName))
            ? `Clicked element "${elementName}" directly via UI Automation.`
            : `Could not click element "${elementName}" via UI Automation. Try clicking by coordinates instead.`,
          "clicking",
        );
      } catch (e) {
        return fail("Click element failed", e);
      }
    },
  };
}

export function searchElementsTool(a11y: AccessibilityTreeAdapter): PiTool {
  return {
    name: "search_elements",
    label: "Search elements",
    description:
      "Search the accessibility tree for UI elements by name substring or control type. Returns matching elements with positions and states. Use this to find buttons, text fields, or other UI elements before interacting with them.",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Partial name to search for (substring match)" })),
      controlType: Type.Optional(Type.String({ description: 'Control type to filter by (e.g., "Button", "Edit", "MenuItem")' })),
      maxResults: Type.Optional(Type.Number({ description: "Maximum number of results to return", default: 20 })),
    }),
    async execute(_id, { query, controlType, maxResults }) {
      try {
        const results = await a11y.searchElements(
          { name: query || undefined, controlType: controlType || undefined },
          maxResults || 20,
        );
        const label = query || controlType || "all elements";
        if (results.length === 0) return text(`No elements found matching "${label}".`, "capturing");
        const rows = results.slice(0, 15).map((el) => {
          const b = el.boundingBox;
          const box = b.width > 0 ? ` at (${b.x},${b.y}) ${b.width}x${b.height}` : "";
          return `  - "${el.name}" [${el.controlType}]${box}${el.isEnabled ? "" : " (disabled)"}`;
        });
        const more = results.length > 15 ? `\n  ... and ${results.length - 15} more` : "";
        return text(`Found ${results.length} element(s) matching "${label}":\n${rows.join("\n")}${more}`, "capturing");
      } catch (e) {
        return fail("Search elements failed", e);
      }
    },
  };
}

export function invokeElementTool(a11y: AccessibilityTreeAdapter): PiTool {
  return {
    name: "invoke_element",
    label: "Invoke element",
    description:
      "Invoke a UI element directly via its native automation handle using UI Automation InvokePattern. More reliable than coordinate-based clicks. Use handles returned by search_elements or get_element_info.",
    parameters: Type.Object({
      elementHandle: Type.String({ description: "Native element handle from search_elements or get_element_info" }),
    }),
    async execute(_id, { elementHandle }) {
      try {
        return text(
          (await a11y.invokeElement(elementHandle))
            ? `Invoked element (handle: ${elementHandle}) directly via UI Automation InvokePattern.`
            : `Could not invoke element (handle: ${elementHandle}). The element may not support InvokePattern. Try clicking by coordinates instead.`,
          "clicking",
        );
      } catch (e) {
        return fail("Invoke element failed", e);
      }
    },
  };
}

export function setElementValueTool(a11y: AccessibilityTreeAdapter): PiTool {
  return {
    name: "set_element_value",
    label: "Set element value",
    description:
      "Set the value of a text field directly via UI Automation ValuePattern. Faster and more reliable than typing character-by-character. Use handles from search_elements or get_element_info.",
    parameters: Type.Object({
      elementHandle: Type.String({ description: "Native element handle for the text field" }),
      value: Type.String({ description: "Text value to set" }),
    }),
    async execute(_id, { elementHandle, value }) {
      try {
        const shown = value.length > 100 ? `${value.slice(0, 100)}...` : value;
        return text(
          (await a11y.setElementValue(elementHandle, value))
            ? `Set element (handle: ${elementHandle}) value to "${shown}" via UI Automation ValuePattern.`
            : `Could not set element value (handle: ${elementHandle}). The element may be read-only or not support ValuePattern. Try typing with type_text instead.`,
          "typing",
        );
      } catch (e) {
        return fail("Set element value failed", e);
      }
    },
  };
}

export function getElementTextTool(a11y: AccessibilityTreeAdapter): PiTool {
  return {
    name: "get_element_text",
    label: "Get element text",
    description:
      "Extract text from a UI element directly via UI Automation TextPattern or ValuePattern. More reliable than OCR for standard UI elements. Use handles from search_elements or get_element_info.",
    parameters: Type.Object({
      elementHandle: Type.String({ description: "Native element handle for the element" }),
    }),
    async execute(_id, { elementHandle }) {
      try {
        const body = await a11y.getElementText(elementHandle);
        if (body === null) {
          return text(
            `Could not extract text from element (handle: ${elementHandle}). Try get_selected_text or OCR instead.`,
            "capturing",
          );
        }
        const clipped = body.length > 2000 ? `${body.slice(0, 2000)}\n...(truncated)` : body;
        return text(`Element text (handle: ${elementHandle}):\n${clipped || "(empty)"}`, "capturing");
      } catch (e) {
        return fail("Get element text failed", e);
      }
    },
  };
}

export function getSelectedTextTool(): PiTool {
  return {
    name: "get_selected_text",
    label: "Get selected text",
    description:
      "Copy and read the currently selected text from any application. Uses Ctrl+C to capture the selection, reads it, then restores the clipboard. Works in any focused application with selectable text.",
    parameters: EMPTY,
    async execute() {
      try {
        const before = clipboard.readText();
        const { pressKeys } = await import("../desktop/input-simulation");
        await pressKeys(["ctrl", "c"]);
        await new Promise((r) => setTimeout(r, 200));
        const selected = clipboard.readText();
        if (selected !== before) clipboard.writeText(before);
        if (!selected.trim()) return text("No text selected or nothing in clipboard after Ctrl+C.", "capturing");
        const clipped = selected.length > 2000 ? `${selected.slice(0, 2000)}\n...(truncated)` : selected;
        return text(`Selected text:\n${clipped}`, "capturing");
      } catch (e) {
        return fail("Get selected text failed", e);
      }
    },
  };
}

// â”€â”€ Shell, files, clipboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function clipboardTool(): PiTool {
  return {
    name: "clipboard",
    label: "Clipboard",
    description: "Read, write, or clear system clipboard.",
    parameters: Type.Object({
      action: StringEnum(["read", "write", "clear"], { description: "Action" }),
      text: Type.Optional(Type.String({ description: "Text for write action" })),
    }),
    async execute(_id, { action, text: body }) {
      try {
        if (action === "read") {
          const current = clipboard.readText();
          return text(`Clipboard: "${current.length > 500 ? `${current.slice(0, 500)}...` : current}"`, "complete");
        }
        if (action === "write") {
          if (!body) return fail("Error: text required for write", "missing argument");
          clipboard.writeText(body);
          return text(`Clipboard set to: "${body.length > 100 ? `${body.slice(0, 100)}...` : body}"`, "complete");
        }
        clipboard.clear();
        return text("Clipboard cleared.", "complete");
      } catch (e) {
        return fail("Clipboard failed", e);
      }
    },
  };
}

const FILE_ACTIONS = [
  "list_directory", "read_file", "write_file", "copy_file", "move_file", "delete_file", "file_exists",
] as const;

export function fileOperationsTool(): PiTool {
  return {
    name: "file_operations",
    label: "File operations",
    description:
      "Perform file system operations: list_directory, read_file, write_file, copy_file, move_file, delete_file, file_exists. Use to browse, read, create, or modify files on the desktop.",
    parameters: Type.Object({
      action: StringEnum(FILE_ACTIONS, { description: "Operation to perform" }),
      path: Type.String({ description: "File or directory path" }),
      content: Type.Optional(Type.String({ description: "File content (required for write_file)" })),
      destination: Type.Optional(Type.String({ description: "Destination path (required for copy_file/move_file)" })),
    }),
    async execute(_id, { action, path, content, destination }) {
      try {
        return text(await runFileAction(action, path, content, destination), "complete", { path });
      } catch (e) {
        return fail("File operation failed", e, { path });
      }
    },
  };
}

async function runFileAction(
  action: (typeof FILE_ACTIONS)[number],
  path: string,
  content?: string,
  destination?: string,
): Promise<string> {
  const fs = await import("fs/promises");
  const pathMod = await import("path");
  switch (action) {
    case "list_directory": {
      const entries = await fs.readdir(path, { withFileTypes: true });
      const rows = entries.slice(0, 50).map((e) => `${e.isDirectory() ? "[DIR]  " : "[FILE] "}${e.name}`);
      const more = entries.length > 50 ? `\n... and ${entries.length - 50} more` : "";
      return `Directory "${path}" (${entries.length} entries):\n${rows.join("\n")}${more}`;
    }
    case "read_file": {
      const body = await fs.readFile(path, "utf-8");
      return `File "${path}" (${body.length} chars):\n${body.length > 5000 ? `${body.slice(0, 5000)}\n...(truncated)` : body}`;
    }
    case "write_file": {
      if (!content) throw new Error("content required for write_file");
      await fs.mkdir(pathMod.dirname(path), { recursive: true });
      await fs.writeFile(path, content, "utf-8");
      return `Written ${content.length} chars to "${path}".`;
    }
    case "copy_file": {
      if (!destination) throw new Error("destination required for copy_file");
      await fs.mkdir(pathMod.dirname(destination), { recursive: true });
      await fs.copyFile(path, destination);
      return `Copied "${path}" to "${destination}".`;
    }
    case "move_file": {
      if (!destination) throw new Error("destination required for move_file");
      await fs.mkdir(pathMod.dirname(destination), { recursive: true });
      await fs.rename(path, destination);
      return `Moved "${path}" to "${destination}".`;
    }
    case "delete_file": {
      await fs.unlink(path);
      return `Deleted "${path}".`;
    }
    case "file_exists": {
      try {
        await fs.access(path);
        return `File "${path}" exists.`;
      } catch {
        return `File "${path}" does NOT exist.`;
      }
    }
  }
}

export function launchAppTool(): PiTool {
  return {
    name: "launch_app",
    label: "Launch app",
    description: "Launch a desktop application by name. Optionally wait for the window to appear.",
    parameters: Type.Object({
      name: Type.String({ description: 'Application name (e.g., "notepad", "calc", "explorer")' }),
      args: Type.Optional(Type.Array(Type.String(), { description: "Optional command-line arguments" })),
      waitForReady: Type.Optional(Type.Boolean({ description: "Wait for app window (up to 10s)", default: true })),
    }),
    async execute(_id, { name, args, waitForReady }, signal) {
      try {
        const { launchApp, listWindows } = await import("../desktop/input-simulation");
        if (!(await launchApp(name, args))) {
          return fail(`Failed to launch application "${name}". ShellExecute returned error code`, "launch failed");
        }
        if (!waitForReady) return text(`Launched "${name}" successfully.`, "window_management");
        const match = await waitForWindow(name, listWindows, 10000, signal);
        if (isAborted(signal)) return text(`Launched "${name}"; stopped waiting for its window.`, "window_management");
        return text(
          match ? `Launched "${name}" successfully. Active window: "${match}".` : `Launched "${name}" but window did not become active within 10 seconds.`,
          "window_management",
        );
      } catch (e) {
        return fail("Launch app failed", e);
      }
    },
  };
}

async function waitForWindow(
  appName: string,
  listWindows: () => Promise<Array<{ title: string }>>,
  budget: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const target = appName.replace(/\.exe$/i, "").toLowerCase();
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = new RegExp(`(^|[\\s\\-_])${escaped}([\\s\\-_]|$)`);
  const started = Date.now();
  while (!isAborted(signal) && Date.now() - started < budget) {
    await sleep(500, signal);
    if (isAborted(signal)) return null;
    const hit = (await listWindows()).find((w) => {
      const title = w.title.toLowerCase();
      return title === target || title.startsWith(`${target} `) || boundary.test(title);
    });
    if (hit) return hit.title;
  }
  return null;
}

export function executeCommandTool(): PiTool {
  return {
    name: "execute_command",
    label: "Execute command",
    description:
      "Execute a PowerShell command and capture stdout/stderr. Use for file operations, git, package management, system queries, etc. Output is truncated at 5000 chars.",
    parameters: Type.Object({
      command: Type.String({ description: "PowerShell command to execute" }),
      workingDir: Type.Optional(Type.String({ description: "Working directory (default: current)" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default: 30000)" })),
    }),
    async execute(_id, { command, workingDir, timeout }) {
      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const { stdout, stderr } = await promisify(exec)(command, {
          timeout: timeout ?? 30000,
          cwd: workingDir || process.cwd(),
          maxBuffer: 1024 * 1024 * 10,
          shell: "powershell.exe",
        });
        const out = stdout.trim();
        const err = stderr.trim();
        if (err && !out) return text(`Command executed. Stderr:\n${err.slice(0, 2000)}`, "complete");
        const clipped = out.length > 5000 ? `${out.slice(0, 5000)}\n...(truncated)` : out;
        return text(`Command executed successfully.\nOutput:\n${clipped || "(no output)"}`, "complete");
      } catch (e) {
        const msg = errText(e);
        return text(`Command ${msg.includes("timed out") ? "timed out" : "failed"}: ${msg}`, "error", { isError: true });
      }
    },
  };
}

export function navigateToPathTool(): PiTool {
  return {
    name: "navigate_to_path",
    label: "Navigate to path",
    description:
      'Open File Explorer to a specific folder path in one step. Use absolute paths (e.g. "C:\\Users\\name\\Desktop"), shell folders (e.g. "shell:Desktop", "shell:Downloads"), or environment variables (e.g. "%USERPROFILE%\\Desktop"). Much more reliable than visual navigation.',
    parameters: Type.Object({
      path: Type.String({ description: "Folder path to navigate to (supports shell: prefixes and %ENV% variables)" }),
    }),
    async execute(_id, { path }) {
      try {
        const expanded = path
          .replace(/^%USERPROFILE%/i, process.env.USERPROFILE || "")
          .replace(/^%TEMP%/i, process.env.TEMP || "")
          .replace(/^%APPDATA%/i, process.env.APPDATA || "")
          .replace(/^%LOCALAPPDATA%/i, process.env.LOCALAPPDATA || "");
        const { spawn } = await import("child_process");
        const child = spawn("explorer.exe", [expanded.replace(/\//g, "\\")], { detached: true, stdio: "ignore" });
        child.unref();
        await new Promise<void>((r) => setTimeout(r, 1500));
        return text(
          `Opened File Explorer to "${expanded}". Wait 1-2 seconds for the window to fully load before interacting.`,
          "window_management",
        );
      } catch (e) {
        return fail("Navigate failed", e);
      }
    },
  };
}

/**
 * The 32 tools, in the order `DesktopAgent.initialize()` used to bind them — the same order
 * the prompt in `prompt.ts` describes as the model's priority list, which is why the two files
 * must move together.
 *
 * Typed `AgentTool<any>[]`, matching `Agent.state.tools`. Forcing `TParameters` to a
 * concrete schema here widens `Static<>` to `unknown` and makes every `execute` fail
 * to destructure, so the per-tool `parameters` schema is the source of truth for each
 * tool's own `execute` signature.
 */
export function createPiDesktopToolbox(
  adapter: DesktopAdapter,
  a11y: AccessibilityTreeAdapter,
): PiTool[] {
  return [
    screenshotTool(adapter),
    clickTool(adapter),
    doubleClickTool(adapter),
    typeTextTool(adapter),
    keyComboTool(adapter),
    scrollTool(adapter),
    dragTool(adapter),
    getScreenTextTool(adapter),
    getWindowInfoTool(adapter),
    moveMouseTool(adapter),
    launchAppTool(),
    waitTool(),
    rightClickTool(adapter),
    clipboardTool(),
    getWindowListTool(),
    getElementInfoTool(a11y),
    clickElementTool(a11y),
    searchElementsTool(a11y),
    focusWindowTool(adapter),
    hoverTool(adapter),
    fileOperationsTool(),
    getSelectedTextTool(),
    minimizeWindowTool(adapter),
    maximizeWindowTool(adapter),
    restoreWindowTool(adapter),
    closeWindowTool(adapter),
    executeCommandTool(),
    invokeElementTool(a11y),
    setElementValueTool(a11y),
    getElementTextTool(a11y),
    holdKeyTool(),
    navigateToPathTool(),
  ];
}







