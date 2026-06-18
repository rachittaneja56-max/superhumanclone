import "server-only";

import { and, between, desc, eq, gt } from "drizzle-orm";

import { generateDigest } from "../provider";
import { db } from "@/server/db";
import { calendarEvents, emails } from "@/server/db/schema";
import { getSafeUserSettings } from "@/server/db/user-settings-compat";
import type { AgentContext, AgentResult } from "./types";

export async function runDigestAgent(context: AgentContext): Promise<AgentResult> {
  const settings = await getSafeUserSettings(context.userId);

  if (!settings.aiEnabled || !settings.morningDigestEnabled || !settings.privacyConfigured) {
    return {
      intent: "digest",
      indicator: "Preparing your digest...",
      text: "Morning Digest is unavailable until AI, Morning Digest, and Privacy Gate are enabled.",
    };
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [unreads, events] = await Promise.all([
    db.select({
      from_name: emails.from_name,
      from_address: emails.from_address,
      subject: emails.subject,
      snippet: emails.snippet,
      priority: emails.priority,
    })
      .from(emails)
      .where(
        and(
          eq(emails.userId, context.userId),
          eq(emails.is_read, false),
          eq(emails.ai_triage_skipped, false),
          gt(emails.created_at, dayAgo),
        ),
      )
      .orderBy(desc(emails.priority))
      .limit(12),
    db.select({
      title: calendarEvents.title,
      start_time: calendarEvents.start_time,
      end_time: calendarEvents.end_time,
      location: calendarEvents.location,
    })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, context.userId),
          between(calendarEvents.start_time, startOfDay, endOfDay),
        ),
      )
      .limit(8),
  ]);

  const digest = await generateDigest(
    unreads.map((email) => ({
      from: email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address,
      subject: email.subject ?? "(No Subject)",
      snippet: email.snippet ?? "",
      priority: email.priority ?? "medium",
    })),
    events.map((event) => ({
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      location: event.location,
    })),
    { userId: context.userId },
  );

  return {
    intent: "digest",
    indicator: "Preparing your digest...",
    text: digest,
  };
}
