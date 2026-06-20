import "server-only";

import { db } from "../../../server/db";
import { promptLogs } from "../../../server/db/schema";

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
  const intent = detectIntent(context.userMessage, context.threadContext, context.history);

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
  const startTime = Date.now();
  const scopeLimitMessage = getScopeLimitMessage(context.userMessage);
  
  if (scopeLimitMessage) {
    const durationMs = Date.now() - startTime;
    await db.insert(promptLogs).values({
      userId: context.userId,
      prompt: context.userMessage,
      status: "blocked_input",
      tokens: 0,
      cost: 0,
      duration_ms: durationMs,
    }).catch(e => console.error("Failed to log prompt", e));
    
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
    const durationMs = Date.now() - startTime;
    await db.insert(promptLogs).values({
      userId: context.userId,
      prompt: context.userMessage,
      status: "specialist_handled",
      tokens: 0,
      cost: 0,
      duration_ms: durationMs,
    }).catch(e => console.error("Failed to log prompt", e));

    return {
      textStream: createSingleChunkStream(specialist.text),
    };
  }

  const contextualMessage = context.threadContext?.trim()
    ? `Thread context explicitly approved by the user:\n${wrapAgentEmailContext(context.threadContext)}\n\nUser message:\n${sanitiseAgentInput(context.userMessage)}`
    : sanitiseAgentInput(context.userMessage);

  const normalizedMessages = [...messages.slice(0, -1), { role: "user" as const, content: contextualMessage }];
  
  const durationMs = Date.now() - startTime;
  await db.insert(promptLogs).values({
    userId: context.userId,
    prompt: context.userMessage,
    status: "streamed",
    tokens: 0,
    cost: 0,
    duration_ms: durationMs,
  }).catch(e => console.error("Failed to log prompt", e));

  return streamAgentResponse(context.userId, context.sessionId, normalizedMessages, hitlInterceptor);
}
