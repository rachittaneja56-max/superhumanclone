import "server-only";

import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getUserBillingPolicy, shouldBlockAiUsage } from "../billing/policy";
import { incrementUsage, getUsage } from "../billing/usage";
import { db } from "../db";
import { emails } from "../db/schema";
import { redis } from "../redis";
import { AIAllProvidersFailedError, AIInvalidResponseError, AIProviderUnavailableError, AIUsageLimitError } from "./errors";
import { getModelForCapability, getProviderApiKey, getProviderBaseUrl, getProviderOrder } from "./models";
import { prompts } from "./prompts";
import type { AIExecutionOptions, AIJsonResult, AIProvider, AIProviderHealth, AITextResult, StructuredTask } from "./types";
import { sanitiseAgentInput, sanitiseAgentOutput } from "./agents/sanitization";

const PROVIDER_COOLDOWN_MS = 15 * 60 * 1000;
const PROVIDER_FAILURE_THRESHOLD = 3;
const ZERO_EMBEDDING = new Array<number>(768).fill(0);

const classificationSchema = z.object({
  tag: z.enum(["work", "personal", "finance", "travel", "newsletter", "update", "social", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  confidence: z.number().min(0).max(1),
});

const autoRepliesSchema = z.object({
  direct: z.string(),
  warm: z.string(),
  boundary: z.string(),
});

const smartFillSchema = z.object({
  suggestedTitle: z.string(),
  suggestedTime: z.string(),
  suggestedDuration: z.number(),
  suggestedDescription: z.string(),
  confidence: z.number().min(0).max(1),
});

const meetingPrepSchema = z.object({
  summary: z.string(),
  attendees: z.array(z.string()),
  recentEmails: z.array(
    z.object({
      sender: z.string(),
      subject: z.string(),
      snippet: z.string(),
      receivedAt: z.string(),
    }),
  ),
  openQuestions: z.array(z.string()),
  talkingPoints: z.array(z.string()),
});

type Message = { role: "user" | "assistant"; content: string };

function nowIso() {
  return new Date().toISOString();
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function healthKey(provider: AIProvider) {
  return `key:health:${provider}:${dayKey()}`;
}

function stripHtml(value: string) {
  return sanitiseAgentInput(value).replace(/\s+/g, " ").trim();
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-card]")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[redacted-aadhaar]")
    .replace(/\b(?:\+?\d{1,3}[ -]?)?(?:\d[ -]?){10,14}\b/g, "[redacted-phone]")
    .trim();
}

function truncateText(value: string, maxChars: number) {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

function hasThinContent(value: string) {
  const text = stripHtml(value);
  if (!text) return true;

  const words = text.split(/\s+/).filter(Boolean).length;
  return words < 8;
}

function wrapEmailContent(value: string) {
  return `<email_content>${stripHtml(value)}</email_content>`;
}

function wrapCalendarContent(value: string) {
  return `<calendar_content>${stripHtml(value)}</calendar_content>`;
}

function sanitizeOutput(value: string, maxChars: number) {
  return sanitiseAgentOutput(truncateText(redactSensitiveText(value), maxChars), maxChars);
}

function stripWeakClosers(lines: string[]) {
  return lines.filter(
    (line) =>
      !/^(would you like me to|let me know if you'd like|if you'd like,? i can|happy to help(?: with that)?)/i.test(line),
  );
}

function stripPlaceholderClaims(line: string) {
  return line.replace(/\[[^\]]+\]\s*(?:unread|read|threads?|emails?)/gi, "").trim();
}

function cleanLines(value: string, maxChars: number) {
  return stripWeakClosers(
    sanitizeOutput(value, maxChars)
      .split(/\r?\n/)
      .map((line) => stripPlaceholderClaims(line.trim()))
      .filter(Boolean),
  );
}

function normalizeShortText(value: string, maxChars: number, fallback: string) {
  const lines = cleanLines(value, maxChars);
  const first = lines[0]?.replace(/^[-•*]\s*/, "").trim();
  return first || fallback;
}

function normalizeBulletSummary(value: string, maxChars: number, fallback: string) {
  const lines = cleanLines(value, maxChars);
  if (lines.length === 0) return fallback;

  const headline = lines[0].replace(/^[-•*]\s*/, "").trim();
  const bullets = lines
    .slice(1)
    .filter((line) => /^[-•*]/.test(line))
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);

  if (bullets.length === 0) {
    return headline || fallback;
  }

  return [headline, ...bullets.map((bullet) => `- ${bullet}`)].join("\n");
}

