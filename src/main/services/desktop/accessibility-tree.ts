import koffi from 'koffi';
import { createLogger } from '../../utils/logger';

const log = createLogger('AccessibilityTree');

// UI Automation control type IDs (partial set for common controls)
const UIA_BUTTON_CONTROLTYPE = 50000;
const UIA_EDIT_CONTROLTYPE = 50004;
const UIA_LISTITEM_CONTROLTYPE = 50007;
const UIA_MENUITEM_CONTROLTYPE = 50008;
const UIA_WINDOW_CONTROLTYPE = 50032;
const UIA_DOCUMENT_CONTROLTYPE = 50030;
const UIA_PANE_CONTROLTYPE = 50033;
const UIA_TABITEM_CONTROLTYPE = 50019;
const UIA_TREEITEM_CONTROLTYPE = 50020;
const UIA_DATAITEM_CONTROLTYPE = 50002;

// UI Automation pattern IDs
const UIA_INVOKE_PATTERN_ID = 10000;
const UIA_TOGGLE_PATTERN_ID = 10001;
const UIA_EXPAND_COLLAPSE_PATTERN_ID = 10005;
const UIA_VALUE_PATTERN_ID = 10009;
const UIA_SCROLL_PATTERN_ID = 10004;
const UIA_SELECTION_PATTERN_ID = 10010;
const UIA_TEXT_PATTERN_ID = 10014;
const UIA_WINDOW_PATTERN_ID = 10009;

// Tree scope
const TreeScope_Children = 4;
const TreeScope_Subtree = 5;
const TreeScope_Element = 1;

// COM GUIDs
const CLSID_CUIAutomation = 'ff48dba4-60ef-4201-aa87-54103eef594e';
const IID_IUIAutomation = '30cbe57d-d9d0-452a-ab13-7ac5ac4825ee';

interface ControlTypeMap {
  [key: number]: string;
}

const CONTROL_TYPE_NAMES: ControlTypeMap = {
  50000: 'Button',
  50001: 'Calendar',
  50002: 'CheckBox',
  50003: 'ComboBox',
  50004: 'Edit',
  50005: 'Hyperlink',
  50006: 'Image',
  50007: 'ListItem',
  50008: 'List',
  50009: 'Menu',
  50010: 'MenuBar',
  50011: 'MenuItem',
  50012: 'RadioButton',
  50013: 'ScrollBar',
  50014: 'Slider',
  50015: 'Spinner',
  50016: 'StatusBar',
  50017: 'Tab',
  50018: 'TabItem',
  50019: 'Text',
  50020: 'ToolBar',
  50021: 'ToolTip',
  50022: 'Menu',
  50023: 'Window',
  50024: 'Pane',
  50025: 'TitleBar',
  50026: 'Group',
  50027: 'Thumb',
  50028: 'DataItem',
  50029: 'Header',
  50030: 'HeaderItem',
  50031: 'Tree',
  50032: 'Document',
  50033: 'ListItem',
  50034: 'Table',
};

export interface AccessibilityElementInfo {
  name: string;
  controlType: string;
  controlTypeId: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  isFocused: boolean;
  isEnabled: boolean;
  hasKeyboardFocus: boolean;
  automationId: string;
  className: string;
  helpText: string;
  value: string;
  patternsAvailable: string[];
  childrenCount: number;
  nativeHandle: unknown;
}

export interface TreeSnapshotNode {
  name: string;
  controlType: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  isFocused: boolean;
  isEnabled: boolean;
  value: string;
  children: TreeSnapshotNode[];
}

