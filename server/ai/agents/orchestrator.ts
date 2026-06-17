import "server-only";

import { runActionAgent } from "./action-agent";
import { streamAgentResponse } from "../provider";
import { runCalendarAgent } from "./calendar-agent";
import { runComposeAgent } from "./compose-agent";
import { detectIntent } from "./intent";
import { runReplyAgent } from "./reply-agent";
import { getScopeLimitMessage, sanitiseAgentInput, wrapAgentEmailContext } from "./sanitization";
import { runSummarizerAgent } from "./summarizer-agent";
import { runTriageAgent } from "./triage-agent";
import type { AgentContext, AgentResult } from "./types";

function createSingleChunkStream(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield text;
    },
  };
}

async function runSpecialist(
  context: AgentContext,
  hitlInterceptor: (action: { actionType: string; payload: Record<string, unknown>; humanReadable: string }) => Promise<unknown>,
): Promise<AgentResult | null> {
  const intent = detectIntent(context.userMessage, context.threadContext);

  if (intent === "triage") return runTriageAgent(context);
  if (intent === "summarizer") return runSummarizerAgent(context);
  if (intent === "reply") return runReplyAgent(context);
  if (intent === "compose") return runComposeAgent(context);
  if (intent === "calendar") return runCalendarAgent(context, hitlInterceptor);
  if (intent === "action") return runActionAgent(context, hitlInterceptor);
  return null;
}

export async function runRoutedAgentResponse(
  context: AgentContext,
  messages: { role: "user" | "assistant"; content: string }[],
  hitlInterceptor: (action: unknown) => Promise<unknown>,
) {
  const scopeLimitMessage = getScopeLimitMessage(context.userMessage);
  if (scopeLimitMessage) {
    return {
      textStream: createSingleChunkStream(scopeLimitMessage),
    };
  }

  const specialist = await runSpecialist({
    ...context,
    userMessage: sanitiseAgentInput(context.userMessage),
    threadContext: context.threadContext ? sanitiseAgentInput(context.threadContext) : undefined,
  }, hitlInterceptor as (action: { actionType: string; payload: Record<string, unknown>; humanReadable: string }) => Promise<unknown>);

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
