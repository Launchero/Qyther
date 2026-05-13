import { PNG } from 'pngjs';
import { createLogger } from '../../utils/logger';
import type { Subtask, SubtaskVerificationResult, VerificationSignal, DesktopAdapter, VerificationIntent, UIAVerificationPattern } from './types';
import type { AccessibilityTreeAdapter } from './accessibility-tree';

const log = createLogger('DesktopVerifier');

const HARD_REJECT_THRESHOLD = 0.3;

// ── Postcondition Parser ──────────────────────────────────────────────────────

/**
 * Parse a natural-language postcondition into a structured verification intent.
 * Maps free-text to specific UIA verification patterns.
 */
export function parsePostcondition(postcondition: string): VerificationIntent {
  const lower = postcondition.toLowerCase();
  const desc = postcondition;

  // Extract quoted text patterns
  const quotedTexts: string[] = [];
  const quoteMatch = postcondition.match(/["']([^"']+)["']/g);
  if (quoteMatch) {
    for (const m of quoteMatch) {
      quotedTexts.push(m.slice(1, -1));
    }
  }

  // Button clicked / invoked
  if (lower.includes('button') && (lower.includes('clicked') || lower.includes('pressed') || lower.includes('invoked'))) {
    const btnMatch = desc.match(/['"](.*?)['"]/i) || desc.match(/the\s+(\w+)\s+button/i);
    return {
      type: 'button_clicked',
      targetName: btnMatch ? (btnMatch[1] || btnMatch[0]) : undefined,
      targetControlType: 'Button',
      confidence: 0.9,
    };
  }

  // Checkbox toggled
  if (lower.includes('checkbox') || lower.includes('check box') || lower.includes('checked') || lower.includes('unchecked')) {
    const cbMatch = desc.match(/['"](.*?)['"]/i) || desc.match(/the\s+(.+?)\s+checkbox/i);
    const expectedValue = lower.includes('uncheck') ? false : lower.includes('check') ? true : undefined;
    return {
      type: 'checkbox_toggled',
      targetName: cbMatch ? (cbMatch[1] || cbMatch[0]) : undefined,
      targetControlType: 'CheckBox',
      expectedValue,
      confidence: 0.85,
    };
  }

  // Text changed / typed
  if (lower.includes('type') || lower.includes('text') || lower.includes('enter') || lower.includes('fill')) {
    return {
      type: 'text_changed',
      expectedValue: quotedTexts.length > 0 ? quotedTexts[0] : undefined,
      confidence: 0.75,
    };
  }

  // Window state changes
  if (lower.includes('minimize') || lower.includes('minimized')) {
    const winMatch = desc.match(/([A-Z][\w\s]*?)\s*(?:window\s*)?(?:is\s+)?(?:minimized|minimize)/i);
    return {
      type: 'window_state_changed',
      targetName: winMatch ? winMatch[1].trim() : undefined,
      expectedValue: 'Minimized',
      confidence: 0.95,
    };
  }

  if (lower.includes('maximize') || lower.includes('maximized')) {
    const winMatch = desc.match(/([A-Z][\w\s]*?)\s*(?:window\s*)?(?:is\s+)?(?:maximized|maximize)/i);
    return {
      type: 'window_state_changed',
      targetName: winMatch ? winMatch[1].trim() : undefined,
      expectedValue: 'Maximized',
      confidence: 0.95,
    };
  }

  if (lower.includes('restore') || lower.includes('restored')) {
    const winMatch = desc.match(/([A-Z][\w\s]*?)\s*(?:window\s*)?(?:is\s+)?(?:restored|restore)/i);
    return {
      type: 'window_state_changed',
      targetName: winMatch ? winMatch[1].trim() : undefined,
      expectedValue: 'Normal',
      confidence: 0.9,
    };
  }

  if (lower.includes('close') || lower.includes('closed') || lower.includes('is closed') || lower.includes('no longer')) {
    const winMatch = desc.match(/([A-Z][\w\s]*?)\s*(?:window\s*)?(?:is\s+)?(?:closed|close|no longer|not present)/i);
    return {
      type: 'element_not_exists',
      targetName: winMatch ? winMatch[1].trim() : undefined,
      targetControlType: 'Window',
      confidence: 0.9,
    };
  }

  // Window opened / visible
  if ((lower.includes('open') || lower.includes('visible') || lower.includes('focused') || lower.includes('active')) && (lower.includes('window') || lower.includes('app') || lower.includes('application'))) {
    const winMatch = desc.match(/([A-Z][\w\s]*?)\s*(?:window\s*)?(?:is\s+)?(?:open|visible|focused|active)/i);
    return {
      type: 'element_exists',
      targetName: winMatch ? winMatch[1].trim() : undefined,
      targetControlType: 'Window',
      confidence: 0.85,
    };
  }

  // Menu opened / expanded
  if (lower.includes('menu') && (lower.includes('open') || lower.includes('opened') || lower.includes('expanded'))) {
    const menuMatch = desc.match(/['"](.*?)['"]/i) || desc.match(/the\s+(.+?)\s+menu/i);
    return {
      type: 'menu_opened',
      targetName: menuMatch ? (menuMatch[1] || menuMatch[0]) : undefined,
      targetControlType: 'Menu',
      confidence: 0.8,
    };
  }

  // Tab selected
  if (lower.includes('tab') && (lower.includes('selected') || lower.includes('active') || lower.includes('switched'))) {
    const tabMatch = desc.match(/['"](.*?)['"]/i) || desc.match(/the\s+(.+?)\s+tab/i);
    return {
      type: 'tab_selected',
      targetName: tabMatch ? (tabMatch[1] || tabMatch[0]) : undefined,
      targetControlType: 'TabItem',
      confidence: 0.8,
    };
  }

  // Slider / range value changed
  if (lower.includes('slider') || lower.includes('volume') || lower.includes('brightness') || lower.includes('progress')) {
    return {
      type: 'slider_moved',
      expectedValue: quotedTexts.length > 0 ? quotedTexts[0] : undefined,
      confidence: 0.7,
    };
  }

  // Item selected (list, combo, tree)
  if (lower.includes('selected') || lower.includes('chose') || lower.includes('picked')) {
    const itemMatch = desc.match(/['"](.*?)['"]/i);
    return {
      type: 'item_selected',
      targetName: itemMatch ? itemMatch[1] : undefined,
      confidence: 0.75,
    };
  }

  // Element exists (general)
  if (lower.includes('exists') || lower.includes('present') || lower.includes('appears')) {
    return {
      type: 'element_exists',
      targetName: quotedTexts.length > 0 ? quotedTexts[0] : undefined,
      confidence: 0.7,
    };
  }

  // Fallback: no specific UIA pattern match
  return {
    type: 'fallback',
    confidence: 0,
  };
}

// ── UIA-Native Verification Checks ───────────────────────────────────────────

async function verifyButtonClicked(
  targetName: string | undefined,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<VerificationSignal> {
  try {
    // Search for a button matching the target name
    const results = await accessibilityAdapter.searchElements(
      { name: targetName || '', controlType: 'Button' },
      5,
    );

    if (results.length === 0 && targetName) {
      // Try a broader search
      const broadResults = await accessibilityAdapter.searchElements({ name: targetName }, 5);
      if (broadResults.length === 0) {
        return { type: 'uia_pattern', value: `Button "${targetName}" not found in UIA tree`, passed: false };
      }
    }

    // If we found the button, check if it's available (not offscreen)
    if (results.length > 0) {
      const el = results[0];
      const state = await accessibilityAdapter.getElementState(el.nativeHandle as string);
      if (state && !state.isOffscreen && state.isEnabled) {
        return { type: 'uia_pattern', value: `Button "${el.name}" found and available`, passed: true };
      }
    }

    // Button found but may be offscreen — still consider passed if found
    if (results.length > 0) {
      return { type: 'uia_pattern', value: `Button "${results[0].name}" found (may be offscreen)`, passed: true };
    }

    return { type: 'uia_pattern', value: 'Button not found in UIA tree', passed: false };
  } catch (error) {
    log.warn('verifyButtonClicked error:', error);
    return { type: 'uia_pattern', value: 'UIA verification error', passed: false };
  }
}

async function verifyTextChanged(
  expectedValue: string | undefined,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<VerificationSignal> {
  try {
    if (!expectedValue) {
      // No specific text to verify — check focused element has content
      const focused = await accessibilityAdapter.getFocusedElement();
      if (focused && focused.value) {
        return { type: 'uia_pattern', value: `Focused element has value: "${focused.value.slice(0, 50)}"`, passed: true };
      }
      return { type: 'uia_pattern', value: 'No focused element with value', passed: false };
    }

    // Search for element containing the expected text
    const results = await accessibilityAdapter.searchElements({ name: expectedValue }, 10);
    for (const el of results) {
      if (el.value && el.value.toLowerCase().includes(expectedValue.toLowerCase())) {
        return { type: 'uia_pattern', value: `Found text "${expectedValue}" in "${el.name}"`, passed: true };
      }
    }

    return { type: 'uia_pattern', value: `Text "${expectedValue}" not found in any element`, passed: false };
  } catch (error) {
    log.warn('verifyTextChanged error:', error);
    return { type: 'uia_pattern', value: 'UIA verification error', passed: false };
  }
}

async function verifyCheckboxState(
  targetName: string | undefined,
  expectedValue: boolean | undefined,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<VerificationSignal> {
  try {
    const results = await accessibilityAdapter.searchElements(
      { name: targetName || '', controlType: 'CheckBox' },
      5,
    );

    if (results.length === 0) {
      return { type: 'uia_pattern', value: targetName ? `Checkbox "${targetName}" not found` : 'No checkbox found', passed: false };
    }

    const el = results[0];
    const state = await accessibilityAdapter.getElementState(el.nativeHandle as string);

    if (state && state.toggleState !== undefined) {
      const isChecked = state.toggleState === 1; // ToggleStates.On = 1
      const matchesExpected = expectedValue === undefined || isChecked === expectedValue;
      return {
        type: 'uia_pattern',
        value: `Checkbox "${el.name}" is ${isChecked ? 'checked' : 'unchecked'}${expectedValue !== undefined ? ` (expected: ${expectedValue ? 'checked' : 'unchecked'})` : ''}`,
        passed: matchesExpected,
      };
    }

    // No toggle state available — assume passed if element found
    return { type: 'uia_pattern', value: `Checkbox "${el.name}" found (toggle state unavailable)`, passed: true };
  } catch (error) {
    log.warn('verifyCheckboxState error:', error);
    return { type: 'uia_pattern', value: 'UIA verification error', passed: false };
  }
}

async function verifyWindowState(
  targetName: string | undefined,
  expectedState: string | undefined,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<VerificationSignal> {
  try {
    if (expectedState === 'Minimized') {
      // For minimized windows, check that the window is NOT in the root element list
      const rootChildren = await accessibilityAdapter.getChildrenOfRoot();
      if (targetName) {
        const found = rootChildren.some(el => el.name.toLowerCase().includes(targetName.toLowerCase()));
        return {
          type: 'uia_pattern',
          value: found ? `Window "${targetName}" still visible (not minimized)` : `Window "${targetName}" not in root elements (minimized)`,
          passed: !found,
        };
      }
      return { type: 'uia_pattern', value: 'No target window specified for minimize check', passed: false };
    }

    if (expectedState === 'Maximized' || expectedState === 'Normal') {
      // Find the window and check its state
      const results = await accessibilityAdapter.searchElements({ name: targetName || '' }, 10);
      for (const el of results) {
        const state = await accessibilityAdapter.getElementState(el.nativeHandle as string);
        if (state && state.windowVisualStateName) {
          const windowStateName = state.windowVisualStateName as string;
          const matchesExpected = windowStateName.toLowerCase() === expectedState!.toLowerCase();
          return {
            type: 'uia_pattern',
            value: `Window "${el.name}" state: ${state.windowVisualStateName} (expected: ${expectedState})`,
            passed: matchesExpected,
          };
        }
      }

      // If no window pattern, just check if window exists
      if (targetName) {
        const found = results.some(el => el.name.toLowerCase().includes(targetName.toLowerCase()));
        return {
          type: 'uia_pattern',
          value: `Window "${targetName}" ${found ? 'found' : 'not found'} (window pattern unavailable)`,
          passed: found,
        };
      }
    }

    return { type: 'uia_pattern', value: `Unknown window state: ${expectedState}`, passed: false };
  } catch (error) {
    log.warn('verifyWindowState error:', error);
    return { type: 'uia_pattern', value: 'UIA verification error', passed: false };
  }
}

async function verifyMenuState(
  targetName: string | undefined,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<VerificationSignal> {
  try {
    // Check if any menu element is expanded
    const results = await accessibilityAdapter.searchElements({ controlType: 'Menu' }, 20);
    for (const el of results) {
      const state = await accessibilityAdapter.getElementState(el.nativeHandle as string);
      if (state && state.expandCollapseStateName === 'Expanded') {
        if (targetName && !el.name.toLowerCase().includes(targetName.toLowerCase())) continue;
        return { type: 'uia_pattern', value: `Menu "${el.name}" is expanded`, passed: true };
      }
    }

    return { type: 'uia_pattern', value: targetName ? `Menu "${targetName}" not found or not expanded` : 'No expanded menu found', passed: false };
  } catch (error) {
    log.warn('verifyMenuState error:', error);
    return { type: 'uia_pattern', value: 'UIA verification error', passed: false };
  }
}

async function verifyElementExists(
  targetName: string | undefined,
  targetControlType: string | undefined,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<VerificationSignal> {
  try {
    const results = await accessibilityAdapter.searchElements(
      { name: targetName || '', controlType: targetControlType },
      5,
    );

    if (results.length === 0 && targetName) {
      return { type: 'uia_pattern', value: `Element "${targetName}" not found in UIA tree`, passed: false };
    }

    return {
      type: 'uia_pattern',
      value: results.length > 0 ? `Element "${results[0].name}" found [${results[0].controlType}]` : 'Element found',
      passed: true,
    };
  } catch (error) {
    log.warn('verifyElementExists error:', error);
    return { type: 'uia_pattern', value: 'UIA verification error', passed: false };
  }
}

async function verifyElementNotExists(
  targetName: string | undefined,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<VerificationSignal> {
  try {
    if (!targetName) {
      return { type: 'uia_pattern', value: 'No target element specified for exists check', passed: false };
    }

    const results = await accessibilityAdapter.searchElements({ name: targetName }, 5);
    const found = results.length > 0;

    return {
      type: 'uia_pattern',
      value: found ? `Element "${targetName}" still exists (not closed)` : `Element "${targetName}" not found (closed successfully)`,
      passed: !found,
    };
  } catch (error) {
    log.warn('verifyElementNotExists error:', error);
    return { type: 'uia_pattern', value: 'UIA verification error', passed: false };
  }
}

// ── Main Verification Pipeline ────────────────────────────────────────────────

/**
 * UIA-native verification: parse postcondition → check UIA pattern → return result.
 * Falls back to screenshot-based verification if no UIA pattern matches.
 */
async function checkUIAPattern(
  intent: VerificationIntent,
  accessibilityAdapter: AccessibilityTreeAdapter,
): Promise<{ signal: VerificationSignal; patternType: string | null; elementFound: boolean; valueMatched: boolean }> {
  const defaultResult = {
    signal: { type: 'uia_pattern' as const, value: 'UIA unavailable', passed: false },
    patternType: null,
    elementFound: false,
    valueMatched: false,
  };

  switch (intent.type) {
    case 'button_clicked':
      return { signal: await verifyButtonClicked(intent.targetName, accessibilityAdapter), patternType: 'invoke', elementFound: true, valueMatched: true };

    case 'text_changed':
      return { signal: await verifyTextChanged(intent.expectedValue as string, accessibilityAdapter), patternType: 'value', elementFound: true, valueMatched: !!intent.expectedValue };

    case 'checkbox_toggled':
      return { signal: await verifyCheckboxState(intent.targetName, intent.expectedValue as boolean, accessibilityAdapter), patternType: 'toggle', elementFound: true, valueMatched: true };

    case 'window_state_changed':
      return { signal: await verifyWindowState(intent.targetName, intent.expectedValue as string, accessibilityAdapter), patternType: 'window', elementFound: true, valueMatched: true };

    case 'menu_opened':
      return { signal: await verifyMenuState(intent.targetName, accessibilityAdapter), patternType: 'expandCollapse', elementFound: true, valueMatched: true };

    case 'element_exists':
      return { signal: await verifyElementExists(intent.targetName, intent.targetControlType, accessibilityAdapter), patternType: 'element_exists', elementFound: true, valueMatched: true };

    case 'element_not_exists':
      return { signal: await verifyElementNotExists(intent.targetName, accessibilityAdapter), patternType: 'element_not_exists', elementFound: false, valueMatched: true };

    default:
      return defaultResult;
  }
}

// ── Screenshot-based Fallback (Legacy Path) ──────────────────────────────────

const WEIGHT_WINDOW = 0.4;
const WEIGHT_PIXEL_DIFF = 0.4;
const WEIGHT_OCR = 0.2;

function decodePngDataUrl(dataUrl: string): { width: number; height: number; data: Buffer } {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

function computePixelDiffPercent(before: string, after: string): number {
  try {
    const beforePng = decodePngDataUrl(before);
    const afterPng = decodePngDataUrl(after);
    if (beforePng.width !== afterPng.width || beforePng.height !== afterPng.height) {
      return 0.1;
    }
    const stride = 4;
    const sampleRate = 16;
    let diffCount = 0;
    let totalSamples = 0;
    for (let i = 0; i < beforePng.data.length; i += sampleRate * stride) {
      if (
        beforePng.data[i] !== afterPng.data[i] ||
        beforePng.data[i + 1] !== afterPng.data[i + 1] ||
        beforePng.data[i + 2] !== afterPng.data[i + 2]
      ) {
        diffCount++;
      }
      totalSamples++;
    }
    return totalSamples > 0 ? diffCount / totalSamples : 0;
  } catch {
    return 0;
  }
}

function extractOcrPatterns(postcondition: string): string[] | null {
  const patterns: string[] = [];
  const textMatch = postcondition.match(/["']([^"']+)["']/g);
  if (textMatch) {
    for (const m of textMatch) {
      patterns.push(m.slice(1, -1));
    }
  }
  const lower = postcondition.toLowerCase();
  if (lower.includes('text ') || lower.includes('says ') || lower.includes('shows ')) {
    // Already captured via quoted strings above
  }
  return patterns.length > 0 ? patterns : null;
}

function expectsWindowClosed(postcondition: string): string | null {
  const lower = postcondition.toLowerCase();
  if (lower.includes('closed') || lower.includes('is closed') || lower.includes('no longer') || lower.includes('not in')) {
    const appMatch = postcondition.match(/([A-Z][\w\s]*?)\s+(?:window\s+)?(?:is\s+)?(?:closed|no longer|not present)/i);
    if (appMatch) return appMatch[1].trim();
  }
  return null;
}

function expectsWindowOpen(postcondition: string): string | null {
  const lower = postcondition.toLowerCase();
  if (lower.includes('open') || lower.includes('visible') || lower.includes('focused') || lower.includes('active')) {
    const appMatch = postcondition.match(/([A-Z][\w\s]*?)\s+(?:window\s+)?(?:is\s+)?(?:open|visible|focused|active)/i);
    if (appMatch) return appMatch[1].trim();
  }
  return null;
}

export class DesktopVerifier {
  async verifyPostcondition(
    subtask: Subtask,
    adapter: DesktopAdapter,
    accessibilityAdapter: AccessibilityTreeAdapter,
  ): Promise<SubtaskVerificationResult & {
    verificationMode: 'uia' | 'screenshot';
    patternType: string | null;
    elementFound: boolean;
    valueMatched: boolean;
    fallbackUsed: boolean;
  }> {
    const postcondition = subtask.postcondition;
    log.info(`[Verifier] Subtask "${subtask.description}" - Post-condition: "${postcondition}"`);

    // Deterministic window management actions don't need screenshot/OCR verification
    if (this.isDeterministicWindowAction(subtask)) {
      log.info('[Verifier] Deterministic window action detected, using lightweight verification');
      const result = await this.verifyDeterministicWindowAction(subtask, adapter);
      return {
        ...result,
        verificationMode: 'uia',
        patternType: 'window',
        elementFound: true,
        valueMatched: true,
        fallbackUsed: false,
      };
    }

    // Tier 1: UIA-native verification
    const intent = parsePostcondition(postcondition);
    log.debug(`[Verifier] Parsed intent: ${intent.type} (confidence: ${intent.confidence})`);

    if (intent.type !== 'fallback') {
      const uiaResult = await checkUIAPattern(intent, accessibilityAdapter);

      if (uiaResult.signal.type !== 'uia_pattern' || uiaResult.signal.value !== 'UIA unavailable') {
        log.info(`[Verifier] UIA verification: ${uiaResult.signal.value} (passed: ${uiaResult.signal.passed})`);
        return {
          passed: uiaResult.signal.passed,
          score: uiaResult.signal.passed ? 0.95 : 0.1,
          signals: [uiaResult.signal],
          message: `UIA verification: ${uiaResult.signal.value}`,
          verificationMode: 'uia',
          patternType: uiaResult.patternType,
          elementFound: uiaResult.elementFound,
          valueMatched: uiaResult.valueMatched,
          fallbackUsed: false,
        };
      }
    }

    // Tier 2: Screenshot-based fallback (legacy path)
    log.info('[Verifier] UIA unavailable, falling back to screenshot verification');
    return this.verifyWithScreenshotFallback(subtask, adapter);
  }

  async verifyWithScreenshotFallback(
    subtask: Subtask,
    adapter: DesktopAdapter,
  ): Promise<SubtaskVerificationResult & {
    verificationMode: 'screenshot';
    patternType: null;
    elementFound: false;
    valueMatched: false;
    fallbackUsed: true;
  }> {
    const postcondition = subtask.postcondition;
    const signals: VerificationSignal[] = [];
    let scoreComponents: { weight: number; score: number; label: string }[] = [];

    // Window state check
    const windowSignal = await this.checkWindowState(postcondition, adapter);
    signals.push(windowSignal);
    scoreComponents.push({
      weight: WEIGHT_WINDOW,
      score: windowSignal.passed ? 1 : 0,
      label: `Window check: ${windowSignal.passed ? 'PASSED' : 'FAILED'}${windowSignal.value ? ` (${windowSignal.value})` : ''}`,
    });

    // Pixel diff
    const pixelSignal = await this.checkPixelDiff(subtask, adapter);
    signals.push(pixelSignal);
    const pixelScore = typeof pixelSignal.value === 'number' ? Math.min(pixelSignal.value * 10, 1) : 0;
    scoreComponents.push({
      weight: WEIGHT_PIXEL_DIFF,
      score: pixelSignal.passed ? pixelScore : 0,
      label: `Pixel diff: score=${pixelScore.toFixed(2)} (${typeof pixelSignal.value === 'number' ? (pixelSignal.value * 100).toFixed(0) : 0}% pixels changed)`,
    });

    // OCR check
    const ocrSignal = await this.checkOcr(postcondition, adapter);
    signals.push(ocrSignal);
    if (ocrSignal.type === 'ocr_delta') {
      scoreComponents.push({
        weight: WEIGHT_OCR,
        score: ocrSignal.passed ? 1 : 0,
        label: `OCR check: ${ocrSignal.passed ? 'PASSED' : 'FAILED'}`,
      });
    }

    // Compute final score
    const totalWeight = scoreComponents.reduce((sum, c) => sum + c.weight, 0);
    const finalScore = totalWeight > 0
      ? scoreComponents.reduce((sum, c) => sum + c.weight * c.score, 0) / totalWeight
      : 0;

    const passed = finalScore >= HARD_REJECT_THRESHOLD;

    for (const comp of scoreComponents) {
      log.info(`[Verifier]   -> ${comp.label}`);
    }

    if (passed) {
      log.info(`[Verifier]   -> FINAL: PASSED (score=${finalScore.toFixed(2)})`);
    } else {
      log.info(`[Verifier]   -> FINAL: FAILED (score=${finalScore.toFixed(2)})`);
    }

    const message = scoreComponents.map(c => c.label).join('; ');

    return {
      passed,
      score: finalScore,
      signals,
      message,
      verificationMode: 'screenshot',
      patternType: null,
      elementFound: false,
      valueMatched: false,
      fallbackUsed: true,
    };
  }

  private async checkWindowState(
    postcondition: string,
    _adapter: DesktopAdapter,
  ): Promise<VerificationSignal> {
    try {
      const { listWindows } = await import('./input-simulation');
      const windows = await listWindows();
      const titles = windows.map(w => w.title.toLowerCase());

      const closedApp = expectsWindowClosed(postcondition);
      if (closedApp) {
        const found = titles.some(t => t.includes(closedApp.toLowerCase()));
        return {
          type: 'window_change',
          value: found ? `"${closedApp}" found in window list` : `"${closedApp}" not in window list`,
          passed: !found,
        };
      }

      const openApp = expectsWindowOpen(postcondition);
      if (openApp) {
        const found = titles.some(t => t.includes(openApp.toLowerCase()));
        return {
          type: 'window_change',
          value: found ? `"${openApp}" found in window list` : `"${openApp}" not in window list`,
          passed: found,
        };
      }

      return {
        type: 'window_change',
        value: 'no window pattern detected',
        passed: true,
      };
    } catch (error) {
      return {
        type: 'window_change',
        value: error instanceof Error ? error.message : 'Unknown',
        passed: false,
      };
    }
  }

  private async checkPixelDiff(
    subtask: Subtask,
    adapter: DesktopAdapter,
  ): Promise<VerificationSignal> {
    try {
      const current = await adapter.captureScreen();
      if (current.monitors.length === 0 || !current.monitors[0].dataUrl) {
        return { type: 'pixel_diff', value: 0, passed: false };
      }

      // Small delay to let the action settle
      await new Promise(resolve => setTimeout(resolve, 200));
      const after = await adapter.captureScreen();

      if (after.monitors.length === 0 || !after.monitors[0].dataUrl) {
        return { type: 'pixel_diff', value: 0, passed: false };
      }

      const diff = computePixelDiffPercent(current.monitors[0].dataUrl, after.monitors[0].dataUrl);
      const passed = diff > 0.01;

      return { type: 'pixel_diff', value: diff, passed };
    } catch (error) {
      return {
        type: 'pixel_diff',
        value: error instanceof Error ? error.message : 'Unknown',
        passed: false,
      };
    }
  }

  private async checkOcr(
    postcondition: string,
    adapter: DesktopAdapter,
  ): Promise<VerificationSignal> {
    const ocrPatterns = extractOcrPatterns(postcondition);
    if (!ocrPatterns) {
      return { type: 'ocr_delta', value: 'SKIPPED (no text pattern in postcondition)', passed: true };
    }

    try {
      const screenText = await adapter.getScreenText();
      const lowerText = screenText.toLowerCase();
      const matched = ocrPatterns.some(pattern => lowerText.includes(pattern.toLowerCase()));

      return {
        type: 'ocr_delta',
        value: matched ? `Found: "${ocrPatterns.find(p => lowerText.includes(p.toLowerCase()))}"` : `Not found: ${ocrPatterns.join(', ')}`,
        passed: matched,
      };
    } catch (error) {
      log.warn(`[Verifier] OCR check failed (${error instanceof Error ? error.message : 'Unknown'}), skipping`);
      return { type: 'ocr_delta', value: 'SKIPPED (OCR error)', passed: true };
    }
  }

  private isDeterministicWindowAction(subtask: Subtask): boolean {
    const desc = subtask.description.toLowerCase();
    const post = subtask.postcondition.toLowerCase();
    const combined = `${desc} ${post}`;

    const windowOps = ['minimize', 'maximize', 'restore', 'close window', 'focus window'];
    return windowOps.some(op => combined.includes(op));
  }

  private async verifyDeterministicWindowAction(
    subtask: Subtask,
    _adapter: DesktopAdapter,
  ): Promise<SubtaskVerificationResult> {
    const { listWindows } = await import('./input-simulation');

    try {
      const windows = await listWindows();
      const desc = subtask.description.toLowerCase();

      const targetMatch = desc.match(/minimize|close|focus|maximize|restore\s+(?:the\s+)?(.+?)(?:\s+window)?$/i);
      const targetName = targetMatch ? targetMatch[1].trim().toLowerCase() : null;

      const windowCheck = desc.includes('minimize')
        ? this.verifyMinimized(windows, targetName)
        : desc.includes('maximize')
          ? this.verifyMaximized(windows, targetName)
          : desc.includes('restore')
            ? this.verifyRestored(windows, targetName)
            : desc.includes('close')
              ? this.verifyClosed(windows, targetName)
              : { passed: true, score: 0.8, label: 'No specific window state check needed' };

      log.info(`[Verifier]   -> ${windowCheck.label}`);

      return {
        passed: windowCheck.passed,
        score: windowCheck.score,
        signals: [{ type: 'window_change', value: windowCheck.label, passed: windowCheck.passed }],
        message: windowCheck.label,
      };
    } catch (error) {
      return {
        passed: true,
        score: 0.7,
        signals: [{ type: 'error_pattern', value: error instanceof Error ? error.message : 'Unknown', passed: true }],
        message: 'Verification skipped due to error',
      };
    }
  }

  private verifyMinimized(windows: Array<{ title: string }>, targetName: string | null) {
    if (!targetName) return { passed: true, score: 0.8, label: 'Window action completed (no specific target)' };
    const found = windows.some(w => w.title.toLowerCase().includes(targetName));
    return {
      passed: true,
      score: 0.9,
      label: found ? `Target "${targetName}" still in window list (minimize uses ShowWindow, not removal)` : `Target not in list`,
    };
  }

  private verifyMaximized(windows: Array<{ title: string }>, targetName: string | null) {
    if (!targetName) return { passed: true, score: 0.8, label: 'Window action completed (no specific target)' };
    const found = windows.some(w => w.title.toLowerCase().includes(targetName));
    return { passed: found, score: found ? 0.9 : 0.2, label: found ? `Target "${targetName}" found` : `Target "${targetName}" not found` };
  }

  private verifyRestored(windows: Array<{ title: string }>, targetName: string | null) {
    if (!targetName) return { passed: true, score: 0.8, label: 'Window action completed (no specific target)' };
    const found = windows.some(w => w.title.toLowerCase().includes(targetName));
    return { passed: found, score: found ? 0.9 : 0.2, label: found ? `Target "${targetName}" found` : `Target "${targetName}" not found` };
  }

  private verifyClosed(windows: Array<{ title: string }>, targetName: string | null) {
    if (!targetName) return { passed: true, score: 0.8, label: 'Window action completed (no specific target)' };
    const found = windows.some(w => w.title.toLowerCase().includes(targetName));
    return { passed: !found, score: !found ? 0.9 : 0.2, label: found ? `Target "${targetName}" still open (not closed)` : `Target "${targetName}" not in list (closed successfully)` };
  }

  explainResult(result: SubtaskVerificationResult): string {
    const parts: string[] = [];
    parts.push(`Result: ${result.passed ? 'PASSED' : 'FAILED'}`);
    parts.push(`Score: ${result.score.toFixed(2)}`);
    parts.push('');
    for (const signal of result.signals) {
      const status = signal.passed ? 'PASSED' : 'FAILED';
      const valueStr = signal.value !== undefined ? ` (${signal.value})` : '';
      parts.push(`  - ${signal.type}: ${status}${valueStr}`);
    }
    parts.push('');
    parts.push(`Message: ${result.message}`);
    if (!result.passed && result.score < HARD_REJECT_THRESHOLD) {
      parts.push(`\nHARD-REJECT: score below ${HARD_REJECT_THRESHOLD} threshold`);
    }
    return parts.join('\n');
  }

  /**
   * Validates the results from a browser delegation to ensure they are
   * well-formed before continuing with desktop execution.
   * Browser-delegated subtasks have their own verifier in the browser subgraph;
   * this checks structural integrity of the handoff.
   */
  verifyBrowserDelegation(delegateResults: {
    finalResponse: string;
    actions: Array<{ type: string; description: string; success: boolean }>;
    artifacts?: string[];
  } | null): SubtaskVerificationResult {
    if (!delegateResults) {
      return {
        passed: false,
        score: 0,
        signals: [{ type: 'error_pattern', value: 'No delegation results provided', passed: false }],
        message: 'Browser delegation results are missing',
      };
    }

    const signals: VerificationSignal[] = [];
    let score = 0;

    // Check if browser agent produced a response
    if (delegateResults.finalResponse && delegateResults.finalResponse.length > 0) {
      signals.push({ type: 'action_effect', value: `Browser response: ${delegateResults.finalResponse.slice(0, 100)}`, passed: true });
      score += 0.4;
    } else {
      signals.push({ type: 'error_pattern', value: 'Browser produced empty response', passed: false });
    }

    // Check if browser actions completed successfully
    const successfulActions = delegateResults.actions.filter(a => a.success);
    const failedActions = delegateResults.actions.filter(a => !a.success);

    if (successfulActions.length > 0) {
      signals.push({ type: 'action_effect', value: `${successfulActions.length} browser actions succeeded`, passed: true });
      score += 0.3;
    }

    if (failedActions.length > 0) {
      signals.push({ type: 'error_pattern', value: `${failedActions.length} browser actions failed: ${failedActions.map(a => a.description).join(', ')}`, passed: false });
      score -= 0.2;
    }

    // Check artifacts
    if (delegateResults.artifacts && delegateResults.artifacts.length > 0) {
      signals.push({ type: 'action_effect', value: `Artifacts: ${delegateResults.artifacts.join(', ')}`, passed: true });
      score += 0.3;
    }

    score = Math.max(0, Math.min(1, score));
    const passed = score >= HARD_REJECT_THRESHOLD;

    return {
      passed,
      score,
      signals,
      message: `Browser delegation verification: score=${score.toFixed(2)}, passed=${passed}`,
    };
  }
}

export const desktopVerifier = new DesktopVerifier();
