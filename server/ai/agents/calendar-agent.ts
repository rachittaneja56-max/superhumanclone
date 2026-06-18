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

function extractField(input: string, label: string) {
  const regex = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i");
  return input.match(regex)?.[1]?.trim() ?? "";
}

function extractEmails(input: string) {
  return [...input.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
}

function normalizeCalendarText(input: string) {
  return input.replace(/\s+/g, " ").trim();
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

function hasExplicitTimeSignal(input: string) {
  return /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.test(input) || /\b\d{1,2}:\d{2}\b/.test(input) || /\b(noon|midnight)\b/i.test(input);
}

function hasExplicitDateSignal(input: string) {
  return /\b(today|tomorrow|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(input);
}

function parseRelativeDateTime(input: string, preferredIso?: string) {
  const hasTimeSignal = hasExplicitTimeSignal(input);
  const hasDateSignal = hasExplicitDateSignal(input);

  if (preferredIso && (hasDateSignal || hasTimeSignal)) {
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
    const sameDay = /\btoday\b/.test(lower) || hasTimeSignal;
    if (!sameDay) return null;
  }

  if (!hasTimeSignal) {
    return null;
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

  if (/\bnoon\b/i.test(input)) {
    base.setHours(12, 0, 0, 0);
    return base;
  }

  if (/\bmidnight\b/i.test(input)) {
    base.setHours(0, 0, 0, 0);
    return base;
  }

  return null;
}

function extractCalendarTitle(source: string, aiResult: Awaited<ReturnType<typeof smartFillFromThread>>, attendeesSummary: string) {
  const explicitTitle = extractField(source, "title");
  if (explicitTitle) return explicitTitle;

  const namedMatch = source.match(/\b(?:called|named|titled)\s+(.+?)(?=\b(?:tomorrow|today|next|on|at|with|for\s+\d+|for\s+\d+\s*(?:m|min|mins|minute|minutes|h|hr|hrs|hour|hours)|in)\b|$)/i);
  if (namedMatch?.[1]) return normalizeCalendarText(namedMatch[1]);

  const eventForMatch = source.match(/\b(?:event|meeting|call|sync)\s+for\s+(.+?)(?=\b(?:tomorrow|today|next|on|at|with|in)\b|$)/i);
  if (eventForMatch?.[1]) return normalizeCalendarText(eventForMatch[1]);

  const aiTitle = normalizeCalendarText(aiResult.suggestedTitle || "");
  if (aiTitle && aiTitle.toLowerCase() !== "meeting") return aiTitle;

  if (attendeesSummary) {
    return `Meeting with ${attendeesSummary}`;
  }

  return "";
}

function deriveCalendarDraft(source: string, aiResult: Awaited<ReturnType<typeof smartFillFromThread>>): CalendarDraft | null {
  const requestedDuration = parseDurationMinutes(source);
  const startTime = parseRelativeDateTime(source, aiResult.suggestedTime || undefined);
  if (!startTime) return null;

  const attendees = extractEmails(source);
  const attendeesSummary = extractAttendeeSummary(source);
  const title = extractCalendarTitle(source, aiResult, attendeesSummary);
  if (!title) return null;
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
  const createVerb = /\b(schedule|book|set up|set-up|plan|arrange|create|add|invite)\b/.test(lower);
  const timeSignal = hasExplicitDateSignal(source) || hasExplicitTimeSignal(source);
  const meetingSignal = /\b(call|meeting|event|meet|calendar|invite)\b/.test(lower);
  const prepSignal = /\b(prep|prepare|brief)\b/.test(lower);
  return !prepSignal && ((createVerb && meetingSignal) || (meetingSignal && timeSignal));
}

function buildCalendarClarification(source: string, aiResult: Awaited<ReturnType<typeof smartFillFromThread>>) {
  const attendeesSummary = extractAttendeeSummary(source);
  const title = extractCalendarTitle(source, aiResult, attendeesSummary);
  const hasTime = Boolean(parseRelativeDateTime(source, aiResult.suggestedTime || undefined));

  if (!title && !hasTime) {
    return "What title and time should I use for the event?";
  }

  if (!title) {
    return "What should I call the event?";
  }

  if (!hasTime) {
    return `What time should I use for ${title}?`;
  }

  return "Share one clearer event detail so I can prepare the calendar draft.";
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
      indicator: "Drafting calendar event...",
      text: buildCalendarClarification(source, result),
    };
  }

  const draft = deriveCalendarDraft(source, result);

  if (!draft) {
    return {
      intent: "calendar",
      indicator: "Drafting calendar event...",
      text: buildCalendarClarification(source, result),
    };
  }

  await hitlInterceptor({
    actionType: "create_event",
    payload: draft,
    humanReadable: `Create calendar event: ${draft.title}`,
  });

  return {
    intent: "calendar",
    indicator: "Drafting calendar event...",
    text: [
      "Ready for approval.",
      `Create calendar event: ${draft.title}`,
      `When: ${format(parseISO(draft.startTime), "EEE, MMM d 'at' h:mm a")}`,
      `Duration: ${draft.durationMinutes} min`,
      `Meet: ${draft.addMeetLink ? "enabled" : "disabled"}`,
      draft.attendeesSummary ? `Attendees: ${draft.attendeesSummary}` : "Attendees: none detected",
    ].join("\n"),
  };
}
