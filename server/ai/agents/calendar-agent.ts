import "server-only";

import { parseISO, addMinutes, format } from "date-fns";
import { smartFillFromThread } from "../provider";
import { sanitiseAgentInput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

type CalendarDraft = {
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description?: string;
  attendees: string[];
  attendeesSummary?: string;
  addMeetLink: boolean;
};

function extractAttendeeSummary(input: string) {
  const match = input.match(/\bwith\s+(.+?)(?=\b(?:tomorrow|today|next|on|at|for|in)\b|$)/i);
  return match?.[1]?.trim() || "";
}

function extractEmails(input: string) {
  return [...input.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
}

function parseDurationMinutes(input: string) {
  const hoursMatch = input.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  if (hoursMatch) {
    return Math.max(15, Math.round(Number.parseFloat(hoursMatch[1]) * 60));
  }

  const minutesMatch = input.match(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (minutesMatch) {
    return Math.max(15, Number.parseInt(minutesMatch[1], 10));
  }

  return 30;
}

function parseRelativeDateTime(input: string, preferredIso?: string) {
  if (preferredIso) {
    const parsed = new Date(preferredIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const now = new Date();
  const lower = input.toLowerCase();
  const base = new Date(now);

  if (/\btomorrow\b/.test(lower)) {
    base.setDate(base.getDate() + 1);
  } else if (/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)) {
    const weekdayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const weekday = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)?.[1];
    if (weekday) {
      const targetDay = weekdayMap[weekday];
      const delta = (targetDay - base.getDay() + 7) % 7 || 7;
      base.setDate(base.getDate() + delta);
    }
  } else {
    const sameDay = /\btoday\b/.test(lower) || /\bat\s+\d/.test(lower);
    if (!sameDay) return null;
  }

  const timeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
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

    base.setHours(hour, minute, 0, 0);
    return base;
  }

  base.setHours(15, 0, 0, 0);
  return base;
}

function deriveCalendarDraft(source: string, aiResult: Awaited<ReturnType<typeof smartFillFromThread>>): CalendarDraft | null {
  const requestedDuration = parseDurationMinutes(source);
  const startTime = parseRelativeDateTime(source, aiResult.suggestedTime || undefined);
  if (!startTime) return null;

  const attendees = extractEmails(source);
  const attendeesSummary = extractAttendeeSummary(source);
  const title =
    aiResult.suggestedTitle?.trim() ||
    attendeesSummary.replace(/\b(?:tomorrow|today|next|at|for|in)\b.*$/i, "").trim() ||
    "Meeting";
  const start = startTime;
  const durationMinutes = aiResult.suggestedDuration && aiResult.suggestedDuration > 0 ? aiResult.suggestedDuration : requestedDuration;
  const end = addMinutes(start, durationMinutes);

  return {
    title,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMinutes,
    description: aiResult.suggestedDescription?.trim() || source,
    attendees,
    attendeesSummary: attendeesSummary || undefined,
    addMeetLink: !/\b(?:no\s+meet|without\s+meet|no\s+google\s+meet)\b/i.test(source),
  };
}

function looksLikeSchedulingRequest(source: string) {
  const lower = source.toLowerCase();
  const createVerb = /\b(schedule|book|set up|set-up|plan|arrange|create)\b/.test(lower);
  const timeSignal = /\b(tomorrow|today|next|at|on|\d{1,2})(?::\d{2})?\b/.test(lower);
  const meetingSignal = /\b(call|meeting|event|meet)\b/.test(lower);
  return createVerb || (meetingSignal && timeSignal);
}

export async function runCalendarAgent(
  context: AgentContext,
  hitlInterceptor: (action: { actionType: string; payload: Record<string, unknown>; humanReadable: string }) => Promise<unknown>,
): Promise<AgentResult> {
  const source = sanitiseAgentInput(context.threadContext || context.userMessage);
  const result = await smartFillFromThread(source, { userId: context.userId });
  if (!looksLikeSchedulingRequest(source)) {
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
        "I can prepare a meeting approval card once you ask to schedule or create the event.",
      ].join("\n"),
    };
  }

  const draft = deriveCalendarDraft(source, result);

  if (!draft) {
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
        "I need a clearer time reference before I can prepare an approval card.",
      ].join("\n"),
    };
  }

  const proposal = await hitlInterceptor({
    actionType: "create_event",
    payload: draft,
    humanReadable: `Create "${draft.title}" on ${format(parseISO(draft.startTime), "EEE, MMM d 'at' h:mm a")}`,
  });

  return {
    intent: "calendar",
    indicator: "Preparing calendar event",
    text: [
      `Title: ${draft.title}`,
      `When: ${format(parseISO(draft.startTime), "EEE, MMM d 'at' h:mm a")}`,
      `Duration: ${draft.durationMinutes} min`,
      `Meet: ${draft.addMeetLink ? "enabled" : "disabled"}`,
      draft.attendeesSummary ? `Attendees: ${draft.attendeesSummary}` : "Attendees: none detected",
      "",
      `Approval card ready. Action ID: ${String((proposal as { actionId?: string })?.actionId ?? "pending")}`,
    ].join("\n"),
  };
}
