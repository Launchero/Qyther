import { createLogger } from '../../utils/logger';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeWinAutomation = require('node-winautomation') as Record<string, unknown>;

const log = createLogger('UIANative');

// ── Constants from node-winautomation ──

const AutomationConstants = nodeWinAutomation as Record<string, unknown>;
const TreeScope = AutomationConstants.TreeScopes as Record<string, number>;
const ControlTypeIds = AutomationConstants.ControlTypeIds as Record<string, number>;
const PatternIds = AutomationConstants.PatternIds as Record<string, number>;
const ToggleStates = AutomationConstants.ToggleStates as Record<string, number>;
const WindowVisualStates = AutomationConstants.WindowVisualStates as Record<string, number>;
const ExpandCollapseStates = AutomationConstants.ExpandCollapseStates as Record<string, number>;

// ── Singleton Automation instance ──

// The Automation class is exported directly at the top-level of node-winautomation
const AutomationClass = AutomationConstants.Automation as { new (): unknown };

let automationInstance: unknown = null;

function getAutomation(): unknown {
  if (!automationInstance) {
    automationInstance = new AutomationClass();
    log.info('UI Automation COM instance initialized (native, no PowerShell)');
  }
  return automationInstance;
}

// ── Element handle tracking ──

// Map from integer handle to native UIAutomation element object
const elementHandleMap = new Map<number, unknown>();
let elementHandleCounter = 0;

function storeElement(el: unknown): string {
  elementHandleCounter++;
  elementHandleMap.set(elementHandleCounter, el);
  return String(elementHandleCounter);
}

function resolveElement(handle: string): unknown {
  const num = parseInt(handle, 10);
  return elementHandleMap.get(num) ?? null;
}

export function clearElementHandles(): void {
  elementHandleMap.clear();
  elementHandleCounter = 0;
}

// ── Element info mapping ──

const CONTROL_TYPE_NAMES: Record<number, string> = {
  50000: 'Button', 50001: 'Calendar', 50002: 'CheckBox', 50003: 'ComboBox',
  50004: 'Edit', 50005: 'Hyperlink', 50006: 'Image', 50007: 'ListItem',
  50008: 'List', 50009: 'Menu', 50010: 'MenuBar', 50011: 'MenuItem',
  50012: 'ProgressBar', 50013: 'RadioButton', 50014: 'ScrollBar',
  50015: 'Slider', 50016: 'Spinner', 50017: 'StatusBar', 50018: 'Tab',
  50019: 'TabItem', 50020: 'Text', 50021: 'ToolBar', 50022: 'ToolTip',
  50023: 'Tree', 50024: 'TreeItem', 50025: 'Custom', 50026: 'Group',
  50027: 'Thumb', 50028: 'DataGrid', 50029: 'DataItem', 50030: 'Document',
  50031: 'SplitButton', 50032: 'Window', 50033: 'Pane', 50034: 'Header',
  50035: 'HeaderItem', 50036: 'Table', 50037: 'TitleBar', 50038: 'Separator',
  50039: 'SemanticZoom', 50040: 'AppBar',
};

const PATTERN_NAMES: Record<number, string> = {
  10000: 'Invoke', 10001: 'Selection', 10002: 'Value', 10003: 'RangeValue',
  10004: 'Scroll', 10005: 'ExpandCollapse', 10006: 'Grid', 10007: 'GridItem',
  10008: 'MultipleView', 10009: 'Window', 10010: 'SelectionItem',
  10011: 'Dock', 10012: 'Table', 10013: 'TableItem', 10014: 'Text',
  10015: 'Toggle', 10016: 'Transform', 10017: 'ScrollItem',
  10018: 'LegacyIAccessible', 10019: 'ItemContainer', 10020: 'VirtualizedItem',
  10021: 'SynchronizedInput', 10022: 'ObjectModel', 10023: 'Annotation',
  10024: 'TextPattern2', 10025: 'Styles', 10026: 'Spreadsheet',
  10027: 'SpreadsheetItem', 10028: 'TransformPattern2', 10029: 'TextChild',
  10030: 'Drag', 10031: 'DropTarget', 10032: 'TextEdit',
  10033: 'CustomNavigation', 10034: 'SelectionPattern2',
};

export interface UIAElement {
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
  nativeHandle: string;
  children?: UIAElement[];
}

