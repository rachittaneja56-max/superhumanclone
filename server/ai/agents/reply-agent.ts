import "server-only";

import { generateAutoReplies } from "../provider";
import { sanitiseAgentInput, sanitiseAgentOutput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

export async function runReplyAgent(context: AgentContext): Promise<AgentResult> {
  const source = sanitiseAgentInput(context.threadContext || context.userMessage);
  const [subjectLine, ...rest] = source.split("\n");
  const replies = await generateAutoReplies(subjectLine || "Reply draft", rest.join("\n"), {
    userId: context.userId,
  });

  return {
    intent: "reply",
    indicator: "Preparing reply...",
    text: [
      "Direct:",
      sanitiseAgentOutput(replies.direct, 320),
      "",
      "Warm:",
      sanitiseAgentOutput(replies.warm, 320),
      "",
      "Boundary-Setting:",
      sanitiseAgentOutput(replies.boundary, 320),
    ].join("\n"),
  };
}
