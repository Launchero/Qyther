import { createLogger } from '../../utils/logger';

const log = createLogger('AccessibilityTree');

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
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    // uia-native initializes lazily on first call
    this.isInitialized = true;
    log.info('UI Automation adapter initialized (native, no PowerShell)');
  }

  async getFocusedElement(): Promise<AccessibilityElementInfo | null> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { getFocusedElementViaAutomation } = await import('./uia-native');
      const element = await getFocusedElementViaAutomation();
      if (!element) return null;
      return this.mapElement(element);
    } catch (error) {
      log.warn('getFocusedElement failed:', error);
      return null;
    }
  }

  async getChildren(_elementHandle: string): Promise<AccessibilityElementInfo[]> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { findChildrenOfRoot } = await import('./uia-native');
      const elements = await findChildrenOfRoot(100);
      return elements.map(el => this.mapElement(el));
    } catch (error) {
      log.warn('getChildren failed:', error);
      return [];
    }
  }

  async getChildrenOfRoot(): Promise<AccessibilityElementInfo[]> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { findChildrenOfRoot } = await import('./uia-native');
      const elements = await findChildrenOfRoot(50);
      return elements.map(el => this.mapElement(el));
    } catch (error) {
      log.warn('getChildrenOfRoot failed:', error);
      return [];
    }
  }

  async getElementAtPoint(x: number, y: number): Promise<AccessibilityElementInfo | null> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { getElementFromPoint } = await import('./uia-native');
      const element = await getElementFromPoint(x, y);
      if (!element) return null;
      return this.mapElement(element);
    } catch (error) {
      log.warn('getElementAtPoint failed:', error);
      return null;
    }
  }

  async searchElements(
    query: { name?: string; controlType?: string; automationId?: string },
    maxResults: number = 20,
  ): Promise<AccessibilityElementInfo[]> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { findChildrenOfRoot, getChildrenOfElementViaAutomation } = await import('./uia-native');
      const rootElements = await findChildrenOfRoot(100);

      const results: AccessibilityElementInfo[] = [];
      const visitedHandles = new Set<string>();

      const matchesQuery = (el: Record<string, unknown>): boolean => {
        const name = (el.name as string) || '';
        const controlType = (el.controlType as string) || 'Unknown';
        const automationId = (el.automationId as string) || '';

        if (query.name && !name.toLowerCase().includes(query.name.toLowerCase())) return false;
        if (query.controlType && controlType.toLowerCase() !== query.controlType.toLowerCase()) return false;
        if (query.automationId && automationId.toLowerCase() !== query.automationId.toLowerCase()) return false;
        return true;
      };

      const pushResult = (el: Record<string, unknown>) => {
        const name = (el.name as string) || '';
        if (!name) return;
        results.push(this.mapElement(el as unknown as { name: string; controlType: string; controlTypeId: number; boundingBox: { x: number; y: number; width: number; height: number }; isFocused: boolean; isEnabled: boolean; hasKeyboardFocus: boolean; automationId: string; className: string; helpText: string; value: string; patternsAvailable: string[]; childrenCount: number; nativeHandle: string }));
      };

      const searchInElement = async (el: Record<string, unknown>, depth: number) => {
        if (results.length >= maxResults || depth > 5) return;

        const name = (el.name as string) || '';
        const handle = (el.nativeHandle as string) || '';

        if (name && matchesQuery(el) && !visitedHandles.has(handle)) {
          pushResult(el);
          visitedHandles.add(handle);
        }

        if (depth < 5 && handle) {
          try {
            const childElements = await getChildrenOfElementViaAutomation(handle, 50);
            for (const child of childElements) {
              if (results.length >= maxResults) break;
              await searchInElement(child as unknown as Record<string, unknown>, depth + 1);
            }
          } catch {
            // Some elements don't support child enumeration; skip
          }
        }
      };

      for (const rootEl of rootElements) {
        if (results.length >= maxResults) break;
        await searchInElement(rootEl as unknown as Record<string, unknown>, 0);
      }

      return results;
    } catch (error) {
      log.warn('searchElements failed:', error);
      return [];
    }
  }

  async clickElement(elementName: string): Promise<boolean> {
    try {
      if (!this.isInitialized) await this.initialize();

      const results = await this.searchElements({ name: elementName }, 1);
      if (results.length > 0) {
        const match = results[0];
        const handle = match.nativeHandle as string;
        if (handle) {
          // Try native InvokePattern first
          const { invokeElementByHandle } = await import('./uia-native');
          const invoked = await invokeElementByHandle(handle);
          if (invoked) {
            log.debug(`Invoked element "${elementName}" via native InvokePattern`);
            return true;
          }
        }
        // Fallback: coordinate-based click
        if (match.boundingBox.width > 0 && match.boundingBox.height > 0) {
          const centerX = match.boundingBox.x + match.boundingBox.width / 2;
          const centerY = match.boundingBox.y + match.boundingBox.height / 2;
          const { click } = await import('./input-simulation');
          await click(centerX, centerY, 'left');
          log.debug(`Clicked element "${elementName}" at (${centerX}, ${centerY}) via fallback`);
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

  async getTreeSnapshot(maxDepth: number = 3): Promise<TreeSnapshotNode[]> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { findChildrenOfRoot } = await import('./uia-native');
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

  // ── Native UIA Pattern Methods (NEW) ──

  /**
   * Invoke a UI element directly via InvokePattern (no coordinate clicking).
   */
  async invokeElement(elementHandle: string): Promise<boolean> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { invokeElementByHandle } = await import('./uia-native');
      return invokeElementByHandle(elementHandle);
    } catch (error) {
      log.warn('invokeElement failed:', error);
      return false;
    }
  }

  /**
   * Set the value of a text field directly via ValuePattern.
   */
  async setElementValue(elementHandle: string, value: string): Promise<boolean> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { setElementValueByHandle } = await import('./uia-native');
      return setElementValueByHandle(elementHandle, value);
    } catch (error) {
      log.warn('setElementValue failed:', error);
      return false;
    }
  }

  /**
   * Extract text from a UI element via TextPattern or ValuePattern.
   */
  async getElementText(elementHandle: string): Promise<string | null> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { getElementTextByHandle } = await import('./uia-native');
      return getElementTextByHandle(elementHandle);
    } catch (error) {
      log.warn('getElementText failed:', error);
      return null;
    }
  }

  /**
   * Get detailed element state for verification (toggle state, value, window state, etc.).
   */
  async getElementState(elementHandle: string): Promise<Record<string, unknown> | null> {
    try {
      if (!this.isInitialized) await this.initialize();
      const { getElementStateByHandle } = await import('./uia-native');
      return getElementStateByHandle(elementHandle);
    } catch (error) {
      log.warn('getElementState failed:', error);
      return null;
    }
  }

  // ── Private ──

  private mapElement(el: {
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
  }): AccessibilityElementInfo {
    return {
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
    };
  }

  cleanup(): void {
    try {
      import('./uia-native').then(({ cleanupNativeUIA }) => cleanupNativeUIA());
    } catch {
      // Ignore cleanup errors
    }
    this.isInitialized = false;
  }
}
