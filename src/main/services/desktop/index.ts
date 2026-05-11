export { desktopAgent, DesktopAgent, type DesktopTaskProgress } from './desktop-agent';
export { WindowsDesktopAdapter } from './windows-adapter';
export type {
  DesktopAdapter,
  Coordinates,
  MonitorCapture,
  ScreenshotResult,
  DesktopAction,
  VerificationSignal,
  VerificationResult,
  DangerLevel,
  DesktopToolName,
  PendingAction,
} from './types';
export { AccessibilityTreeAdapter } from './accessibility-tree';
export { GroundTruthVerifier } from './verifier';
export { captureAllScreens, captureSingleMonitor } from './screenshot-capture';
export * as inputSim from './input-simulation';
