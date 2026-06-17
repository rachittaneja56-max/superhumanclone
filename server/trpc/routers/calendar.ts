import { and, asc, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { emails, calendarEvents, users } from '../../db/schema';
import { generateMeetingPrepBrief, smartFillFromThread } from '../../ai/provider';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
} from '../../corsair/client';
import {
  cacheTtls,
  calendarCacheKey,
  invalidateCalendarCache,
  calendarVersionKey,
} from '@/server/cache';
import {
  smartFillFromThreadSchema,
  generatePrepBriefSchema,
  createEventSchema,
  deleteEventSchema,
  getEventsSchema,
  getTimelineSchema,
  updateEventSchema,
} from '@/lib/schemas';
import { decodeHtmlEntities, safeDisplayName } from '@/lib/email-client';

function mapDbEvent(row: typeof calendarEvents.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    corsair_event_id: row.corsair_event_id,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    meetLink: row.meeting_link,
    attendeesSummary: row.attendees_summary,
    is_all_day: row.is_all_day,
    status: row.status,
  };
}

function mapRemoteEvent(userId: string, event: Record<string, unknown>) {
  const id = String(event.id ?? event.eventId ?? event.corsair_event_id ?? '');
  if (!id) return null;

  const start = (event.start as Record<string, unknown> | undefined) ?? {};
  const end = (event.end as Record<string, unknown> | undefined) ?? {};
  const startRaw = String(start.dateTime ?? start.date ?? event.startTime ?? Date.now());
  const endRaw = String(end.dateTime ?? end.date ?? event.endTime ?? Date.now());
  const isAllDay = !!start.date && !start.dateTime;
  const attendeesSummary = extractAttendeeSummary(event);
  const meetingLink = extractMeetLink(event);

  return {
    userId,
    corsair_event_id: id,
    title: String(event.summary ?? event.title ?? '(No Title)'),
    description: (event.description as string) || null,
    start_time: new Date(startRaw),
    end_time: new Date(endRaw),
    location: (event.location as string) || null,
    meeting_link: meetingLink,
    attendees_summary: attendeesSummary,
    is_all_day: isAllDay,
    status: (event.status as string) || 'confirmed',
  };
}

async function upsertRemoteEvents(ctx: any, items: Record<string, unknown>[]) {
  const rows = items.map((event) => mapRemoteEvent(ctx.userId!, event)).filter(Boolean) as Array<{
    userId: string;
    corsair_event_id: string;
    title: string;
    description: string | null;
    start_time: Date;
    end_time: Date;
    location: string | null;
    meeting_link: string | null;
    attendees_summary: string | null;
    is_all_day: boolean;
    status: string;
  }>;

  if (rows.length === 0) return;

  for (const row of rows) {
    await ctx.db
      .insert(calendarEvents)
      .values(row)
      .onConflictDoUpdate({
        target: calendarEvents.corsair_event_id,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          start_time: sql`excluded.start_time`,
          end_time: sql`excluded.end_time`,
          location: sql`excluded.location`,
          meeting_link: sql`excluded.meeting_link`,
          attendees_summary: sql`excluded.attendees_summary`,
          is_all_day: sql`excluded.is_all_day`,
          status: sql`excluded.status`,
          updated_at: new Date(),
        },
      });
  }
}

function serializeEvent(row: ReturnType<typeof mapDbEvent>) {
  return {
    ...row,
    startTime: row.startTime,
    endTime: row.endTime,
  };
}

function parseRecipientList(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractAttendees(event: Record<string, unknown> | null | undefined) {
  const attendees = event && Array.isArray(event.attendees) ? event.attendees : [];
  return attendees
    .map((attendee) => {
      if (typeof attendee === 'string') return attendee.trim();
      if (!attendee || typeof attendee !== 'object') return '';
      const record = attendee as Record<string, unknown>;
      const email = String(record.email ?? record.address ?? '').trim();
      const name = String(record.displayName ?? record.name ?? '').trim();
      return name && email ? `${name} <${email}>` : email || name;
    })
    .filter(Boolean);
}

function extractMeetLink(event: Record<string, unknown> | null | undefined) {
  if (!event) return null;
  if (typeof event.hangoutLink === 'string' && event.hangoutLink) {
    return event.hangoutLink;
  }

  const conferenceData = event.conferenceData as Record<string, unknown> | undefined;
  const entryPoints = Array.isArray(conferenceData?.entryPoints) ? conferenceData.entryPoints : [];
  for (const entry of entryPoints) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (String(record.entryPointType ?? '') === 'video' && typeof record.uri === 'string' && record.uri) {
      return record.uri;
    }
  }

  return null;
}

