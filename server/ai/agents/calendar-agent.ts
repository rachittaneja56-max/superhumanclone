import "server-only";

import { smartFillFromThread } from "../provider";
import { sanitiseAgentInput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

export async function runCalendarAgent(context: AgentContext): Promise<AgentResult> {
  const source = sanitiseAgentInput(context.threadContext || context.userMessage);
  const result = await smartFillFromThread(source, { userId: context.userId });

  return {
    intent: "calendar",
    indicator: "Preparing calendar event",
    text: [
      `Title: ${result.suggestedTitle || "Meeting"}`,
      `Suggested time: ${result.suggestedTime || "Needs confirmation"}`,
      `Duration: ${result.suggestedDuration || 30} min`,
      `Description: ${result.suggestedDescription || "No summary available."}`,
      `Confidence: ${Math.round(result.confidence * 100)}%`,
      "",
      "I can prepare an approval card before anything gets created.",
    ].join("\n"),
  };
}