function elementToInfo(el: unknown): UIAElement | null {
  if (!el) return null;

  try {
    const nativeEl = el as Record<string, unknown>;
    const name = (nativeEl.currentName as string) || '';
    const controlTypeId = (nativeEl.currentControlType as number) || 0;
    const controlType = CONTROL_TYPE_NAMES[controlTypeId] || `Unknown(${controlTypeId})`;

    const bbox = nativeEl.currentBoundingRectangle as Record<string, number> | null;
    const boundingBox = bbox
      ? {
          x: bbox.left ?? 0,
          y: bbox.top ?? 0,
          width: (bbox.right ?? 0) - (bbox.left ?? 0),
          height: (bbox.bottom ?? 0) - (bbox.top ?? 0),
        }
      : { x: 0, y: 0, width: 0, height: 0 };

    // Detect available patterns
    const patternsAvailable: string[] = [];
    for (const [patternId, patternName] of Object.entries(PATTERN_NAMES)) {
      try {
        const pattern = (nativeEl.getCurrentPattern as (id: number) => unknown)(parseInt(patternId, 10));
        if (pattern) patternsAvailable.push(patternName);
      } catch {
        // Pattern not available on this element
      }
    }

    // Try to get value from ValuePattern
    let value = '';
    try {
      const valuePattern = (nativeEl.getCurrentPattern as (id: number) => unknown)(PatternIds.ValuePatternId);
      if (valuePattern) {
        value = ((valuePattern as Record<string, unknown>).currentValue as string) || '';
      }
    } catch {
      // Value pattern not available
    }

    const handle = storeElement(el);

    // Count children
    let childrenCount = 0;
    try {
      const uia = getAutomation() as Record<string, unknown>;
      const trueCondition = (uia.createTrueCondition as () => unknown)();
      const children = (nativeEl.findAll as (scope: number, condition: unknown) => unknown[])(TreeScope.Children, trueCondition);
      childrenCount = Array.isArray(children) ? children.length : 0;
    } catch {
      childrenCount = 0;
    }

    return {
      name,
      controlType,
      controlTypeId,
      boundingBox,
      isFocused: (nativeEl.currentHasKeyboardFocus as boolean) ?? false,
      isEnabled: (nativeEl.currentIsEnabled as boolean) ?? true,
      hasKeyboardFocus: (nativeEl.currentHasKeyboardFocus as boolean) ?? false,
      automationId: (nativeEl.currentAutomationId as string) || '',
      className: (nativeEl.currentClassName as string) || '',
      helpText: (nativeEl.currentHelpText as string) || '',
      value,
      patternsAvailable,
      childrenCount,
      nativeHandle: handle,
    };
  } catch (error) {
    log.debug('elementToInfo failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// ── Public API ──

/**
 * Get the currently focused UI Automation element.
 * Replaces PowerShell-based getFocusedElementViaAutomation.
 */
export async function getFocusedElementViaAutomation(): Promise<UIAElement | null> {
  try {
    const uia = getAutomation() as Record<string, unknown>;
    const el = (uia.getFocusedElement as () => unknown)();
    if (!el) return null;

    const info = elementToInfo(el);
    if (info) {
      info.isFocused = true;
      info.hasKeyboardFocus = true;
    }
    return info;
  } catch (error) {
    log.debug('getFocusedElementViaAutomation error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Enumerate children of the desktop root element.
 * Replaces PowerShell-based findChildrenOfRoot.
 */
export async function findChildrenOfRoot(maxCount: number = 50): Promise<UIAElement[]> {
  try {
    const uia = getAutomation() as Record<string, unknown>;
    const condition = uia.controlViewCondition as unknown;
    const root = (uia.getRootElement as () => unknown)() as Record<string, unknown>;
    const rawElements = (root.findAll as (scope: number, cond: unknown) => unknown[])(TreeScope.Children, condition);

    const elements: UIAElement[] = [];
    for (const el of (Array.isArray(rawElements) ? rawElements : [])) {
      if (elements.length >= maxCount) break;
      const info = elementToInfo(el);
      if (info && info.name) {
        elements.push(info);
      }
    }
    return elements;
  } catch (error) {
    log.debug('findChildrenOfRoot error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Enumerate children of a specific element identified by its handle.
 * Replaces PowerShell-based getChildrenOfElementViaAutomation.
 */
export async function getChildrenOfElementViaAutomation(handle: string, maxCount: number = 50): Promise<UIAElement[]> {
  if (!handle) return [];
  try {
    const nativeEl = resolveElement(handle);
    if (!nativeEl) return [];

    const uia = getAutomation() as Record<string, unknown>;
    const condition = uia.controlViewCondition;
    const rawElements = ((nativeEl as Record<string, unknown>).findAll as (scope: number, cond: unknown) => unknown[])(TreeScope.Children, condition);

    const elements: UIAElement[] = [];
    for (const el of (Array.isArray(rawElements) ? rawElements : [])) {
      if (elements.length >= maxCount) break;
      const info = elementToInfo(el);
      if (info && info.name) {
        elements.push(info);
      }
    }
    return elements;
  } catch (error) {
    log.debug('getChildrenOfElementViaAutomation error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Get the UI Automation element at the given screen coordinates.
 * Replaces PowerShell-based getElementFromPoint.
 */
export async function getElementFromPoint(x: number, y: number): Promise<UIAElement | null> {
  try {
    const uia = getAutomation() as Record<string, unknown>;
    const el = (uia.elementFromPoint as (x: number, y: number) => unknown)(x, y);
    if (!el) return null;
    return elementToInfo(el);
  } catch (error) {
    log.debug('getElementFromPoint error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Invoke a UI Automation element directly via InvokePattern.
 * This is more reliable than coordinate-based clicking.
 */
export async function invokeElementByHandle(handle: string): Promise<boolean> {
  if (!handle) return false;
  try {
    const nativeEl = resolveElement(handle);
    if (!nativeEl) return false;

    const nativeElRecord = nativeEl as Record<string, unknown>;
    const invokePattern = (nativeElRecord.getCurrentPattern as (id: number) => unknown)(PatternIds.InvokePatternId) as Record<string, unknown> | null;
    if (!invokePattern) {
      log.debug('invokeElementByHandle: element does not support InvokePattern');
      return false;
    }

    (invokePattern.invoke as () => void)();
    log.debug(`invokeElementByHandle: invoked element "${handle}"`);
    return true;
  } catch (error) {
    log.debug('invokeElementByHandle error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Set the value of a UI Automation element directly via ValuePattern.
 * Works on Edit controls, text fields, etc.
 */
export async function setElementValueByHandle(handle: string, value: string): Promise<boolean> {
  if (!handle) return false;
  try {
    const nativeEl = resolveElement(handle);
    if (!nativeEl) return false;

    const nativeElRecord = nativeEl as Record<string, unknown>;
    const valuePattern = (nativeElRecord.getCurrentPattern as (id: number) => unknown)(PatternIds.ValuePatternId) as Record<string, unknown> | null;
    if (!valuePattern) {
      log.debug('setElementValueByHandle: element does not support ValuePattern');
      return false;
    }

    const isReadOnly = (valuePattern.currentIsReadOnly as boolean) ?? false;
    if (isReadOnly) {
      log.debug('setElementValueByHandle: element is read-only');
      return false;
    }

    (valuePattern.setValue as (val: string) => void)(value);
    log.debug(`setElementValueByHandle: set value on element "${handle}" to "${value.slice(0, 50)}"`);
    return true;
  } catch (error) {
    log.debug('setElementValueByHandle error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Extract text from a UI Automation element via TextPattern or ValuePattern.
 */
export async function getElementTextByHandle(handle: string): Promise<string | null> {
  if (!handle) return null;
  try {
    const nativeEl = resolveElement(handle);
    if (!nativeEl) return null;

    const nativeElRecord = nativeEl as Record<string, unknown>;
    const getPattern = nativeElRecord.getCurrentPattern as (id: number) => unknown;

    // Try ValuePattern first (simpler, direct value)
    const valuePattern = getPattern(PatternIds.ValuePatternId) as Record<string, unknown> | null;
    if (valuePattern) {
      return (valuePattern.currentValue as string) || '';
    }

    // Try TextPattern (for rich text containers)
    const textPattern = getPattern(PatternIds.TextPatternId) as Record<string, unknown> | null;
    if (textPattern) {
      // TextPattern has DocumentRange which has getText
      try {
        const docRange = textPattern.documentRange as Record<string, unknown>;
        if (docRange && typeof docRange.getText === 'function') {
          return (docRange.getText as (maxLength: number) => string)(5000);
        }
      } catch {
        // DocumentRange not accessible
      }
    }

    // Fallback: read currentName
    return (nativeElRecord.currentName as string) || null;
  } catch (error) {
    log.debug('getElementTextByHandle error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Get detailed element state for verification purposes.
 * Returns all available pattern states (Toggle, Value, Window, ExpandCollapse, etc.)
 */
export async function getElementStateByHandle(handle: string): Promise<Record<string, unknown> | null> {
  if (!handle) return null;
  try {
    const nativeEl = resolveElement(handle);
    if (!nativeEl) return null;

    const nativeElRecord = nativeEl as Record<string, unknown>;
    const getPattern = nativeElRecord.getCurrentPattern as (id: number) => unknown;

    const state: Record<string, unknown> = {
      name: nativeElRecord.currentName,
      controlType: nativeElRecord.currentControlType,
      isEnabled: nativeElRecord.currentIsEnabled,
      isOffscreen: nativeElRecord.currentIsOffscreen,
      hasKeyboardFocus: nativeElRecord.currentHasKeyboardFocus,
      boundingRectangle: nativeElRecord.currentBoundingRectangle,
    };

    // Check TogglePattern
    try {
      const togglePattern = getPattern(PatternIds.TogglePatternId) as Record<string, unknown>;
      if (togglePattern) {
        state.toggleState = togglePattern.currentToggleState;
        state.toggleStateName = togglePattern.currentToggleState === ToggleStates.On ? 'On' : togglePattern.currentToggleState === ToggleStates.Off ? 'Off' : 'Indeterminate';
      }
    } catch { /* not available */ }

    // Check ValuePattern
    try {
      const valuePattern = getPattern(PatternIds.ValuePatternId) as Record<string, unknown>;
      if (valuePattern) {
        state.value = valuePattern.currentValue;
        state.isReadOnly = valuePattern.currentIsReadOnly;
      }
    } catch { /* not available */ }

    // Check WindowPattern
    try {
      const windowPattern = getPattern(PatternIds.WindowPatternId) as Record<string, unknown>;
      if (windowPattern) {
        state.windowVisualState = windowPattern.currentWindowVisualState;
        state.windowVisualStateName = windowPattern.currentWindowVisualState === WindowVisualStates.Normal ? 'Normal' : windowPattern.currentWindowVisualState === WindowVisualStates.Maximized ? 'Maximized' : 'Minimized';
        state.windowInteractionState = windowPattern.currentWindowInteractionState;
      }
    } catch { /* not available */ }

    // Check ExpandCollapsePattern
    try {
      const expandPattern = getPattern(PatternIds.ExpandCollapsePatternId) as Record<string, unknown>;
      if (expandPattern) {
        state.expandCollapseState = expandPattern.currentExpandCollapseState;
        state.expandCollapseStateName = expandPattern.currentExpandCollapseState === ExpandCollapseStates.Expanded ? 'Expanded' : expandPattern.currentExpandCollapseState === ExpandCollapseStates.Collapsed ? 'Collapsed' : 'Other';
      }
    } catch { /* not available */ }

    // Check SelectionItemPattern
    try {
      const selPattern = getPattern(PatternIds.SelectionItemPatternId) as Record<string, unknown>;
      if (selPattern) {
        state.isSelected = selPattern.currentIsSelected;
      }
    } catch { /* not available */ }

    // Check RangeValuePattern (sliders, progress bars)
    try {
      const rangePattern = getPattern(PatternIds.RangeValuePatternId) as Record<string, unknown>;
      if (rangePattern) {
        state.rangeValue = rangePattern.currentValue;
        state.rangeMinimum = rangePattern.currentMinimum;
        state.rangeMaximum = rangePattern.currentMaximum;
      }
    } catch { /* not available */ }

    return state;
  } catch (error) {
    log.debug('getElementStateByHandle error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Search for elements by property condition.
 * Builds a property condition and uses FindAll to search the subtree.
 */
export async function searchElementsByCondition(
  rootHandle: string | null,
  propertyId: number,
  value: string | number,
  maxResults: number = 20,
  maxDepth: number = 5,
): Promise<UIAElement[]> {
  const results: UIAElement[] = [];
  try {
    const uia = getAutomation() as Record<string, unknown>;
    const condition = (uia.createPropertyCondition as (propertyId: number, value: string | number) => unknown)(propertyId, value);

    let root: unknown;
    if (rootHandle) {
      root = resolveElement(rootHandle);
      if (!root) return [];
    } else {
      root = (uia.getRootElement as () => unknown)();
    }

    const rawElements = ((root as Record<string, unknown>).findAll as (scope: number, cond: unknown) => unknown[])(TreeScope.Descendants, condition);
    const elements = Array.isArray(rawElements) ? rawElements : [];

    for (const el of elements) {
      if (results.length >= maxResults) break;
      const info = elementToInfo(el);
      if (info && info.name) {
        results.push(info);
      }
    }

    return results;
  } catch (error) {
    log.debug('searchElementsByCondition error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Cleanup: release all stored element handles and the automation instance.
 */
export function cleanupNativeUIA(): void {
  try {
    const uia = getAutomation() as Record<string, unknown>;
    (uia.removeAllEventHandlers as () => void)?.();
  } catch {
    // Ignore cleanup errors
  }
  automationInstance = null;
  clearElementHandles();
}