function normalizeReplyText(value: string, fallback: string) {
  return truncateText(normalizeShortText(value, 320, fallback), 320);
}

function normalizeMeetingPrepResult(result: z.infer<typeof meetingPrepSchema>) {
  return {
    summary: normalizeShortText(
      result.summary,
      220,
      "Not enough mailbox detail to prep this meeting precisely.",
    ),
    attendees: result.attendees.map((entry) => sanitizeOutput(entry, 120)).filter(Boolean).slice(0, 12),
    recentEmails: result.recentEmails.slice(0, 5).map((email) => ({
      sender: sanitizeOutput(email.sender, 120),
      subject: sanitizeOutput(email.subject, 180),
      snippet: sanitizeOutput(email.snippet, 220),
      receivedAt: email.receivedAt,
    })),
    openQuestions: result.openQuestions.map((item) => normalizeShortText(item, 180, "")).filter(Boolean).slice(0, 3),
    talkingPoints: result.talkingPoints.map((item) => normalizeShortText(item, 180, "")).filter(Boolean).slice(0, 3),
  };
}

function normalizeAgentResult(value: string) {
  return normalizeBulletSummary(
    value,
    4200,
    "Not enough mailbox detail to rank threads precisely.",
  );
}

function normalizeAgentResponse(value: string) {
  const cleaned = sanitizeOutput(value, 4200);
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(would you like me to|let me know if you'd like|if you'd like,? i can|happy to help(?: with that)?)/i.test(line));

  if (lines.length === 0) {
    return cleaned;
  }

  const headline = lines[0];
  const bullets = lines
    .slice(1)
    .filter((line) => /^[-•*]/.test(line))
    .map((line) => line.replace(/^[-•*]\s*/, ""))
    .slice(0, 5);

  if (bullets.length > 0) {
    return [headline, ...bullets.map((bullet) => `- ${bullet}`)].join("\n");
  }

  return headline;
}

