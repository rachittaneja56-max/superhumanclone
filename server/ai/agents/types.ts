import "server-only";

export type AgentIntent =
  | "triage"
  | "summarizer"
  | "reply"
  | "compose"
  | "calendar"
  | "action"
  | "general";

export interface AgentContext {
  userId: string;
  sessionId: string;
  userMessage: string;
  threadContext?: string;
}

export interface AgentResult {
  text: string;
  indicator?: string;
  intent: AgentIntent;
}
