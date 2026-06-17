import "server-only";

import { generateTLDR } from "../provider";
import { sanitiseAgentInput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

export async function runSummarizerAgent(context: AgentContext): Promise<AgentResult> {
  const source = sanitiseAgentInput(context.threadContext || context.userMessage);
  const [subjectLine, ...rest] = source.split("\n");
  const text = await generateTLDR(subjectLine || "Conversation summary", rest.join("\n"), {
    userId: context.userId,
  });

  return {
    intent: "summarizer",
    indicator: "Summarizing thread",
    text,
  };
}
