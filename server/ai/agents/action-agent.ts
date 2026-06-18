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
  return {
    actionId: action.id,
    actionType: action.action_type,
    humanReadable: typeof action.humanReadable === "string"
      ? action.humanReadable
      : `${action.action_type.replace(/_/g, " ")} requires approval`,
    expiresAt: new Date(action.expires_at).toISOString(),
    riskLevel: getHitlRiskLevel(action.action_type),
    payload: mapHitlPayloadForClient(action.action_type, payload),
  };
}

function extractEmails(input: string) {
  return [...input.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
}

function extractField(input: string, label: string) {
  const regex = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i");
  return input.match(regex)?.[1]?.trim() ?? "";
}

export async function runActionAgent(
  context: AgentContext,
  hitlInterceptor: (action: { actionType: string; payload: Record<string, unknown>; humanReadable: string }) => Promise<{ actionId: string } | unknown>,
): Promise<AgentResult> {
  const request = context.userMessage.trim();
  const lower = request.toLowerCase();

  if (/\b(send|email)\b/.test(lower)) {
    const to = extractEmails(request);
    const subject = extractField(request, "subject");
    const body = extractField(request, "body");

    const parsed = sendEmailProposalSchema.safeParse({ to, subject, body });
    if (!parsed.success) {
      return {
        intent: "action",
        indicator: "Preparing approval card...",
        text: "To propose a send action safely, share explicit details like `to: person@example.com`, `subject: ...`, and `body: ...`. I will only prepare an approval card.",
      };
    }

    const proposal = await hitlInterceptor({
      actionType: "send_email",
      payload: parsed.data,
      humanReadable: `Send to ${parsed.data.to.join(", ")}: "${sanitiseAgentOutput(parsed.data.subject || "(no subject)", 120)}"`,
    });

    return {
      intent: "action",
      indicator: "Preparing approval card...",
      text: `Approval requested for sending that email. Review the card before anything happens. Action ID: ${String((proposal as { actionId?: string })?.actionId ?? "pending")}`,
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
        text: "To propose an event safely, share exact details like `title: ...`, `start: 2026-06-18T15:00:00.000Z`, `end: 2026-06-18T15:30:00.000Z`, and any attendee emails.",
      };
    }

    const proposal = await hitlInterceptor({
      actionType: "create_event",
      payload: parsed.data,
      humanReadable: `Create "${sanitiseAgentOutput(parsed.data.title, 120)}" starting ${parsed.data.startTime}`,
    });

    return {
      intent: "action",
      indicator: "Preparing approval card...",
      text: `Approval requested for that event. Review the card before anything is created. Action ID: ${String((proposal as { actionId?: string })?.actionId ?? "pending")}`,
    };
  }

  return {
    intent: "action",
    indicator: "Preparing approval card...",
    text: "I can only prepare approval cards for explicit send-email or create-event requests with the exact details.",
  };
}
