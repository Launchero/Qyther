/**
 * Shared types for the browser skill system and subgraph.
 */

export interface BrowserSubtask {
  id: string;
  description: string;
  preconditions: string;
  postcondition: string;
  assignedSkill?: string; // Skill name to use for this subtask
  maxRetries?: number;
}

export interface BrowserExecutionTraceEntry {
  node: string;
  enterMs: number;
  exitMs: number;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
}

export interface BrowserTrajectoryRecord {
  id: string;
  taskDescription: string;
  steps: Array<{
    stepIndex: number;
    tool: string;
    args: Record<string, unknown>;
    result: string;
    durationMs: number;
    success: boolean;
  }>;
  outcome: string;
  success: boolean;
  createdAt: number;
}

export interface BrowserSkillMetadata {
  name: string;
  description: string;
  category: "navigation" | "interaction" | "extraction" | "scraping" | "authentication" | "visual";
}

export interface BrowserSkillContent {
  name: string;
  description: string;
  instructions: string;
  resources?: string[]; // Paths to reference files
  scripts?: string[];   // Paths to executable scripts
}

export interface BrowserRecoveryAction {
  strategy: "retry" | "alternative" | "replan" | "skip" | "abort";
  reason: string;
  suggestedApproach?: string;
}

export interface BrowserVerificationResult {
  passed: boolean;
  score: number;
  signals: string[];
  message: string;
}