function isLikelyAgentText(value: string) {
  const text = value.trim();
  if (!text) return false;

  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const symbols = (text.match(/[^A-Za-z0-9\s.,;:!?'"()\-\/]/g) ?? []).length;

  if (words < 3 && letters < 12) return false;
  if (text.length > 0 && symbols / text.length > 0.35) return false;
  if (/(.)\1{7,}/.test(text)) return false;
  return true;
}

async function getProviderHealth(provider: AIProvider): Promise<AIProviderHealth> {
  const cached = await redis.get<AIProviderHealth | string>(healthKey(provider));
  if (!cached) {
    return {
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastFailureAt: null,
      lastErrorCode: null,
    };
  }

  if (typeof cached === "string") {
    try {
      return JSON.parse(cached) as AIProviderHealth;
    } catch {
      return {
        consecutiveFailures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        lastFailureAt: null,
        lastErrorCode: null,
      };
    }
  }

  return cached;
}

async function setProviderHealth(provider: AIProvider, health: AIProviderHealth) {
  await redis.set(healthKey(provider), health, { ex: 86400 });
}

async function markProviderSuccess(provider: AIProvider) {
  const current = await getProviderHealth(provider);
  await setProviderHealth(provider, {
    consecutiveFailures: 0,
    totalFailures: current.totalFailures,
    totalSuccesses: current.totalSuccesses + 1,
    lastFailureAt: current.lastFailureAt,
    lastErrorCode: null,
  });
}

async function markProviderFailure(provider: AIProvider, error: unknown) {
  const current = await getProviderHealth(provider);
  await setProviderHealth(provider, {
    consecutiveFailures: current.consecutiveFailures + 1,
    totalFailures: current.totalFailures + 1,
    totalSuccesses: current.totalSuccesses,
    lastFailureAt: nowIso(),
    lastErrorCode: error instanceof Error ? error.name : "unknown",
  });
}

async function isProviderCircuitOpen(provider: AIProvider) {
  const current = await getProviderHealth(provider);
  if (current.consecutiveFailures < PROVIDER_FAILURE_THRESHOLD || !current.lastFailureAt) {
    return false;
  }

  const lastFailureTime = new Date(current.lastFailureAt).getTime();
  return Number.isFinite(lastFailureTime) && Date.now() - lastFailureTime < PROVIDER_COOLDOWN_MS;
}

async function reserveUsage(userId?: string) {
  if (!userId) return;

  const policy = await getUserBillingPolicy(userId);
  const current = await getUsage(redis, userId, "ai");
  const limitState = shouldBlockAiUsage(policy, current);
  if (limitState.blocked && limitState.reason === "disabled") {
    throw new AIUsageLimitError("AI access is disabled for this account.");
  }
  if (policy.monthlyLimit === null || policy.isAdmin) {
    await incrementUsage(redis, userId, "ai");
    return;
  }
  if (limitState.blocked && limitState.reason === "limit") {
    throw new AIUsageLimitError("You have reached the Free plan AI limit. Upgrade to continue using AI.");
  }

  await incrementUsage(redis, userId, "ai");
}

async function callChatCompletion(params: {
  provider: AIProvider;
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  jsonMode?: boolean;
}) {
  const apiKey = getProviderApiKey(params.provider);
  if (!apiKey) {
    throw new AIProviderUnavailableError(params.provider, "Missing AI provider API key");
  }

  const response = await fetch(`${getProviderBaseUrl(params.provider)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      max_tokens: params.maxOutputTokens,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    throw new AIProviderUnavailableError(params.provider, `Provider returned ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("").trim();
  }

  throw new AIInvalidResponseError();
}

async function callEmbedding(provider: AIProvider, model: string, value: string) {
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    throw new AIProviderUnavailableError(provider, "Missing AI provider API key");
  }

  if (provider === "openai") {
    const { embedding } = await embed({
      model: openai.embedding(model),
      value,
      providerOptions: {
        openai: {
          dimensions: 768,
        },
      },
    });
    return embedding;
  }

  const response = await fetch(`${getProviderBaseUrl(provider)}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: value,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    throw new AIProviderUnavailableError(provider, `Provider returned ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new AIInvalidResponseError("Embedding response was empty");
  }

  if (embedding.length !== 768) {
    throw new AIInvalidResponseError("Embedding dimension mismatch");
  }

  return embedding;
}

async function executeTextTask(promptBody: string, options: AIExecutionOptions): Promise<AITextResult> {
  const providerOrder = getProviderOrder(options.capability);
  let lastError: unknown = null;

  for (const provider of providerOrder) {
    if (await isProviderCircuitOpen(provider)) continue;

    try {
      await reserveUsage(options.userId);
      const model = getModelForCapability(provider, options.capability);
      const text = await callChatCompletion({
        provider,
        model,
        system: options.prompt.system,
        prompt: promptBody,
        maxOutputTokens: options.prompt.maxOutputTokens,
      });
      await markProviderSuccess(provider);
      return {
        text: sanitizeOutput(text, options.prompt.maxOutputTokens * 6),
        provider,
        model,
      };
    } catch (error) {
      lastError = error;
      await markProviderFailure(provider, error);
      if (error instanceof AIUsageLimitError) throw error;
    }
  }

  throw new AIAllProvidersFailedError(lastError instanceof Error ? lastError.message : undefined);
}

async function executeJsonTask<TSchema extends z.ZodTypeAny>(
  promptBody: string,
  structuredTask: StructuredTask<TSchema>,
  options: AIExecutionOptions,
): Promise<AIJsonResult<z.infer<TSchema>>> {
  const providerOrder = getProviderOrder(options.capability);
  let lastError: unknown = null;

  for (const provider of providerOrder) {
    if (await isProviderCircuitOpen(provider)) continue;

    try {
      await reserveUsage(options.userId);
      const model = getModelForCapability(provider, options.capability);
      const raw = await callChatCompletion({
        provider,
        model,
        system: options.prompt.system,
        prompt: promptBody,
        maxOutputTokens: options.prompt.maxOutputTokens,
        jsonMode: true,
      });
      const parsed = structuredTask.schema.parse(JSON.parse(raw));
      await markProviderSuccess(provider);
      return {
        object: sanitizeStructured(parsed),
        provider,
        model,
      };
    } catch (error) {
      lastError = error;
      await markProviderFailure(provider, error);
      if (error instanceof AIUsageLimitError) throw error;
    }
  }

  throw new AIAllProvidersFailedError(lastError instanceof Error ? lastError.message : undefined);
}

function sanitizeStructured<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeOutput(value, Math.max(80, value.length)) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructured(item)) as T;
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[key] = sanitizeStructured(entry);
    }
    return next as T;
  }

  return value;
}

function fallbackTextFromContent(value: string, maxChars: number) {
  const cleaned = stripHtml(value);
  return cleaned ? sanitizeOutput(cleaned, maxChars) : "No summary available.";
}

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

