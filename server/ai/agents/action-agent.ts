import "server-only";

import { sanitiseAgentOutput } from "./sanitization";

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
      attendeesSummary: summarizeList(attendees, "more"),
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
