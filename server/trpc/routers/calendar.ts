import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { emails, calendarEvents, users } from '../../db/schema';
import { smartFillFromThread } from '../../ai/provider';
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, updateCalendarEvent } from '../../corsair/client';
import {
  cacheTtls,
  calendarCacheKey,
  invalidateCalendarCache,
  calendarVersionKey,
} from '@/server/cache';
import {
  smartFillFromThreadSchema,
  createEventSchema,
  deleteEventSchema,
  getEventsSchema,
  updateEventSchema,
} from '@/lib/schemas';

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
    is_all_day: row.is_all_day,
    status: row.status,
    meetLink: null,
    attendees: [] as string[],
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

  return {
    userId,
    corsair_event_id: id,
    title: String(event.summary ?? event.title ?? '(No Title)'),
    description: (event.description as string) || null,
    start_time: new Date(startRaw),
    end_time: new Date(endRaw),
    location: (event.location as string) || null,
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
    is_all_day: boolean;
    status: string;
  }>;

  if (rows.length === 0) return;

  await ctx.db
    .insert(calendarEvents)
    .values(rows)
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

function serializeEvent(row: ReturnType<typeof mapDbEvent>) {
  return {
    ...row,
    startTime: row.startTime,
    endTime: row.endTime,
  };
}

export const calendarRouter = router({
  smartFillFromThread: protectedProcedure
    .input(smartFillFromThreadSchema)
    .mutation(async ({ ctx, input }) => {
      const threadEmails = await ctx.db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          eq(emails.thread_id, input.threadId)
        ),
        orderBy: [asc(emails.created_at)],
      });

      if (threadEmails.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thread not found' });
      }

      const hasBlocked = threadEmails.some((e) => e.ai_triage_skipped);
      if (hasBlocked) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Thread contains emails from privacy-protected domains. Smart Fill is unavailable.',
        });
      }

      const participantSet = new Set<string>();
      for (const e of threadEmails) {
        if (e.from_address) participantSet.add(e.from_address);
        if (e.to_address) participantSet.add(e.to_address);
      }

      const currentUser = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.userId!) });
      if (currentUser?.email) participantSet.delete(currentUser.email);

      const content = threadEmails
        .map((e) => `From: ${e.from_name || e.from_address}\nSubject: ${e.subject}\n${e.snippet || ''}`)
        .join('\n---\n');

      const aiResult = await smartFillFromThread(content);

      return {
        ...aiResult,
        participants: Array.from(participantSet),
      };
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