function extractAttendeeSummary(event: Record<string, unknown> | null | undefined) {
  if (!event || !Array.isArray(event.attendees)) return null;
  const names = event.attendees
    .map((attendee) => {
      if (!attendee || typeof attendee !== 'object') return '';
      const record = attendee as Record<string, unknown>;
      const name = typeof record.displayName === 'string' ? record.displayName.trim() : '';
      const email = typeof record.email === 'string' ? record.email.trim() : '';
      return name || email;
    })
    .filter(Boolean);

  return names.length > 0 ? names.join(', ') : null;
}

function normalizeEmailForMatch(value: string) {
  return value.toLowerCase().replace(/[<>"']/g, '').trim();
}

export const calendarRouter = router({
  smartFillFromThread: protectedProcedure
    .input(smartFillFromThreadSchema)
    .mutation(async ({ ctx, input }) => {
      const threadEmails = await ctx.db.query.emails.findMany({
        where: and(eq(emails.userId, ctx.userId!), eq(emails.thread_id, input.threadId)),
        orderBy: [asc(emails.created_at)],
      });

      if (threadEmails.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thread not found' });
      }

      if (threadEmails.some((e) => e.ai_triage_skipped)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Thread contains emails from privacy-protected domains. Smart Fill is unavailable.',
        });
      }

      const participants = new Set<string>();
      for (const e of threadEmails) {
        if (e.from_address) participants.add(e.from_address);
        if (e.to_address) parseRecipientList(e.to_address).forEach((item) => participants.add(item));
      }

      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId!),
        columns: { email: true },
      });
      if (currentUser?.email) participants.delete(currentUser.email);

      const content = threadEmails
        .map((e) => `From: ${e.from_name || e.from_address}\nSubject: ${e.subject}\n${e.snippet || ''}`)
        .join('\n---\n');

      const aiResult = await smartFillFromThread(content, { userId: ctx.userId! });

      return {
        ...aiResult,
        participants: Array.from(participants),
      };
    }),

  generatePrepBrief: protectedProcedure
    .input(generatePrepBriefSchema)
    .mutation(async ({ ctx, input }) => {
      const localEvent = await ctx.db.query.calendarEvents.findFirst({
        where: and(
          eq(calendarEvents.userId, ctx.userId!),
          or(eq(calendarEvents.id, input.eventId), eq(calendarEvents.corsair_event_id, input.eventId)),
        ),
      });

      if (!localEvent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      const start = new Date(localEvent.start_time);
      const end = new Date(localEvent.end_time);
      const windowStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      const windowEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);

      let liveEvent: Record<string, unknown> | null = null;
      try {
        const remote = await getCalendarEvents(ctx.userId!, {
          limit: 50,
          timeMin: windowStart.toISOString(),
          timeMax: windowEnd.toISOString(),
        });

        if (remote.success && Array.isArray(remote.data)) {
          liveEvent =
            (remote.data as Record<string, unknown>[]).find((event) => {
              const id = String(event.id ?? event.eventId ?? event.corsair_event_id ?? '');
              const summary = String(event.summary ?? event.title ?? '');
              return id === input.eventId || id === localEvent.corsair_event_id || summary === localEvent.title;
            }) ?? null;
        }
      } catch {
        liveEvent = null;
      }

      const attendeeList = extractAttendees(liveEvent).map((entry) => decodeHtmlEntities(entry));
      const attendeeTokens = attendeeList
        .map((entry) => normalizeEmailForMatch(entry))
        .filter(Boolean);
      const titleTokens = localEvent.title
        .split(/\s+/)
        .map((part) => normalizeEmailForMatch(part))
        .filter((part) => part.length > 2);

      const candidateEmails = await ctx.db
        .select({
          id: emails.id,
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
            eq(emails.userId, ctx.userId!),
            eq(emails.is_deleted, false),
            eq(emails.ai_triage_skipped, false),
            gte(emails.created_at, new Date(start.getTime() - 60 * 24 * 60 * 60 * 1000)),
            lte(emails.created_at, end),
          ),
        )
        .orderBy(desc(emails.created_at))
        .limit(30);

      const relevantEmails = candidateEmails.filter((email) => {
        const haystack = [
          email.from_name,
          email.from_address,
          email.to_address,
          email.subject,
          email.snippet,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (attendeeTokens.some((token) => token && haystack.includes(token))) {
          return true;
        }

        return titleTokens.some((token) => token && haystack.includes(token));
      }).slice(0, 8);

      const fallbackEmails = relevantEmails.length > 0 ? relevantEmails : candidateEmails.slice(0, 5);
      const briefContext = [
        `Meeting title: ${localEvent.title}`,
        `Start: ${start.toISOString()}`,
        `End: ${end.toISOString()}`,
        `Attendees: ${attendeeList.length ? attendeeList.join(', ') : 'Unknown / not available'}`,
        '',
        'Allowed email context:',
        ...fallbackEmails.map((email) => {
          const sender = safeDisplayName(email.from_name, email.from_address);
          const subject = email.subject ?? '(no subject)';
          const snippet = email.snippet ?? 'No preview available.';
          const receivedAt = new Date(email.created_at).toISOString();
          return `- ${sender} | ${subject} | ${snippet} | ${receivedAt}`;
        }),
      ].join('\n');

      try {
        const aiBrief = await generateMeetingPrepBrief(briefContext, { userId: ctx.userId! });
        return {
          ...aiBrief,
          attendees: attendeeList.length ? attendeeList : aiBrief.attendees,
          recentEmails: aiBrief.recentEmails.length ? aiBrief.recentEmails : fallbackEmails.map((email) => ({
            sender: safeDisplayName(email.from_name, email.from_address),
            subject: email.subject ?? '(no subject)',
            snippet: email.snippet ?? 'No preview available.',
            receivedAt: new Date(email.created_at).toISOString(),
          })),
        };
      } catch {
        return {
          summary: 'A short prep brief is unavailable right now, but the meeting details are ready.',
          attendees: attendeeList,
          recentEmails: fallbackEmails.map((email) => ({
            sender: safeDisplayName(email.from_name, email.from_address),
            subject: email.subject ?? '(no subject)',
            snippet: email.snippet ?? 'No preview available.',
            receivedAt: new Date(email.created_at).toISOString(),
          })),
          openQuestions: [],
          talkingPoints: [],
        };
      }
    }),

  getTimeline: protectedProcedure
    .input(getTimelineSchema)
    .query(async ({ ctx, input }) => {
      const version = Number((await ctx.redis.get<string>(calendarVersionKey(ctx.userId!))) ?? '0');
      const cacheKey = `user:${ctx.userId}:timeline:v1:${version}:${input.startDate.toISOString()}:${input.endDate.toISOString()}`;
      const cached = await ctx.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // fall through
        }
      }

      const [events, mails] = await Promise.all([
        ctx.db
          .select()
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.userId, ctx.userId!),
              gte(calendarEvents.start_time, input.startDate),
              lte(calendarEvents.start_time, input.endDate),
            ),
          )
          .orderBy(asc(calendarEvents.start_time)),
        ctx.db
          .select({
            id: emails.id,
            thread_id: emails.thread_id,
            from_name: emails.from_name,
            from_address: emails.from_address,
            subject: emails.subject,
            snippet: emails.snippet,
            is_read: emails.is_read,
            created_at: emails.created_at,
          })
          .from(emails)
          .where(
            and(
              eq(emails.userId, ctx.userId!),
              eq(emails.is_deleted, false),
              gte(emails.created_at, input.startDate),
              lte(emails.created_at, input.endDate),
            ),
          )
          .orderBy(desc(emails.created_at)),
      ]);

      const timeline = [
        ...events.map((event) => ({
          type: 'event' as const,
          id: event.id,
          time: event.start_time,
          title: event.title,
          subtitle: event.location || event.status,
          attendeesSummary: event.attendees_summary ?? null,
          event: serializeEvent(mapDbEvent(event)),
        })),
        ...mails.map((mail) => ({
          type: 'email' as const,
          id: mail.id,
          threadId: mail.thread_id,
          time: mail.created_at,
          sender: mail.from_name || mail.from_address || 'Unknown sender',
          subject: mail.subject || '(no subject)',
          snippet: mail.snippet || 'No preview available.',
          unread: !mail.is_read,
        })),
      ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

      await ctx.redis.set(cacheKey, JSON.stringify(timeline), { ex: cacheTtls.calendar });
      return timeline;
    }),

  getEvents: protectedProcedure
    .input(getEventsSchema)
    .query(async ({ ctx, input }) => {
      const version = Number((await ctx.redis.get<string>(calendarVersionKey(ctx.userId!))) ?? '0');
      const cacheKey = calendarCacheKey(
        ctx.userId!,
        version,
        input.startDate.toISOString(),
        input.endDate.toISOString()
      );
      const cached = await ctx.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // fall through
        }
      }

      try {
        const remote = await getCalendarEvents(ctx.userId!, {
          limit: 250,
          timeMin: input.startDate.toISOString(),
          timeMax: input.endDate.toISOString(),
        });
        if (remote.success && Array.isArray(remote.data) && remote.data.length > 0) {
          await upsertRemoteEvents(ctx, remote.data as Record<string, unknown>[]);
          const refreshed = await ctx.db
            .select()
            .from(calendarEvents)
            .where(
              and(
                eq(calendarEvents.userId, ctx.userId!),
                gte(calendarEvents.start_time, input.startDate),
                lte(calendarEvents.start_time, input.endDate),
              )
            )
            .orderBy(asc(calendarEvents.start_time));
          const mapped = refreshed.map(mapDbEvent).map(serializeEvent);
          await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: cacheTtls.calendar });
          return mapped;
        }
      } catch (err) {
        console.warn('[getEvents] Corsair fallback failed:', err);
      }

      const localEvents = await ctx.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, ctx.userId!),
            gte(calendarEvents.start_time, input.startDate),
            lte(calendarEvents.start_time, input.endDate),
          )
        )
        .orderBy(asc(calendarEvents.start_time));

      if (localEvents.length > 0) {
        const mapped = localEvents.map(mapDbEvent).map(serializeEvent);
        await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: cacheTtls.calendar });
        return mapped;
      }

      await ctx.redis.set(cacheKey, JSON.stringify([]), { ex: cacheTtls.calendar });
      return [];
    }),

  createEvent: protectedProcedure
    .input(createEventSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await createCalendarEvent(ctx.userId!, {
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        attendees: input.attendees,
        description: input.description,
        location: input.location,
        addMeetLink: input.addMeetLink,
      });

      if (result.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Calendar not connected' });
      }

      const event = result.data as Record<string, unknown> | undefined;
      if (event) {
        const mapped = mapRemoteEvent(ctx.userId!, event);
        if (mapped) {
          await ctx.db
            .insert(calendarEvents)
            .values(mapped)
            .onConflictDoUpdate({
              target: calendarEvents.corsair_event_id,
              set: {
                title: sql`excluded.title`,
                description: sql`excluded.description`,
                start_time: sql`excluded.start_time`,
                end_time: sql`excluded.end_time`,
                location: sql`excluded.location`,
                is_all_day: sql`excluded.is_all_day`,
                status: sql`excluded.status`,
                updated_at: new Date(),
              },
            });
        }
      }

      await invalidateCalendarCache(ctx.redis, ctx.userId!);

      return {
        success: true,
        eventId: (event?.id as string | undefined) ?? null,
        meetLink: result.meetLink ?? (event?.hangoutLink as string | undefined) ?? null,
      };
    }),

  updateEvent: protectedProcedure
    .input(updateEventSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await updateCalendarEvent(ctx.userId!, {
        eventId: input.eventId,
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        attendees: input.attendees,
        description: input.description,
        location: input.location,
        addMeetLink: input.addMeetLink,
      });

      if (result.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Calendar not connected' });
      }

      const event = result.data as Record<string, unknown> | undefined;
      if (event) {
        const mapped = mapRemoteEvent(ctx.userId!, event);
        if (mapped) {
          await ctx.db
            .insert(calendarEvents)
            .values(mapped)
            .onConflictDoUpdate({
              target: calendarEvents.corsair_event_id,
              set: {
                title: sql`excluded.title`,
                description: sql`excluded.description`,
                start_time: sql`excluded.start_time`,
                end_time: sql`excluded.end_time`,
                location: sql`excluded.location`,
                is_all_day: sql`excluded.is_all_day`,
                status: sql`excluded.status`,
                updated_at: new Date(),
              },
            });
        }
      }

      await invalidateCalendarCache(ctx.redis, ctx.userId!);

      return {
        success: true,
        eventId: input.eventId,
        meetLink: result.meetLink ?? (event?.hangoutLink as string | undefined) ?? null,
      };
    }),

  deleteEvent: protectedProcedure
    .input(deleteEventSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await deleteCalendarEvent(ctx.userId!, input.eventId);
      if (result.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Calendar not connected' });
      }

      await ctx.db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.userId, ctx.userId!), eq(calendarEvents.corsair_event_id, input.eventId)));

      await invalidateCalendarCache(ctx.redis, ctx.userId!);
      return { success: true };
    }),
});