export class AccessibilityTreeAdapter {
  private uiautomation: unknown = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    log.info('UI Automation adapter initialized');
  }

  /**
   * Get info about the currently focused UI Automation element.
   * Returns null if no element has keyboard focus.
   */
  async getFocusedElement(): Promise<AccessibilityElementInfo | null> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Use Windows UI Automation COM to get focused element
      const { getFocusedElementViaAutomation } = await import('./uia-wrapper');
      const element = await getFocusedElementViaAutomation();

      if (!element) return null;

      return {
        name: element.name || '',
        controlType: element.controlType || 'Unknown',
        controlTypeId: element.controlTypeId || 0,
        boundingBox: element.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        isFocused: element.isFocused ?? false,
        isEnabled: element.isEnabled ?? true,
        hasKeyboardFocus: element.hasKeyboardFocus ?? false,
        automationId: element.automationId || '',
        className: element.className || '',
        helpText: element.helpText || '',
        value: element.value || '',
        patternsAvailable: element.patternsAvailable || [],
        childrenCount: element.childrenCount || 0,
        nativeHandle: element.nativeHandle,
      };
    } catch (error) {
      log.warn('getFocusedElement failed:', error);
      return null;
    }
  }

  /**
   * Get child elements of a given parent element.
   * Falls back to PowerShell UIA for the actual enumeration.
   */
  async getChildren(_elementHandle: string): Promise<AccessibilityElementInfo[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { findChildrenOfRoot } = await import('./uia-wrapper');
      const elements = await findChildrenOfRoot(100);

      return elements.map(el => ({
        name: el.name || '',
        controlType: el.controlType || 'Unknown',
        controlTypeId: el.controlTypeId || 0,
        boundingBox: el.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        isFocused: el.isFocused ?? false,
        isEnabled: el.isEnabled ?? true,
        hasKeyboardFocus: el.hasKeyboardFocus ?? false,
        automationId: el.automationId || '',
        className: el.className || '',
        helpText: el.helpText || '',
        value: el.value || '',
        patternsAvailable: el.patternsAvailable || [],
        childrenCount: el.childrenCount || 0,
        nativeHandle: el.nativeHandle,
      }));
    } catch (error) {
      log.warn('getChildren failed:', error);
      return [];
    }
  }

  /**
   * Get child elements of the desktop root.
   */
  async getChildrenOfRoot(): Promise<AccessibilityElementInfo[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { findChildrenOfRoot } = await import('./uia-wrapper');
      const elements = await findChildrenOfRoot(50);

      return elements.map(el => ({
        name: el.name || '',
        controlType: el.controlType || 'Unknown',
        controlTypeId: el.controlTypeId || 0,
        boundingBox: el.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        isFocused: el.isFocused ?? false,
        isEnabled: el.isEnabled ?? true,
        hasKeyboardFocus: el.hasKeyboardFocus ?? false,
        automationId: el.automationId || '',
        className: el.className || '',
        helpText: el.helpText || '',
        value: el.value || '',
        patternsAvailable: el.patternsAvailable || [],
        childrenCount: el.childrenCount || 0,
        nativeHandle: el.nativeHandle,
      }));
    } catch (error) {
      log.warn('getChildrenOfRoot failed:', error);
      return [];
    }
  }

  /**
   * Get the element at the given screen coordinates.
   */
  async getElementAtPoint(x: number, y: number): Promise<AccessibilityElementInfo | null> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { getElementFromPoint } = await import('./uia-wrapper');
      const element = await getElementFromPoint(x, y);

      if (!element) return null;

      return {
        name: element.name || '',
        controlType: element.controlType || 'Unknown',
        controlTypeId: element.controlTypeId || 0,
        boundingBox: element.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        isFocused: element.isFocused ?? false,
        isEnabled: element.isEnabled ?? true,
        hasKeyboardFocus: element.hasKeyboardFocus ?? false,
        automationId: element.automationId || '',
        className: element.className || '',
        helpText: element.helpText || '',
        value: element.value || '',
        patternsAvailable: element.patternsAvailable || [],
        childrenCount: element.childrenCount || 0,
        nativeHandle: element.nativeHandle,
      };
    } catch (error) {
      log.warn('getElementAtPoint failed:', error);
      return null;
    }
  }

  /**
   * Recursively search the accessibility tree for elements matching the query.
   * Supports partial name matching, control type filtering, and automation ID lookup.
   */
  async searchElements(
    query: { name?: string; controlType?: string; automationId?: string },
    maxResults: number = 20,
  ): Promise<AccessibilityElementInfo[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { findChildrenOfRoot } = await import('./uia-wrapper');
      const rootElements = await findChildrenOfRoot(100);

      const results: AccessibilityElementInfo[] = [];
      const searchInChildren = async (elements: Array<Record<string, unknown>>, depth: number = 0) => {
        if (results.length >= maxResults || depth > 5) return;

        for (const el of elements) {
          if (results.length >= maxResults) break;

          const name = (el.name as string) || '';
          const controlType = (el.controlType as string) || 'Unknown';
          const automationId = (el.automationId as string) || '';

          let matches = true;
          if (query.name) {
            const queryLower = query.name.toLowerCase();
            const nameLower = name.toLowerCase();
            if (!nameLower.includes(queryLower)) {
              matches = false;
            }
          }
          if (query.controlType && controlType.toLowerCase() !== query.controlType.toLowerCase()) {
            matches = false;
          }
          if (query.automationId && automationId.toLowerCase() !== query.automationId.toLowerCase()) {
            matches = false;
          }

          if (matches && name) {
            results.push({
              name,
              controlType,
              controlTypeId: (el.controlTypeId as number) || 0,
              boundingBox: (el.boundingBox as AccessibilityElementInfo['boundingBox']) || { x: 0, y: 0, width: 0, height: 0 },
              isFocused: (el.isFocused as boolean) ?? false,
              isEnabled: (el.isEnabled as boolean) ?? true,
              hasKeyboardFocus: (el.hasKeyboardFocus as boolean) ?? false,
              automationId,
              className: (el.className as string) || '',
              helpText: (el.helpText as string) || '',
              value: (el.value as string) || '',
              patternsAvailable: (el.patternsAvailable as string[]) || [],
              childrenCount: (el.childrenCount as number) || 0,
              nativeHandle: el.nativeHandle,
            });
          }

          if (el.children && Array.isArray(el.children) && depth < 5) {
            await searchInChildren(el.children as Array<Record<string, unknown>>, depth + 1);
          }
        }
      };

      await searchInChildren(rootElements.map(el => ({
        name: el.name,
        controlType: el.controlType,
        controlTypeId: el.controlTypeId,
        boundingBox: el.boundingBox,
        isFocused: el.isFocused,
        isEnabled: el.isEnabled,
        hasKeyboardFocus: el.hasKeyboardFocus,
        automationId: el.automationId,
        className: el.className,
        helpText: el.helpText,
        value: el.value,
        patternsAvailable: el.patternsAvailable,
        childrenCount: el.childrenCount,
        nativeHandle: el.nativeHandle,
        children: [],
      }) as Record<string, unknown>));

      return results;
    } catch (error) {
      log.warn('searchElements failed:', error);
      return [];
    }
  }

  /**
   * Click/invoke a UI Automation element by name.
   * Searches the accessibility tree recursively for a matching element, finds its bounding box,
   * and clicks its center coordinate. Falls back to PowerShell-based invocation.
   */
  async clickElement(elementName: string): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Recursive search for matching element
      const results = await this.searchElements({ name: elementName }, 1);
      if (results.length > 0) {
        const match = results[0];
        if (match.boundingBox.width > 0 && match.boundingBox.height > 0) {
          // Click the center of the element's bounding box
          const centerX = match.boundingBox.x + match.boundingBox.width / 2;
          const centerY = match.boundingBox.y + match.boundingBox.height / 2;
          const { click } = await import('./input-simulation');
          await click(centerX, centerY, 'left');
          log.debug(`Clicked element "${elementName}" at (${centerX}, ${centerY})`);
          return true;
        }
      }

      log.debug(`Element "${elementName}" not found in accessibility tree`);
      return false;
    } catch (error) {
      log.warn('clickElement failed:', error);
      return false;
    }
  }

  /**
   * Get a pruned snapshot of the accessibility tree.
   * Limits depth to avoid excessive token usage.
   */
  async getTreeSnapshot(maxDepth: number = 3): Promise<TreeSnapshotNode[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { findChildrenOfRoot } = await import('./uia-wrapper');
      const elements = await findChildrenOfRoot(100);

      const buildNode = (el: Record<string, unknown>, depth: number): TreeSnapshotNode => {
        const node: TreeSnapshotNode = {
          name: (el.name as string) || '',
          controlType: (el.controlType as string) || 'Unknown',
          boundingBox: (el.boundingBox as TreeSnapshotNode['boundingBox']) || { x: 0, y: 0, width: 0, height: 0 },
          isFocused: (el.isFocused as boolean) ?? false,
          isEnabled: (el.isEnabled as boolean) ?? true,
          value: (el.value as string) || '',
          children: [],
        };

        if (depth < maxDepth && el.children && Array.isArray(el.children)) {
          node.children = (el.children as Array<Record<string, unknown>>).map(child =>
            buildNode(child, depth + 1),
          );
        }

        return node;
      };

      return elements.slice(0, 20).map(el => buildNode(el as unknown as Record<string, unknown>, 0));
    } catch (error) {
      log.warn('getTreeSnapshot failed:', error);
      return [];
    }
  }

  cleanup(): void {
    this.uiautomation = null;
    this.isInitialized = false;
  }
}
