// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  clipboard: { readText: () => "clip", writeText: () => {}, clear: () => {} },
}));

import { createPiDesktopToolbox } from "./toolbox";
import type { TextContent } from "@earendil-works/pi-ai";
import type { DesktopAdapter } from "../desktop/types";
import type { AccessibilityTreeAdapter } from "../desktop/accessibility-tree";

/**
 * The 32 tool names, frozen. This list is the contract: when `desktop-tools.ts` is deleted
 * with the LangGraph path, this file is the only remaining record of the surface, and a
 * rename or a dropped tool fails here rather than silently shrinking the agent's reach.
 */
const TOOL_NAMES = [
  "click", "click_element", "clipboard", "close_window", "double_click", "drag",
  "execute_command", "file_operations", "focus_window", "get_element_info",
  "get_element_text", "get_screen_text", "get_selected_text", "get_window_info",
  "get_window_list", "hold_key", "hover", "invoke_element", "key_combo", "launch_app",
  "maximize_window", "minimize_window", "move_mouse", "navigate_to_path", "restore_window",
  "right_click", "screenshot", "scroll", "search_elements", "set_element_value",
  "type_text", "wait",
];

const adapter = {
  click: vi.fn(async () => {}),
  doubleClick: vi.fn(async () => {}),
  rightClick: vi.fn(async () => {}),
  typeText: vi.fn(async () => {}),
  pressKeys: vi.fn(async () => {}),
  scroll: vi.fn(async () => {}),
  drag: vi.fn(async () => {}),
  setCursorPosition: vi.fn(async () => {}),
  hover: vi.fn(async () => {}),
  captureScreen: vi.fn(async () => ({ monitors: [] })),
  getScreenText: vi.fn(async () => "text"),
  getWindowInfo: vi.fn(async () => ({ title: "win" })),
  focusWindow: vi.fn(async () => true),
  minimizeWindow: vi.fn(async () => true),
  maximizeWindow: vi.fn(async () => true),
  restoreWindow: vi.fn(async () => true),
  closeWindow: vi.fn(async () => true),
} as unknown as DesktopAdapter;

const a11y = {
  getFocusedElement: vi.fn(async () => null),
  searchElements: vi.fn(async () => []),
  clickElement: vi.fn(async () => true),
  invokeElement: vi.fn(async () => true),
  setElementValue: vi.fn(async () => true),
  getElementText: vi.fn(async () => null),
} as unknown as AccessibilityTreeAdapter;

const tools = createPiDesktopToolbox(adapter, a11y);
const byName = new Map(tools.map((t) => [t.name, t]));

beforeEach(() => vi.clearAllMocks());

describe("Pi desktop toolbox", () => {
  it("exposes exactly the 32 contracted tools", () => {
    expect(tools).toHaveLength(32);
    expect([...byName.keys()].sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("gives every tool a label, a description and an object schema", () => {
    for (const tool of tools) {
      expect(tool.label, `${tool.name} label`).toBeTruthy();
      expect(tool.description, `${tool.name} description`).toBeTruthy();
      const schema = tool.parameters as { type?: string };
      expect(schema?.type, `${tool.name} schema type`).toBe("object");
    }
  });

  it("has no duplicate names", () => {
    expect(byName.size).toBe(tools.length);
  });

  it("marks only close_window as needing the pixel verifier", async () => {
    const close = await byName.get("close_window")!.execute("1", { windowHandle: "1" });
    expect(close.details.verifies).toBe(true);
    const focus = await byName.get("focus_window")!.execute("2", { windowHandle: "1" });
    expect(focus.details.verifies).toBeUndefined();
  });

  it("reports a progress status on every result instead of inferring one from the name", async () => {
    const result = await byName.get("click")!.execute("1", { x: 1, y: 2 });
    expect(result.details.status).toBe("clicking");
  });

  it("returns a screenshot as a real image block, not a string marker", async () => {
    adapter.captureScreen = vi.fn(async () => ({
      monitors: [{ name: "D", width: 10, height: 20, dataUrl: "data:image/png;base64,QUJD" }],
    })) as unknown as DesktopAdapter["captureScreen"];

    const result = await byName.get("screenshot")!.execute("1", {});
    const image = result.content.find((c) => c.type === "image");
    expect(image).toBeDefined();
    expect(image).toMatchObject({ mimeType: "image/png", data: "QUJD" });
  });

  it("never throws — a failing adapter becomes a readable error result", async () => {
    adapter.click = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as DesktopAdapter["click"];

    const result = await byName.get("click")!.execute("1", { x: 1, y: 2 });
    expect(result.isError).toBe(true);
    expect((result.content[0] as TextContent).text).toContain("boom");
  });

  it("rejects an unknown file action without throwing", async () => {
    const result = await byName.get("file_operations")!.execute("1", { action: "nope", path: "C:\\" });
    // Either the validator or the switch turns it into a readable message, never an exception.
    expect(result.content[0].type).toBe("text");
  });
});
