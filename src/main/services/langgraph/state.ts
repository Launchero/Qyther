import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export interface Source {
  url: string;
  title: string;
  excerpt: string;
}

export interface ReasoningStep {
  step: string;
  status: "pending" | "in_progress" | "completed" | "error";
  detail: string;
}

export interface Attachment {
  name: string;
  content: string;
  type: string;
}

export interface UIPayload {
  type: 'table' | 'comparison' | 'form' | 'list';
  title: string;
  data: Record<string, unknown>;
  node: string;
}

export const AskState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  userQuery: Annotation<string>,
  attachments: Annotation<Attachment[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  intent: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "general",
  }),
  researchResults: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  sources: Annotation<Source[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  finalResponse: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
  reasoningSteps: Annotation<ReasoningStep[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  validationScore: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  retryCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  validationVerdict: Annotation<"approved" | "rewrite" | "replan">({
    reducer: (_a, b) => b,
    default: () => "approved",
  }),
  validationCritique: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
  confidence: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  complexityScore: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "simple",
  }),
  searchQueries: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  verified: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  uiPayloads: Annotation<UIPayload[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type AskStateType = typeof AskState.State;
