import "server-only";

import { classifyEmail } from "../provider";
import { sanitiseAgentInput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

export async function runTriageAgent(context: AgentContext): Promise<AgentResult> {
  const source = sanitiseAgentInput(context.threadContext || context.userMessage);
  const [subjectLine, ...rest] = source.split("\n");
  const result = await classifyEmail(subjectLine || "No subject", rest.join(" ").slice(0, 400), {
    userId: context.userId,
  });

  return {
    intent: "triage",
    indicator: "Searching your inbox...",
    text: `Priority: ${result.priority}\nCategory: ${result.tag}\nConfidence: ${Math.round(result.confidence * 100)}%`,
  };
}
