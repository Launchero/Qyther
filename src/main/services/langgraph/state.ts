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
  type: 'table' | 'comparison' | 'form' | 'list' | 'chart';
  title: string;
  data: Record<string, unknown>;
  node: string;
}

export interface DesktopAction {
  type: string;
  description: string;
  success: boolean;
  result?: string;
}

// Replace reducer: each node output fully replaces the previous value.
// Prevents stale accumulation across graph runs when a thread is reused.
const replaceArray = <T>() => (_a: T[] | undefined, b: T[]) => b;

export const AskState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: replaceArray<BaseMessage>(),
    default: () => [],
  }),
  userQuery: Annotation<string>,
  attachments: Annotation<Attachment[]>({
    reducer: replaceArray<Attachment>(),
    default: () => [],
  }),
  intent: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "general",
  }),
  researchResults: Annotation<string[]>({
    reducer: replaceArray<string>(),
    default: () => [],
  }),
  sources: Annotation<Source[]>({
    reducer: replaceArray<Source>(),
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
  qualityScore: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  complexityScore: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "simple",
  }),
  searchQueries: Annotation<string[]>({
    reducer: replaceArray<string>(),
    default: () => [],
  }),
  verified: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  uiPayloads: Annotation<UIPayload[]>({
    reducer: replaceArray<UIPayload>(),
    default: () => [],
  }),
  previousIntent: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "general",
  }),
  desktopActions: Annotation<DesktopAction[]>({
    reducer: replaceArray<DesktopAction>(),
    default: () => [],
  }),
});

export type AskStateType = typeof AskState.State;
