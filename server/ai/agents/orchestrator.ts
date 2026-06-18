import "server-only";

import { runActionAgent } from "./action-agent";
import { runDigestAgent } from "./digest-agent";
import { runMeetingPrepAgent } from "./meeting-prep-agent";
import { streamAgentResponse } from "../provider";
import { runCalendarAgent } from "./calendar-agent";
import { runComposeAgent } from "./compose-agent";
import { detectIntent } from "./intent";
import { runReplyAgent } from "./reply-agent";
import { runSearchAgent } from "./search-agent";
import { getScopeLimitMessage, sanitiseAgentInput, wrapAgentEmailContext } from "./sanitization";
import { runSummarizerAgent } from "./summarizer-agent";
import { runTriageAgent } from "./triage-agent";
import type { AgentContext, AgentResult } from "./types";

function createSingleChunkStream(text: string) {
  const chunks = text.match(/\S+\s*/g) ?? (text ? [text] : []);
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

async function runSpecialist(
  context: AgentContext,
  hitlInterceptor: (action: { actionType: string; payload: Record<string, unknown>; humanReadable: string }) => Promise<unknown>,
): Promise<AgentResult | null> {
  const intent = detectIntent(context.userMessage, context.threadContext);

  if (intent === "triage") return runTriageAgent(context);
  if (intent === "search") return runSearchAgent(context);
  if (intent === "digest") return runDigestAgent(context);
  if (intent === "meetingPrep") return runMeetingPrepAgent(context);
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
    return {
      textStream: createSingleChunkStream(specialist.text),
    };
  }

  const contextualMessage = context.threadContext?.trim()
    ? `Thread context explicitly approved by the user:\n${wrapAgentEmailContext(context.threadContext)}\n\nUser message:\n${sanitiseAgentInput(context.userMessage)}`
    : sanitiseAgentInput(context.userMessage);

  const normalizedMessages = [...messages.slice(0, -1), { role: "user" as const, content: contextualMessage }];
  return streamAgentResponse(context.userId, context.sessionId, normalizedMessages, hitlInterceptor);
}
