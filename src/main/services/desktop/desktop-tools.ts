import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { DesktopAdapter } from './types';
import { clipboard } from 'electron';
import type { AccessibilityTreeAdapter } from './accessibility-tree';
import { createLogger } from '../../utils/logger';

const log = createLogger('DesktopTools');

export type ScreenshotToolResult = {
  _type: 'screenshot_result';
  description: string;
  image: string; // data URL of the primary monitor screenshot
};

// Tag returned by screenshot tool so the agent can inject the actual image
export type ScreenshotWithImage = { _type: 'screenshot_result'; description: string; image: string };

export function createScreenshotTool(adapter: DesktopAdapter) {
  return tool(
    async ({ monitorIndex }) => {
      try {
        log.debug('screenshot tool: capturing screen, monitorIndex=', monitorIndex);
        const result = await adapter.captureScreen(monitorIndex);
        const primary = result.monitors[0];
        if (!primary || !primary.dataUrl) {
          log.error('screenshot tool: no image data returned from capture');
          return `Screenshot failed: no image data captured.`;
        }
        log.debug(`screenshot tool: captured ${primary.width}x${primary.height}, dataUrl length=${primary.dataUrl.length}`);
        const summary = `Screenshot captured: ${primary.width}x${primary.height}${result.monitors.length > 1 ? ` (${result.monitors.length} monitors total)` : ''}. Monitor names: ${result.monitors.map(m => m.name).join(', ')}.`;
        // Return the image as a data URL alongside the text description.
        // The desktop-agent will detect this marker and create a multimodal ToolMessage.
        const resultObj: ScreenshotToolResult = {
          _type: 'screenshot_result',
          description: summary,
          image: primary.dataUrl,
        };
        return resultObj;
      } catch (error) {
        log.error('screenshot tool: capture failed:', error instanceof Error ? error.message : 'Unknown');
        return `Screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'screenshot',
      description: 'Capture the current screen and return a description of what is visible. Optionally specify a monitor index (0 = primary).',
      schema: z.object({
        monitorIndex: z.number().optional().describe('Which monitor to capture (0 = primary)'),
      }),
    },
  );
}

export function createClickTool(adapter: DesktopAdapter) {
  return tool(
    async ({ x, y, button }) => {
      try {
        await adapter.click(x, y, button as 'left' | 'right');
        return `Clicked at (${x}, ${y}) with ${button || 'left'} button.`;
      } catch (error) {
        return `Click failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'click',
      description: 'Click at a specific (x, y) coordinate on the screen. Coordinates are in screen pixels from the top-left corner.',
      schema: z.object({
        x: z.number().describe('X coordinate in pixels from left edge'),
        y: z.number().describe('Y coordinate in pixels from top edge'),
        button: z.enum(['left', 'right']).optional().describe('Mouse button (default: left)'),
      }),
    },
  );
}

export function createDoubleClickTool(adapter: DesktopAdapter) {
  return tool(
    async ({ x, y }) => {
      try {
        await adapter.doubleClick(x, y);
        return `Double-clicked at (${x}, ${y}).`;
      } catch (error) {
        return `Double-click failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'double_click',
      description: 'Double-click at a specific (x, y) coordinate on the screen.',
      schema: z.object({
        x: z.number().describe('X coordinate in pixels from left edge'),
        y: z.number().describe('Y coordinate in pixels from top edge'),
      }),
    },
  );
}

export function createTypeTextTool(adapter: DesktopAdapter) {
  return tool(
    async ({ text }) => {
      try {
        await adapter.typeText(text);
        return `Typed text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`;
      } catch (error) {
        return `Type text failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'type_text',
      description: 'Type the given text string character by character. Use this to fill in text fields or type into applications.',
      schema: z.object({
        text: z.string().describe('The text to type'),
      }),
    },
  );
}

export function createKeyComboTool(adapter: DesktopAdapter) {
  return tool(
    async ({ keys }) => {
      try {
        await adapter.pressKeys(keys);
        return `Pressed key combination: ${keys.join('+')}`;
      } catch (error) {
        return `Key combo failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'key_combo',
      description: 'Press a combination of keys like ctrl+c, alt+tab, win+r, etc. Keys are specified as an array of key names.',
      schema: z.object({
        keys: z.array(z.string()).describe('Array of key names to press (e.g., ["ctrl", "c"])'),
      }),
    },
  );
}

export function createScrollTool(adapter: DesktopAdapter) {
  return tool(
    async ({ x, y, delta }) => {
      try {
        await adapter.scroll(x, y, delta);
        return `Scrolled at (${x}, ${y}) with delta ${delta} (positive = up, negative = down).`;
      } catch (error) {
        return `Scroll failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'scroll',
      description: 'Scroll the mouse wheel at a specific position. Positive delta scrolls up, negative scrolls down.',
      schema: z.object({
        x: z.number().describe('X coordinate in pixels'),
        y: z.number().describe('Y coordinate in pixels'),
        delta: z.number().describe('Scroll amount (positive = up, negative = down)'),
      }),
    },
  );
}

export function createDragTool(adapter: DesktopAdapter) {
  return tool(
    async ({ fromX, fromY, toX, toY }) => {
      try {
        await adapter.drag({ x: fromX, y: fromY }, { x: toX, y: toY });
        return `Dragged from (${fromX}, ${fromY}) to (${toX}, ${toY}).`;
      } catch (error) {
        return `Drag failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'drag',
      description: 'Drag from one coordinate to another. Useful for moving files, selecting text, or dragging window elements.',
      schema: z.object({
        fromX: z.number().describe('Start X coordinate'),
        fromY: z.number().describe('Start Y coordinate'),
        toX: z.number().describe('End X coordinate'),
        toY: z.number().describe('End Y coordinate'),
      }),
    },
  );
}

export function createGetScreenTextTool(adapter: DesktopAdapter) {
  return tool(
    async () => {
      try {
        const text = await adapter.getScreenText();
        return `Screen text extracted:\n${text.slice(0, 2000)}${text.length > 2000 ? '\n...(truncated)' : ''}`;
      } catch (error) {
        return `Screen text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'get_screen_text',
      description: 'Extract all visible text from the current screen using OCR. Returns the text content found on screen.',
      schema: z.object({}),
    },
  );
}

export function createGetWindowInfoTool(adapter: DesktopAdapter) {
  return tool(
    async () => {
      try {
        const info = await adapter.getWindowInfo();
        return `Active window: "${info.title}"`;
      } catch (error) {
        return `Window info failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'get_window_info',
      description: 'Get information about the currently active/focused window including its title.',
      schema: z.object({}),
    },
  );
}

export function createMoveMouseTool(adapter: DesktopAdapter) {
  return tool(
    async ({ x, y }) => {
      try {
        await adapter.setCursorPosition(x, y);
        return `Mouse moved to (${x}, ${y}).`;
      } catch (error) {
        return `Move mouse failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'move_mouse',
      description: 'Move the mouse cursor to a specific (x, y) coordinate without clicking.',
      schema: z.object({
        x: z.number().describe('X coordinate in pixels from left edge'),
        y: z.number().describe('Y coordinate in pixels from top edge'),
      }),
    },
  );
}

export function createLaunchAppTool() {
  return tool(
    async ({ name, args, waitForReady }) => {
      try {
        const { launchApp, listWindows } = await import('./input-simulation');
        const success = await launchApp(name, args);

        if (!success) {
          return `Failed to launch application "${name}". ShellExecute returned error code.`;
        }

        if (waitForReady) {
          const startTime = Date.now();
          const timeout = 10000;
          // Normalize the app name for matching: extract base name without extension
          const normalizedName = name.replace(/\.exe$/i, '').toLowerCase();

          while (Date.now() - startTime < timeout) {
            await new Promise(r => setTimeout(r, 500));
            const windows = await listWindows();
            // Look for a window whose title starts with or contains the app name as a word
            const match = windows.find(w => {
              const title = w.title.toLowerCase();
              // Prefer exact match or title starting with app name
              if (title === normalizedName || title.startsWith(normalizedName + ' ')) return true;
              // Check for word-boundary match (app name followed by space, hyphen, or end)
              const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const wordBoundaryRegex = new RegExp(`(^|[\\s\\-_])${escapedName}([\\s\\-_]|$)`);
              return wordBoundaryRegex.test(title);
            });

            if (match) {
              return `Launched "${name}" successfully. Active window: "${match.title}".`;
            }
          }
          return `Launched "${name}" but window did not become active within 10 seconds.`;
        }

        return `Launched "${name}" successfully.`;
      } catch (error) {
        return `Launch app failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'launch_app',
      description: 'Launch a desktop application by name. Optionally wait for the window to appear.',
      schema: z.object({
        name: z.string().describe('Application name (e.g., "notepad", "calc", "explorer")'),
        args: z.array(z.string()).optional().describe('Optional command-line arguments'),
        waitForReady: z.boolean().optional().default(true).describe('Wait for app window (up to 10s)'),
      }),
    },
  );
}

export function createWaitTool() {
  return tool(
    async ({ type, duration, textPattern, timeout }) => {
      try {
        const { getForegroundWindowInfo } = await import('./input-simulation');

        const actualTimeout = timeout ?? 10000;

        switch (type) {
          case 'duration': {
            const ms = duration ?? 1000;
            await new Promise(r => setTimeout(r, ms));
            return `Waited for ${ms}ms.`;
          }

          case 'window_change': {
            const initialTitle = (await getForegroundWindowInfo()).title;
            const startTime = Date.now();
            while (Date.now() - startTime < actualTimeout) {
              const currentTitle = (await getForegroundWindowInfo()).title;
              if (currentTitle !== initialTitle) {
                return `Window changed after ${Date.now() - startTime}ms. New: "${currentTitle}".`;
              }
              await new Promise(r => setTimeout(r, 500));
            }
            return `Timeout: no window change within ${actualTimeout}ms.`;
          }

          case 'text_appears': {
            if (!textPattern) return 'Error: textPattern required for text_appears.';
            const startTime = Date.now();
            while (Date.now() - startTime < actualTimeout) {
              const screenText = await (async () => {
                const { captureAllScreens } = await import('./screenshot-capture');
                const { createWorker } = await import('tesseract.js');
                const worker = await createWorker('eng');
                const screenshot = await captureAllScreens();
                const primary = screenshot.monitors[0];
                if (!primary) {
                  await worker.terminate();
                  return '';
                }
                const base64Data = primary.dataUrl.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                const { data } = await worker.recognize(buffer);
                await worker.terminate();
                return data.text;
              })();
              if (screenText.toLowerCase().includes(textPattern.toLowerCase())) {
                return `Text "${textPattern}" appeared on screen after ${Date.now() - startTime}ms.`;
              }
              await new Promise(r => setTimeout(r, 500));
            }
            return `Timeout: text "${textPattern}" did not appear within ${actualTimeout}ms.`;
          }

          default:
            return `Error: unknown wait type "${type}". Use: duration, window_change, or text_appears.`;
        }
      } catch (error) {
        return `Wait failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'wait',
      description: 'Wait for a condition: duration, window change, or text appearing on screen. Use to pause while apps load.',
      schema: z.object({
        type: z.enum(['duration', 'window_change', 'text_appears']).describe('Wait condition type'),
        duration: z.number().optional().describe('Duration in milliseconds (for duration type)'),
        textPattern: z.string().optional().describe('Text pattern to wait for (for text_appears type)'),
        timeout: z.number().optional().describe('Max wait time in ms (default: 10000)'),
      }),
    },
  );
}

export function createRightClickTool(adapter: DesktopAdapter) {
  return tool(
    async ({ x, y }) => {
      try {
        await adapter.rightClick(x, y);
        return `Right-clicked at (${x}, ${y}).`;
      } catch (error) {
        return `Right-click failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'right_click',
      description: 'Right-click at coordinates to open context menu.',
      schema: z.object({
        x: z.number().describe('X coordinate in pixels'),
        y: z.number().describe('Y coordinate in pixels'),
      }),
    },
  );
}

export function createClipboardTool() {
  return tool(
    async ({ action, text }) => {
      try {
        switch (action) {
          case 'read': {
            const content = clipboard.readText();
            return `Clipboard: "${content.slice(0, 500)}${content.length > 500 ? '...' : ''}"`;
          }
          case 'write': {
            if (!text) return 'Error: text required for write.';
            clipboard.writeText(text);
            return `Clipboard set to: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`;
          }
          case 'clear': {
            clipboard.clear();
            return 'Clipboard cleared.';
          }
          default:
            return `Error: unknown action "${action}". Use: read, write, or clear.`;
        }
      } catch (error) {
        return `Clipboard failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'clipboard',
      description: 'Read, write, or clear system clipboard.',
      schema: z.object({
        action: z.enum(['read', 'write', 'clear']).describe('Action'),
        text: z.string().optional().describe('Text for write action'),
      }),
    },
  );
}

export function createGetWindowListTool() {
  return tool(
    async () => {
      try {
        const { listWindows } = await import('./input-simulation');
        const windows = await listWindows();

        if (windows.length === 0) {
          return 'No visible windows found.';
        }

        const summary = windows.slice(0, 20).map(w => {
          const dims = w.width > 0 ? ` (${w.width}x${w.height})` : '';
          return `"${w.title}"${dims}`;
        });

        return `Found ${windows.length} windows:\n${summary.join('\n')}`;
      } catch (error) {
        return `List windows failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'get_window_list',
      description: 'List all visible windows on desktop with titles and dimensions.',
      schema: z.object({}),
    },
  );
}

export function createGetElementInfoTool(accessibilityAdapter: AccessibilityTreeAdapter) {
  return tool(
    async () => {
      try {
        const element = await accessibilityAdapter.getFocusedElement();
        if (!element) {
          return 'No element currently has keyboard focus.';
        }

        const bbox = element.boundingBox;
        const bboxStr = bbox.width > 0 ? ` (position: ${bbox.x},${bbox.y}, size: ${bbox.width}x${bbox.height})` : '';

        return `Focused element: "${element.name}" [${element.controlType}]${bboxStr}\nAutomationId: ${element.automationId || 'none'}\nClass: ${element.className || 'unknown'}\nEnabled: ${element.isEnabled}\nFocused: ${element.isFocused}`;
      } catch (error) {
        return `Get element info failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'get_element_info',
      description: 'Get accessibility info about the currently focused UI element (name, role, position, state). Use this instead of screenshot for structured, precise element info.',
      schema: z.object({}),
    },
  );
}

export function createClickElementTool(accessibilityAdapter: AccessibilityTreeAdapter) {
  return tool(
    async ({ elementName }) => {
      try {
        const success = await accessibilityAdapter.clickElement(elementName);
        if (success) {
          return `Clicked element "${elementName}" directly via UI Automation.`;
        }

        return `Could not click element "${elementName}" via UI Automation. Try clicking by coordinates instead.`;
      } catch (error) {
        return `Click element failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'click_element',
      description: 'Click a UI Automation element directly by name. More reliable than coordinate-based clicking. Use when you know the element name from get_element_info.',
      schema: z.object({
        elementName: z.string().describe('Name of the UI element to click'),
      }),
    },
  );
}

export function createSearchElementsTool(accessibilityAdapter: AccessibilityTreeAdapter) {
  return tool(
    async ({ query, controlType, maxResults }) => {
      try {
        const results = await accessibilityAdapter.searchElements(
          { name: query || undefined, controlType: controlType || undefined },
          maxResults || 20,
        );

        if (results.length === 0) {
          return `No elements found matching "${query || controlType || 'query'}".`;
        }

        const summary = results.slice(0, 15).map(el => {
          const bbox = el.boundingBox;
          const bboxStr = bbox.width > 0 ? ` at (${bbox.x},${bbox.y}) ${bbox.width}x${bbox.height}` : '';
          return `  - "${el.name}" [${el.controlType}]${bboxStr}${el.isEnabled ? '' : ' (disabled)'}`;
        });

        return `Found ${results.length} element(s) matching "${query || controlType}":\n${summary.join('\n')}${results.length > 15 ? '\n  ... and ' + (results.length - 15) + ' more' : ''}`;
      } catch (error) {
        return `Search elements failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'search_elements',
      description: 'Search the accessibility tree for UI elements by name substring or control type. Returns matching elements with positions and states. Use this to find buttons, text fields, or other UI elements before interacting with them.',
      schema: z.object({
        query: z.string().optional().describe('Partial name to search for (substring match)'),
        controlType: z.string().optional().describe('Control type to filter by (e.g., "Button", "Edit", "MenuItem")'),
        maxResults: z.number().optional().default(20).describe('Maximum number of results to return'),
      }),
    },
  );
}

export function createFocusWindowTool(adapter: DesktopAdapter) {
  return tool(
    async ({ windowHandle }) => {
      try {
        const success = await adapter.focusWindow(windowHandle);
        if (success) {
          return `Brought window to foreground.`;
        }
        return `Failed to focus window. The handle may be invalid or the window may not exist.`;
      } catch (error) {
        return `Focus window failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'focus_window',
      description: 'Bring a window to the foreground by its handle. Use get_window_list to find window handles. Required before interacting with elements in a background window.',
      schema: z.object({
        windowHandle: z.string().describe('Window handle from get_window_list'),
      }),
    },
  );
}

export function createHoverTool(adapter: DesktopAdapter) {
  return tool(
    async ({ x, y }) => {
      try {
        await adapter.hover(x, y);
        return `Hovered at (${x}, ${y}). This reveals tooltips, dropdown menus, and hover-triggered elements.`;
      } catch (error) {
        return `Hover failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'hover',
      description: 'Move the mouse to coordinates and hover briefly. Use to reveal tooltips, dropdown menus, or hover-triggered UI elements.',
      schema: z.object({
        x: z.number().describe('X coordinate in pixels'),
        y: z.number().describe('Y coordinate in pixels'),
      }),
    },
  );
}

export function createFileOperationsTool() {
  return tool(
    async ({ action, path, content, destination }) => {
      try {
        const fs = await import('fs/promises');
        const pathMod = await import('path');

        switch (action) {
          case 'list_directory': {
            const entries = await fs.readdir(path, { withFileTypes: true });
            const lines = entries.slice(0, 50).map(e => {
              const prefix = e.isDirectory() ? '[DIR]  ' : '[FILE] ';
              return `${prefix}${e.name}`;
            });
            return `Directory "${path}" (${entries.length} entries):\n${lines.join('\n')}${entries.length > 50 ? '\n... and ' + (entries.length - 50) + ' more' : ''}`;
          }

          case 'read_file': {
            const fileContent = await fs.readFile(path, 'utf-8');
            const truncated = fileContent.length > 5000 ? fileContent.slice(0, 5000) + '\n...(truncated)' : fileContent;
            return `File "${path}" (${fileContent.length} chars):\n${truncated}`;
          }

          case 'write_file': {
            if (!content) return 'Error: content required for write_file.';
            await fs.mkdir(pathMod.dirname(path), { recursive: true });
            await fs.writeFile(path, content, 'utf-8');
            return `Written ${content.length} chars to "${path}".`;
          }

          case 'copy_file': {
            if (!destination) return 'Error: destination required for copy_file.';
            await fs.mkdir(pathMod.dirname(destination), { recursive: true });
            await fs.copyFile(path, destination);
            return `Copied "${path}" to "${destination}".`;
          }

          case 'move_file': {
            if (!destination) return 'Error: destination required for move_file.';
            await fs.mkdir(pathMod.dirname(destination), { recursive: true });
            await fs.rename(path, destination);
            return `Moved "${path}" to "${destination}".`;
          }

          case 'delete_file': {
            await fs.unlink(path);
            return `Deleted "${path}".`;
          }

          case 'file_exists': {
            try {
              await fs.access(path);
              return `File "${path}" exists.`;
            } catch {
              return `File "${path}" does NOT exist.`;
            }
          }

          default:
            return `Error: unknown action "${action}". Use: list_directory, read_file, write_file, copy_file, move_file, delete_file, file_exists.`;
        }
      } catch (error) {
        return `File operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'file_operations',
      description: 'Perform file system operations: list_directory, read_file, write_file, copy_file, move_file, delete_file, file_exists. Use to browse, read, create, or modify files on the desktop.',
      schema: z.object({
        action: z.enum(['list_directory', 'read_file', 'write_file', 'copy_file', 'move_file', 'delete_file', 'file_exists']).describe('Operation to perform'),
        path: z.string().describe('File or directory path'),
        content: z.string().optional().describe('File content (required for write_file)'),
        destination: z.string().optional().describe('Destination path (required for copy_file/move_file)'),
      }),
    },
  );
}

export function createGetSelectedTextTool() {
  return tool(
    async () => {
      try {
        // Save current clipboard
        const previousContent = clipboard.readText();

        // Ctrl+C to copy selection
        await (async () => {
          const { pressKeys } = await import('./input-simulation');
          await pressKeys(['ctrl', 'c']);
          await new Promise(r => setTimeout(r, 200));
        })();

        // Read what was copied
        const selectedText = clipboard.readText();

        // Restore original clipboard content
        if (selectedText !== previousContent) {
          clipboard.writeText(previousContent);
        }

        if (!selectedText.trim()) {
          return 'No text selected or nothing in clipboard after Ctrl+C.';
        }

        return `Selected text:\n${selectedText.slice(0, 2000)}${selectedText.length > 2000 ? '\n...(truncated)' : ''}`;
      } catch (error) {
        return `Get selected text failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'get_selected_text',
      description: 'Copy and read the currently selected text from any application. Uses Ctrl+C to capture the selection, reads it, then restores the clipboard. Works in any focused application with selectable text.',
      schema: z.object({}),
    },
  );
}
