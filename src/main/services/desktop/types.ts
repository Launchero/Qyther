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
  type: 'pixel_diff' | 'window_change' | 'action_effect' | 'ocr_delta' | 'error_pattern';
  value?: number | string;
  passed: boolean;
  hardReject?: boolean;
}

export interface VerificationResult {
  score: number;
  signals: VerificationSignal[];
  hardReject: boolean;
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
  focusWindow(handle: string): Promise<boolean>;
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
  | 'get_selected_text';

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
