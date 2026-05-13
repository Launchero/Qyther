export interface Coordinates {
  x: number;
  y: number;
}

export interface MonitorCapture {
  monitorIndex: number;
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

export interface ScreenshotResult {
  monitors: MonitorCapture[];
  timestamp: number;
  primaryIndex: number;
}

export interface DesktopAction {
  tool: string;
  args: Record<string, unknown>;
  confirmed: boolean;
}

export interface VerificationSignal {
  type: 'pixel_diff' | 'window_change' | 'action_effect' | 'ocr_delta' | 'error_pattern' | 'uia_pattern';
  value?: number | string;
  passed: boolean;
  hardReject?: boolean;
}

export interface VerificationResult {
  score: number;
  signals: VerificationSignal[];
  hardReject: boolean;
}

export interface WindowHandle {
  /** Opaque HWND pointer — pass directly to FFI calls */
  hWnd: unknown;
  /** Display name for the window (title) */
  title: string;
}

export interface DesktopAdapter {
  captureScreen(monitorIndex?: number): Promise<ScreenshotResult>;
  click(x: number, y: number, button?: 'left' | 'right'): Promise<void>;
  doubleClick(x: number, y: number): Promise<void>;
  drag(from: Coordinates, to: Coordinates): Promise<void>;
  typeText(text: string): Promise<void>;
  pressKeys(keys: string[]): Promise<void>;
  scroll(x: number, y: number, delta: number): Promise<void>;
  getScreenText(): Promise<string>;
  getWindowInfo(): Promise<{
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  setCursorPosition(x: number, y: number): Promise<void>;
  rightClick(x: number, y: number): Promise<void>;
  hover(x: number, y: number): Promise<void>;
  focusWindow(hWnd: unknown): Promise<boolean>;
  minimizeWindow(hWnd: unknown): Promise<boolean>;
  maximizeWindow(hWnd: unknown): Promise<boolean>;
  restoreWindow(hWnd: unknown): Promise<boolean>;
  closeWindow(hWnd: unknown): Promise<boolean>;
}

export type DangerLevel = 'safe' | 'reviewable' | 'dangerous';

export type DesktopToolName =
  | 'screenshot'
  | 'click'
  | 'double_click'
  | 'type_text'
  | 'key_combo'
  | 'scroll'
  | 'drag'
  | 'get_screen_text'
  | 'get_window_info'
  | 'move_mouse'
  | 'launch_app'
  | 'wait'
  | 'right_click'
  | 'clipboard'
  | 'get_window_list'
  | 'get_element_info'
  | 'click_element'
  | 'search_elements'
  | 'focus_window'
  | 'hover'
  | 'file_operations'
  | 'get_selected_text'
  | 'minimize_window'
  | 'maximize_window'
  | 'restore_window'
  | 'close_window'
  | 'execute_command'
  | 'invoke_element'
  | 'set_element_value'
  | 'get_element_text'
  | 'hold_key'
  | 'navigate_to_path';

/**
 * Structured UI Automation verification pattern for postcondition checking.
 * Maps a natural-language postcondition to a specific UIA pattern check.
 */
export interface UIAVerificationPattern {
  patternType: 'invoke' | 'toggle' | 'value' | 'text' | 'window' | 'expandCollapse' | 'selection' | 'rangeValue' | 'element_exists' | 'element_not_exists';
  elementHandle?: string;
  expectedValue?: string | boolean | number;
  actualValue?: string | boolean | number;
  matched: boolean;
}

/**
 * Structured result from the UIA-first verification pipeline.
 * Includes metadata about which verification mode was used.
 */
export interface StructuredVerificationResult {
  mode: 'uia' | 'pixel' | 'fallback';
  patternType: string | null;
  elementFound: boolean;
  valueMatched: boolean;
  fallbackUsed: boolean;
}

/**
 * Verification intent parsed from a natural-language postcondition.
 * Maps free-text to structured verification type for UIA pattern routing.
 */
export interface VerificationIntent {
  type:
    | 'button_clicked'
    | 'text_changed'
    | 'checkbox_toggled'
    | 'window_state_changed'
    | 'menu_opened'
    | 'tab_selected'
    | 'slider_moved'
    | 'item_selected'
    | 'element_exists'
    | 'element_not_exists'
    | 'fallback';
  targetName?: string;
  targetControlType?: string;
  expectedValue?: string | boolean | number;
  confidence: number;
}

export interface PendingAction {
  tool: DesktopToolName;
  args: Record<string, unknown>;
  dangerLevel: DangerLevel;
  sessionId: string;
  timestamp: number;
}

export interface DesktopActionDeniedEvent {
  type: 'action_denied';
  action: {
    tool: string;
    args: Record<string, unknown>;
    sessionId: string;
    confirmationId: string;
  };
}

// ── Hierarchical Subgraph Types (Task 2) ─────────────────────────────────────

/**
 * A single step within a trajectory record.
 */
export interface TrajectoryStep {
  stepIndex: number;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
  success: boolean;
}

/**
 * A complete task execution record for episodic memory.
 */
export interface TrajectoryRecord {
  id: string;
  taskDescription: string;
  steps: TrajectoryStep[];
  outcome: string;
  success: boolean;
  createdAt: number;
}

/**
 * A subtask within a hierarchical plan.
 */
export interface Subtask {
  id: string;
  description: string;
  precondition: string;
  postcondition: string;
  maxSteps: number;
  status: 'pending' | 'executing' | 'verified' | 'failed' | 'skipped';
  /** When true, this subtask requires browser automation and should be delegated */
  requiresBrowser?: boolean;
}

/**
 * Result from post-condition verification.
 */
export interface SubtaskVerificationResult {
  passed: boolean;
  score: number;
  signals: VerificationSignal[];
  message: string;
}

/**
 * Recovery action from the recovery node.
 */
export interface RecoveryAction {
  strategy: 'retry' | 'alternative' | 'replan' | 'skip' | 'abort';
  retryDelayMs?: number;
  replacementTool?: DesktopToolName;
  replacementArgs?: Record<string, unknown>;
  reason: string;
}

/**
 * Entry in the execution trace for debugging.
 */
export interface ExecutionTraceEntry {
  node: string;
  enterMs: number;
  exitMs: number;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
}

/**
 * Entry in the browser execution trace for debugging (mirrored from browser types).
 * Imported here to avoid circular dependencies between desktop and browser modules.
 */
export interface BrowserExecutionTraceEntry {
  node: string;
  enterMs: number;
  exitMs: number;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
}
