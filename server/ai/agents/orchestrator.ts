import "server-only";

import { streamAgentResponse } from "../provider";
import { runCalendarAgent } from "./calendar-agent";
import { runComposeAgent } from "./compose-agent";
import { runReplyAgent } from "./reply-agent";
import { sanitiseAgentInput, wrapAgentEmailContext } from "./sanitization";
import { runSummarizerAgent } from "./summarizer-agent";
import { runTriageAgent } from "./triage-agent";
import type { AgentContext, AgentIntent, AgentResult } from "./types";

function createSingleChunkStream(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield text;
    },
  };
}

function detectIntent(message: string, threadContext?: string): AgentIntent {
  const lower = message.toLowerCase().trim();

  if (lower.startsWith("/")) return "compose";
  if (/\b(triage|classify|priority|urgent)\b/.test(lower) && !!threadContext) return "triage";
  if (/\b(tl;dr|tldr|summari[sz]e|digest)\b/.test(lower) && !!threadContext) return "summarizer";
  if (/\b(reply|respond|draft a reply|write back)\b/.test(lower) && !!threadContext) return "reply";
  if (/\b(schedule|meeting|calendar|event|meet)\b/.test(lower)) return "calendar";
  if (/\b(send|archive|delete|trash|mark unread|mark read|create)\b/.test(lower)) return "action";
  return "general";
}

async function runSpecialist(context: AgentContext): Promise<AgentResult | null> {
  const intent = detectIntent(context.userMessage, context.threadContext);

  if (intent === "triage") return runTriageAgent(context);
  if (intent === "summarizer") return runSummarizerAgent(context);
  if (intent === "reply") return runReplyAgent(context);
  if (intent === "compose") return runComposeAgent(context);
  if (intent === "calendar") return runCalendarAgent(context);
  return null;
}

export async function runRoutedAgentResponse(
  context: AgentContext,
  messages: { role: "user" | "assistant"; content: string }[],
  hitlInterceptor: (action: unknown) => Promise<boolean>,
) {
  const specialist = await runSpecialist({
    ...context,
    userMessage: sanitiseAgentInput(context.userMessage),
    threadContext: context.threadContext ? sanitiseAgentInput(context.threadContext) : undefined,
  });

  if (specialist) {
    const prefixed = specialist.indicator ? `${specialist.indicator}\n\n${specialist.text}` : specialist.text;
    return {
      textStream: createSingleChunkStream(prefixed),
    };
  }

  const contextualMessage = context.threadContext?.trim()
    ? `Thread context explicitly approved by the user:\n${wrapAgentEmailContext(context.threadContext)}\n\nUser message:\n${sanitiseAgentInput(context.userMessage)}`
    : sanitiseAgentInput(context.userMessage);

  const normalizedMessages = [...messages.slice(0, -1), { role: "user" as const, content: contextualMessage }];
  return streamAgentResponse(context.userId, context.sessionId, normalizedMessages, hitlInterceptor);
}
