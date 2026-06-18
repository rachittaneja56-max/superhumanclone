import "server-only";

import { and, asc, desc, eq, gt, gte, ilike, lte, or } from "drizzle-orm";

import { db } from "@/server/db";
import { calendarEvents, emails } from "@/server/db/schema";
import { generateMeetingPrepBrief } from "../provider";
import { sanitiseAgentOutput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

function normalizeEmailForMatch(value: string) {
  return value.toLowerCase().replace(/[<>"']/g, "").trim();
}

function extractAttendees(summary: string | null | undefined) {
  return (summary ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function runMeetingPrepAgent(context: AgentContext): Promise<AgentResult> {
  const query = context.userMessage.trim();
  const titlePattern = query
    .replace(/\b(prep|prepare|brief|meeting|call|event|calendar|for|me|about)\b/gi, "")
    .trim();
  const eventWhere = titlePattern
    ? and(
        eq(calendarEvents.userId, context.userId),
        gt(calendarEvents.start_time, new Date()),
        or(
          ilike(calendarEvents.title, `%${titlePattern}%`),
          ilike(calendarEvents.attendees_summary, `%${titlePattern}%`),
        ),
      )
    : and(
        eq(calendarEvents.userId, context.userId),
        gt(calendarEvents.start_time, new Date()),
      );

  const event = await db.query.calendarEvents.findFirst({
    where: eventWhere,
    orderBy: [asc(calendarEvents.start_time)],
  });

  if (!event) {
    return {
      intent: "meetingPrep",
      indicator: "Preparing meeting brief...",
      text: "I could not find an upcoming meeting to prep. Mention the event title or open the event first.",
    };
  }

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const windowStart = new Date(start.getTime() - 60 * 24 * 60 * 60 * 1000);
  const attendeeTokens = extractAttendees(event.attendees_summary).map((entry) => normalizeEmailForMatch(entry));
  const titleTokens = event.title
    .split(/\s+/)
    .map((part) => normalizeEmailForMatch(part))
    .filter((part) => part.length > 2);

  const candidateEmails = await db
    .select({
      from_name: emails.from_name,
      from_address: emails.from_address,
      to_address: emails.to_address,
      subject: emails.subject,
      snippet: emails.snippet,
      created_at: emails.created_at,
    })
    .from(emails)
    .where(
      and(
        eq(emails.userId, context.userId),
        eq(emails.is_deleted, false),
        eq(emails.ai_triage_skipped, false),
        gte(emails.created_at, windowStart),
        lte(emails.created_at, end),
      ),
    )
    .orderBy(desc(emails.created_at))
    .limit(24);

  const relevantEmails = candidateEmails.filter((email) => {
    const haystack = [
      email.from_name,
      email.from_address,
      email.to_address,
      email.subject,
      email.snippet,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (attendeeTokens.some((token) => token && haystack.includes(token))) {
      return true;
    }

    return titleTokens.some((token) => token && haystack.includes(token));
  }).slice(0, 6);

  const briefContext = [
    `Meeting title: ${event.title}`,
    `Start: ${start.toISOString()}`,
    `End: ${end.toISOString()}`,
    `Attendees: ${event.attendees_summary || "Unknown / not available"}`,
    "",
    "Allowed email context:",
    ...relevantEmails.map((email) => {
      const sender = sanitiseAgentOutput(email.from_name || email.from_address || "Unknown sender", 120);
      const subject = sanitiseAgentOutput(email.subject ?? "(no subject)", 160);
      const snippet = sanitiseAgentOutput(email.snippet ?? "No preview available.", 180);
      return `- ${sender} | ${subject} | ${snippet} | ${new Date(email.created_at).toISOString()}`;
    }),
  ].join("\n");

  const brief = await generateMeetingPrepBrief(briefContext, { userId: context.userId });
  const lines = [
    brief.summary || `Prep for ${sanitiseAgentOutput(event.title, 120)}.`,
    `Meeting: ${sanitiseAgentOutput(event.title, 120)}`,
    `When: ${start.toLocaleString()}`,
  ];

  if (brief.attendees.length > 0) {
    lines.push(`Attendees: ${brief.attendees.slice(0, 4).join(", ")}`);
  }

  if (brief.talkingPoints.length > 0) {
    lines.push(...brief.talkingPoints.map((item) => `- ${item}`));
  } else if (brief.openQuestions.length > 0) {
    lines.push(...brief.openQuestions.map((item) => `- ${item}`));
  } else if (relevantEmails.length === 0) {
    lines.push("Not enough mailbox detail to prep this meeting precisely.");
  }

  return {
    intent: "meetingPrep",
    indicator: "Preparing meeting brief...",
    text: lines.join("\n"),
  };
}