export async function classifyEmail(
  subject: string,
  snippet: string,
  options?: { userId?: string },
): Promise<{ tag: "work" | "personal" | "finance" | "travel" | "newsletter" | "update" | "social" | "other"; priority: "low" | "medium" | "high" | "urgent"; confidence: number }> {
  const promptBody = `${wrapEmailContent(`Subject: ${subject}\nSnippet: ${snippet}`)}`;

  try {
    const { object } = await executeJsonTask(
      promptBody,
      {
        schema: classificationSchema,
      },
      {
        userId: options?.userId,
        capability: "fast",
        prompt: prompts.emailClassifier,
      },
    );
    return object;
  } catch {
    return { tag: "other", priority: "medium", confidence: 0 };
  }
}

export async function generateTLDR(subject: string, bodyText: string, options?: { userId?: string }) {
  const promptBody = `${wrapEmailContent(`Subject: ${subject}\nBody: ${bodyText}`)}`;
  const fallback = "Not enough mailbox detail to summarize precisely.";

  if (hasThinContent(bodyText) && hasThinContent(subject)) {
    return fallback;
  }

  try {
    const { text } = await executeTextTask(promptBody, {
      userId: options?.userId,
      capability: "fast",
      prompt: prompts.tldrGenerator,
    });
    return normalizeShortText(text, 220, fallback);
  } catch {
    return fallback;
  }
}

export async function generateAutoReplies(subject: string, bodyText: string, options?: { userId?: string }) {
  const promptBody = `${wrapEmailContent(`Subject: ${subject}\nBody: ${bodyText}`)}`;

  try {
    const { object } = await executeJsonTask(
      promptBody,
      {
        schema: autoRepliesSchema,
      },
      {
        userId: options?.userId,
        capability: "fast",
        prompt: prompts.autoReplyGenerator,
      },
    );
    return {
      direct: normalizeReplyText(object.direct, "Thanks for the note. I need a bit more detail before replying precisely."),
      warm: normalizeReplyText(object.warm, "Thanks for reaching out. I need a bit more detail before replying precisely."),
      boundary: normalizeReplyText(object.boundary, "Thanks for the message. I need a bit more context before I can reply precisely."),
    };
  } catch {
    const short = fallbackTextFromContent(bodyText || subject, 120);
    return {
      direct: `Thanks for the note. ${short}`,
      warm: `Thanks for reaching out. ${short}`,
      boundary: "Thanks for the message. I need a bit more context before I can reply precisely.",
    };
  }
}

export async function generateEmbedding(text: string, options?: { userId?: string }) {
  const providerOrder = getProviderOrder("embedding");
  let lastError: unknown = null;

  for (const provider of providerOrder) {
    if (await isProviderCircuitOpen(provider)) continue;

    try {
      await reserveUsage(options?.userId);
      const model = getModelForCapability(provider, "embedding");
      const embedding = await callEmbedding(provider, model, stripHtml(text));
      await markProviderSuccess(provider);
      return embedding;
    } catch (error) {
      lastError = error;
      await markProviderFailure(provider, error);
      if (error instanceof AIUsageLimitError) break;
    }
  }

  return ZERO_EMBEDDING.slice();
}

export async function generateDigest(
  emailRows: { from: string; subject: string; snippet: string; priority: string }[],
  eventRows: { title: string; startTime: Date; endTime: Date; location: string | null }[],
  options?: { userId?: string },
) {
  const promptBody = [
    wrapEmailContent(
      emailRows
        .map((email) => `[${email.priority.toUpperCase()}] From: ${email.from} | Subject: ${email.subject} | Snippet: ${email.snippet}`)
        .join("\n"),
    ),
    wrapCalendarContent(
      eventRows
        .map((event) => `${event.title} | ${event.startTime.toISOString()} - ${event.endTime.toISOString()} | ${event.location ?? "No location"}`)
        .join("\n"),
    ),
  ].join("\n\n");

  try {
    const { text } = await executeTextTask(promptBody, {
      userId: options?.userId,
      capability: "smart",
      prompt: prompts.morningDigest,
    });
    return normalizeBulletSummary(text, 900, "Not enough mailbox detail to rank threads precisely.");
  } catch {
    if (emailRows.length + eventRows.length < 2) {
      return "Not enough mailbox detail to rank threads precisely.";
    }

    const headline = "Today at a glance";
    const bullets = [
      emailRows[0]?.subject ? `Top thread: ${sanitizeOutput(emailRows[0].subject, 160)}` : "",
      eventRows[0]?.title ? `Next event: ${sanitizeOutput(eventRows[0].title, 160)}` : "",
    ].filter(Boolean);
    return bullets.length > 0 ? [headline, ...bullets.map((bullet) => `- ${bullet}`)].join("\n") : headline;
  }
}

