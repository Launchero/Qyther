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
} from './types';
export { AccessibilityTreeAdapter } from './accessibility-tree';
export { GroundTruthVerifier } from './verifier';
export { captureAllScreens, captureSingleMonitor } from './screenshot-capture';
export * as inputSim from './input-simulation';

// The agent, the 32 tools, the planner/verifier/recovery ladder and the graph node that
// used to live here are gone. The agent is ../pi/agent.ts; the tools are ../pi/toolbox.ts.
// desktop-agent.ts, desktop-subgraph.ts, desktop-planner.ts, desktop-verifier.ts,
// desktop-recovery.ts, desktop-memory.ts and desktop-tools.ts were deleted at the Pi
// cutover, and DANGER_POLICY went with them - the verifier opt-in now rides
// details.verifies on the tool itself.
