import "server-only";

import { z } from "zod";
import { sanitiseAgentOutput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

export type SafeHitlPayload = {
  subject?: string;
  title?: string;
  recipientSummary?: string;
  attendeesSummary?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  location?: string;
  description?: string;
  addMeetLink?: boolean;
  to?: string[];
  body?: string;
  attendees?: string[];
};

export type SafeHitlAction = {
  actionId: string;
  actionType: string;
  humanReadable: string;
  expiresAt: string;
  riskLevel: "low" | "medium" | "high";
  payload: SafeHitlPayload;
};

const sendEmailProposalSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().max(240).default(""),
  body: z.string().max(20000).default(""),
});

const createEventProposalSchema = z.object({
  title: z.string().min(1).max(240),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.string().email()).default([]),
  description: z.string().max(4000).optional(),
  location: z.string().max(240).optional(),
  addMeetLink: z.boolean().default(true),
});

function summarizeList(values: string[] | undefined, noun: string) {
  if (!values?.length) return undefined;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]}, ${values[1]}`;
  return `${values[0]}, ${values[1]} +${values.length - 2} ${noun}`;
}

export function mapHitlPayloadForClient(actionType: string, payload: Record<string, unknown>): SafeHitlPayload {
  if (actionType === "send_email") {
    const to = Array.isArray(payload.to) ? payload.to.filter((value): value is string => typeof value === "string") : [];
    return {
      subject: typeof payload.subject === "string" ? sanitiseAgentOutput(payload.subject, 180) : undefined,
      recipientSummary: summarizeList(to, "more"),
      to,
      body: typeof payload.body === "string" ? payload.body : undefined,
    };
  }

  if (actionType === "create_event") {
    const attendees = Array.isArray(payload.attendees)
      ? payload.attendees.filter((value): value is string => typeof value === "string")
      : [];

    return {
      title: typeof payload.title === "string" ? sanitiseAgentOutput(payload.title, 180) : undefined,
      startTime: typeof payload.startTime === "string" ? payload.startTime : undefined,
      endTime: typeof payload.endTime === "string" ? payload.endTime : undefined,
      durationMinutes: typeof payload.durationMinutes === "number" ? payload.durationMinutes : undefined,
      attendeesSummary:
        typeof payload.attendeesSummary === "string"
          ? sanitiseAgentOutput(payload.attendeesSummary, 180)
          : summarizeList(attendees, "more"),
      location: typeof payload.location === "string" ? sanitiseAgentOutput(payload.location, 140) : undefined,
      description: typeof payload.description === "string" ? sanitiseAgentOutput(payload.description, 240) : undefined,
      addMeetLink: typeof payload.addMeetLink === "boolean" ? payload.addMeetLink : true,
      attendees,
    };
  }

  return {
    title: typeof payload.title === "string" ? sanitiseAgentOutput(payload.title, 180) : undefined,
    subject: typeof payload.subject === "string" ? sanitiseAgentOutput(payload.subject, 180) : undefined,
  };
}

export function getHitlRiskLevel(actionType: string): "low" | "medium" | "high" {
  if (actionType === "send_email") return "high";
  if (actionType === "create_event") return "medium";
  return "medium";
}

export function mapHitlActionForClient(action: {
  id: string;
  action_type: string;
  payload: unknown;
  expires_at: Date | string;
  status?: string;
} & Record<string, unknown>): SafeHitlAction {
  const payload = action.payload && typeof action.payload === "object" ? (action.payload as Record<string, unknown>) : {};
  const safePayload = mapHitlPayloadForClient(action.action_type, payload);
  const fallbackHumanReadable =
    action.action_type === "send_email"
      ? `Send email to ${safePayload.recipientSummary || "recipient"}`
      : action.action_type === "create_event"
        ? `Create event ${safePayload.title ? `"${safePayload.title}"` : "draft"}`
        : `${action.action_type.replace(/_/g, " ")} requires approval`;
  return {
    actionId: action.id,
    actionType: action.action_type,
    humanReadable: typeof action.humanReadable === "string"
      ? action.humanReadable
      : fallbackHumanReadable,
    expiresAt: new Date(action.expires_at).toISOString(),
    riskLevel: getHitlRiskLevel(action.action_type),
    payload: safePayload,
  };
}

function extractEmails(input: string) {
  return [...input.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
}

function extractEmailsFromHistory(history?: AgentContext["history"]) {
  if (!history?.length) return [];
  const emails = new Set<string>();

  for (const message of history) {
    for (const email of extractEmails(message.content)) {
      emails.add(email);
    }
  }

  return [...emails];
}

function extractField(input: string, label: string) {
  const regex = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i");
  return input.match(regex)?.[1]?.trim() ?? "";
}

function normalizeDraftText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function extractNaturalBody(input: string) {
  const bodyPatterns = [
    /\b(?:saying|say|message|tell(?: them| him| her| us| me)?|write)\b(?:\s+that)?\s+(.+?)(?=\s+\b(?:in the body|as the body|for the body|body|please|thanks|thank you)\b|[.!?]|$)/i,
    /\bin the body\b\s*[:\-]?\s*([^\n]+)/i,
    /\bbody\b\s*[:\-]\s*([^\n]+)/i,
    /\bmessage\b\s*[:\-]\s*([^\n]+)/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      const body = normalizeDraftText(match[1]).replace(/[.!?]+$/u, "").trim();
      if (body) return body;
    }
  }

  return "";
}

function extractContinuationBody(request: string, history?: AgentContext["history"]) {
  const directBody = extractNaturalBody(request);
  if (directBody) return directBody;

  const trimmed = normalizeDraftText(request);
  if (!trimmed || trimmed.length > 160) return "";
  if (extractEmails(trimmed).length > 0) return "";
  if (/\b(send|email|mail)\b/i.test(trimmed)) return "";

  const recentAssistant = history
    ?.slice()
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());

  if (!recentAssistant) return "";

  const lower = recentAssistant.content.toLowerCase();
  if (
    /what should i say in the email\??/.test(lower) ||
    /drafting email/i.test(lower) ||
    /share a draft/i.test(lower) ||
    /subject.*body/i.test(lower)
  ) {
    return trimmed;
  }

  return "";
}

function capitalizeDraftSubject(input: string) {
  if (!input) return "Quick note";
  if (input.length <= 2) return input.toUpperCase();
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function inferSubjectFromBody(body: string) {
  const normalized = normalizeDraftText(body).replace(/[.!?]+$/u, "");
  if (!normalized) return "Quick note";
  return capitalizeDraftSubject(normalized);
}

function inferEmailSubjectAndBody(request: string, body: string, timeLabel: string) {
  const lower = request.toLowerCase();
  const hasMeetingSignal =
    /\b(meet|meeting|call|sync|catch[- ]?up)\b/.test(lower) ||
    /\babout (?:the|our) meeting\b/.test(lower) ||
    /\babout our meet\b/.test(lower);
  const hasFollowUpSignal = /\b(follow up|following up|confirm|regarding|update|touch base)\b/.test(lower);

  if (body.trim()) {
    return {
      subject: inferSubjectFromBody(body),
      body,
    };
  }

  if (hasMeetingSignal) {
    return {
      subject: timeLabel ? `Confirming our meeting at ${timeLabel}` : "Confirming our meeting",
      body: timeLabel
        ? `Hi, just confirming our meeting at ${timeLabel}. Let me know if anything changes.`
        : "Hi, just confirming our meeting. Let me know if anything changes.",
    };
  }

  if (hasFollowUpSignal) {
    return {
      subject: "Following up on our conversation",
      body: "Hi, just following up on this. Let me know if anything changes.",
    };
  }

  return {
    subject: inferSubjectFromBody(request),
    body: "",
  };
}

function extractDurationMinutes(input: string) {
  const hoursMatch = input.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  if (hoursMatch) {
    return Math.max(15, Math.round(Number.parseFloat(hoursMatch[1]) * 60));
  }

  const minutesMatch = input.match(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (minutesMatch) {
    return Math.max(15, Number.parseInt(minutesMatch[1], 10));
  }

  return null;
}

function extractTimeLabel(input: string) {
  const timeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!timeMatch) return null;

  let hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2] || "0", 10);
  const meridiem = timeMatch[3]?.toLowerCase();

  if (meridiem === "am") {
    hour = hour === 12 ? 0 : hour;
  } else if (meridiem === "pm") {
    hour = hour === 12 ? 12 : hour + 12;
  } else if (hour < 12) {
    hour += 12;
  }

  const displayHour = ((hour + 11) % 12) + 1;
  const displayMinute = String(minute).padStart(2, "0");
  const displayMeridiem = hour >= 12 ? "PM" : "AM";
  return `${displayHour}:${displayMinute} ${displayMeridiem}`;
}

function buildSendEmailDraft(
  request: string,
  history: AgentContext["history"],
  to: string[],
  explicitSubject: string,
  explicitBody: string,
) {
  const timeLabel = extractTimeLabel(request);
  const durationMinutes = extractDurationMinutes(request);
  const durationLabel = durationMinutes ? ` for ${durationMinutes} minutes` : "";
  const inferredBody = explicitBody || extractContinuationBody(request, history);
  const inferredDraft = inferEmailSubjectAndBody(request, inferredBody, timeLabel ?? "");

  if (!explicitSubject && !inferredBody && !timeLabel && inferredDraft.body.length === 0) {
    return {
      clarification: "What should I say in the email?",
    } as const;
  }

  const subject =
    explicitSubject ||
    inferredDraft.subject;

  const body =
    inferredBody ||
    (inferredDraft.body
      ? inferredDraft.body
      : timeLabel
        ? `Hi, just confirming our meeting at ${timeLabel}${durationLabel}. Let me know if anything changes.`
        : "Hi, just following up on this. Let me know if anything changes.");

  return {
    proposal: {
      to,
      subject: sanitiseAgentOutput(subject, 240),
      body: sanitiseAgentOutput(body, 4000),
    },
    summary: {
      subject: sanitiseAgentOutput(subject, 160),
      body: sanitiseAgentOutput(body, 220),
    },
  } as const;
}

export async function runActionAgent(
  context: AgentContext,
  hitlInterceptor: (action: { actionType: string; payload: Record<string, unknown>; humanReadable: string }) => Promise<{ actionId: string } | unknown>,
): Promise<AgentResult> {
  const request = context.userMessage.trim();
  const lower = request.toLowerCase();
  const continuationBody = extractContinuationBody(request, context.history);
  const shouldHandleSendEmail = /\b(send|email)\b/.test(lower) || Boolean(continuationBody);

  if (/\b(delete|trash|remove|purge|archive|cancel)\b/.test(lower) && /\b(email|mail|thread|message|event|calendar|meeting)\b/.test(lower)) {
    return {
      intent: "action",
      indicator: "Preparing approval card...",
      text: "I can help search, summarize, draft, and prepare approval-safe send or calendar actions, but I won't delete or archive items. Please do destructive actions manually in the product UI.",
    };
  }

  if (shouldHandleSendEmail) {
    const to = extractEmails(request);
    const historyTo = extractEmailsFromHistory(context.history);
    const recipients = to.length > 0 ? to : historyTo;
    if (recipients.length === 0) {
      return {
        intent: "action",
        indicator: "Drafting email...",
        text: "Who should I send it to?",
      };
    }

    const subject = extractField(request, "subject") || extractField(request, "subject line");
    const body = extractField(request, "body") || extractField(request, "message") || extractNaturalBody(request);
    const draft = buildSendEmailDraft(request, context.history, recipients, subject, body);

    if ("clarification" in draft && draft.clarification) {
      return {
        intent: "action",
        indicator: "Drafting email...",
        text: draft.clarification,
      };
    }

    const parsed = sendEmailProposalSchema.safeParse(draft.proposal);
    if (!parsed.success || !parsed.data.subject.trim() || !parsed.data.body.trim()) {
      return {
        intent: "action",
        indicator: "Drafting email...",
        text: "What should I say in the email?",
      };
    }

    await hitlInterceptor({
      actionType: "send_email",
      payload: parsed.data,
      humanReadable: "Draft ready for approval.",
    });

    return {
      intent: "action",
      indicator: "Drafting email...",
      text: [
        "**Draft ready.**",
        "",
        `**To:** ${parsed.data.to.join(", ")}`,
        `**Subject:** ${draft.summary.subject}`,
        "",
        "**Body:**",
        `> ${draft.summary.body.replace(/\n/g, '\n> ')}`
      ].join("\n"),
    };
  }

  if (/\b(create|schedule|event|meeting)\b/.test(lower)) {
    const title = extractField(request, "title");
    const startTime = extractField(request, "start");
    const endTime = extractField(request, "end");
    const attendees = extractEmails(request);
    const description = extractField(request, "description");
    const location = extractField(request, "location");

    const parsed = createEventProposalSchema.safeParse({
      title,
      startTime,
      endTime,
      attendees,
      description: description || undefined,
      location: location || undefined,
      addMeetLink: !/\bno meet\b/i.test(request),
    });

    if (!parsed.success) {
      return {
        intent: "action",
        indicator: "Preparing approval card...",
        text: "Share exact event details like `title: ...`, `start: 2026-06-18T15:00:00.000Z`, `end: 2026-06-18T15:30:00.000Z`, and attendee emails so I can prepare approval safely.",
      };
    }

    await hitlInterceptor({
      actionType: "create_event",
      payload: parsed.data,
      humanReadable: `Create calendar event: ${sanitiseAgentOutput(parsed.data.title, 120)}`,
    });

    return {
      intent: "action",
      indicator: "Preparing approval card...",
      text: [
        "**Ready for approval.**",
        "",
        `**Create calendar event:** ${sanitiseAgentOutput(parsed.data.title, 120)}`,
        `**When:** ${parsed.data.startTime}`,
      ].join("\n"),
    };
  }

    return {
      intent: "action",
      indicator: "Preparing approval card...",
      text: "Share the missing recipient, title, or time and I can prepare an approval-safe email or calendar draft.",
    };
  }
