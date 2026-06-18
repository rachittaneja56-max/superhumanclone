import "server-only";

export type AgentIntent =
  | "triage"
  | "summarizer"
  | "reply"
  | "compose"
  | "search"
  | "digest"
  | "meetingPrep"
  | "calendar"
  | "action"
  | "general";

export interface AgentContext {
  userId: string;
  sessionId: string;
  userMessage: string;
  threadContext?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  allowMemory?: boolean;
}

export interface AgentResult {
  text: string;
  indicator?: string;
  intent: AgentIntent;
}