type RewriteInstruction = "improve_tone" | "make_shorter" | "make_formal" | "convert_to_bullets" | "translate";

export async function rewriteDraft(
  draft: string,
  instruction: RewriteInstruction,
  translateTo?: string,
  options?: { userId?: string },
) {
  const instructionMap: Record<RewriteInstruction, string> = {
    improve_tone: "Rewrite the draft to sound warmer, clearer, and more polished without changing the meaning.",
    make_shorter: "Rewrite the draft to be shorter and tighter while keeping the important information.",
    make_formal: "Rewrite the draft in a more formal, professional tone while keeping the meaning.",
    convert_to_bullets: "Rewrite the draft as a concise bullet list that keeps the message email-safe and editable.",
    translate: `Translate the draft into ${translateTo?.trim() || "English"} while preserving the meaning and keeping it email-ready.`,
  };

  const promptBody = `${instructionMap[instruction]}\n${wrapEmailContent(draft)}`;

  const { text } = await executeTextTask(promptBody, {
    userId: options?.userId,
    capability: "fast",
    prompt: prompts.rewriteDraft,
  });
  return sanitizeOutput(text, 4000);
}

export async function smartFillFromThread(content: string, options?: { userId?: string }) {
  try {
    const { object } = await executeJsonTask(
      wrapEmailContent(content),
      {
        schema: smartFillSchema,
      },
      {
        userId: options?.userId,
        capability: "fast",
        prompt: prompts.calendarSmartFill,
      },
    );
    return object;
  } catch {
    return {
      suggestedTitle: "Meeting",
      suggestedTime: "",
      suggestedDuration: 30,
      suggestedDescription: fallbackTextFromContent(content, 180),
      confidence: 0,
    };
  }
}

export async function generateMeetingPrepBrief(content: string, options?: { userId?: string }) {
  try {
    const { object } = await executeJsonTask(
      wrapEmailContent(content),
      {
        schema: meetingPrepSchema,
      },
      {
        userId: options?.userId,
        capability: "smart",
        prompt: prompts.meetingPrepBrief,
      },
    );
    return normalizeMeetingPrepResult(object);
  } catch {
    return {
      summary: "Not enough mailbox detail to prep this meeting precisely.",
      attendees: [],
      recentEmails: [],
      openQuestions: [],
      talkingPoints: [],
    };
  }
}

export async function generateContactSummary(snippets: string[], options?: { userId?: string }) {
  try {
    const { text } = await executeTextTask(wrapEmailContent(snippets.join("\n")), {
      userId: options?.userId,
      capability: "fast",
      prompt: prompts.contactRelationship,
    });
    return normalizeShortText(text, 160, "Not enough recent email detail to summarize this relationship.");
  } catch {
    return "Not enough recent email detail to summarize this relationship.";
  }
}

function formatAgentPrompt(messages: Message[]) {
  return messages
    .slice(-20)
    .map((message) => `${message.role.toUpperCase()}: ${sanitiseAgentInput(message.content)}`)
    .join("\n\n");
}

export async function streamAgentResponse(
  userId: string,
  _sessionId: string,
  messages: Message[],
  _hitlInterceptor: (action: unknown) => Promise<unknown>,
) {
  const promptBody = formatAgentPrompt(messages);
  try {
    const { text } = await executeTextTask(promptBody, {
      userId,
      capability: "agent",
      prompt: prompts.agentSystem,
    });

    const cleaned = normalizeAgentResult(text);
    const fallback = "I can help with inbox, calendar, reply drafts, and meeting prep. Share a thread or event for a grounded answer.";

    return { textStream: createSingleChunkStream(isLikelyAgentText(cleaned) ? cleaned : fallback) };
  } catch (error) {
    if (error instanceof AIUsageLimitError) {
      return {
        textStream: createSingleChunkStream(
          "You've reached the Free plan AI limit for this month. AI features are now disabled until the next cycle or an upgrade.",
        ),
      };
    }

    return {
      textStream: createSingleChunkStream(
        "AI assistance is temporarily unavailable. You can still use Inbox, Calendar, and manual actions safely.",
      ),
    };
  }
}



