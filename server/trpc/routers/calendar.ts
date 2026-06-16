import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { emails, calendarEvents, users } from '../../db/schema';
import { eq, and, asc, gte, lte } from 'drizzle-orm';
import { smartFillFromThread } from '../../ai/provider';
import { TRPCError } from '@trpc/server';
import { createCalendarEvent, getCalendarEvents } from '../../corsair/client';

import { smartFillFromThreadSchema, createEventSchema, getEventsSchema } from '@/lib/schemas';

export const calendarRouter = router({
  smartFillFromThread: protectedProcedure
    .input(smartFillFromThreadSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch thread emails
      const threadEmails = await db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          eq(emails.thread_id, input.threadId)
        ),
        orderBy: [asc(emails.created_at)],
      });

      if (threadEmails.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thread not found' });
      }

      // PRIVACY GATE
      const hasBlocked = threadEmails.some((e) => e.ai_triage_skipped);
      if (hasBlocked) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Thread contains emails from privacy-protected domains. Smart Fill is unavailable.',
        });
      }

      // Extract unique participants
      const participantSet = new Set<string>();
      for (const e of threadEmails) {
        if (e.from_address) participantSet.add(e.from_address);
        if (e.to_address) participantSet.add(e.to_address);
      }
      
      const currentUser = await db.query.users.findFirst({ where: eq(users.id, ctx.userId!) });
      if (currentUser?.email) {
        participantSet.delete(currentUser.email);
      }
      const participants = Array.from(participantSet);

      // Build content
      const content = threadEmails
        .map((e) => `From: ${e.from_name || e.from_address}\nSubject: ${e.subject}\n${e.snippet || ''}`)
        .join('\n---\n');

      // AI Call
      const aiResult = await smartFillFromThread(content);

      return {
        ...aiResult,
        participants,
      };
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
      });

      if (result.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Calendar not connected' });
      }

      // We should ideally sync it back to DB immediately, but Corsair webhook might handle it.
      // We will assume webhook handles it or UI refetches.

      return { success: true, event: result.data };
    }),

  getEvents: protectedProcedure
    .input(getEventsSchema)
    .query(async ({ ctx, input }) => {
      // Try local DB first
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
        .orderBy(asc(calendarEvents.start_time))

      if (localEvents.length > 0) {
        // Normalize DB rows to camelCase for the client
        return localEvents.map(e => ({
          id: e.id,
          userId: e.userId,
          corsair_event_id: e.corsair_event_id,
          title: e.title,
          description: e.description,
          startTime: e.start_time,
          endTime: e.end_time,
          location: e.location,
          is_all_day: e.is_all_day,
          status: e.status,
        }))
      }

      // If the date range returned nothing, broaden to all events in DB (no date filter)
      // This handles historical events that were seeded before webhooks were active
      try {
        const allLocalEvents = await ctx.db
          .select()
          .from(calendarEvents)
          .where(eq(calendarEvents.userId, ctx.userId!))
          .orderBy(asc(calendarEvents.start_time))

        if (allLocalEvents.length > 0) {
          return allLocalEvents.map(e => ({
            id: e.id,
            userId: e.userId,
            corsair_event_id: e.corsair_event_id,
            title: e.title,
            description: e.description,
            startTime: e.start_time,
            endTime: e.end_time,
            location: e.location,
            is_all_day: e.is_all_day,
            status: e.status,
          }))
        }
      } catch (_) { /* fall through to Corsair */ }

      // Last resort: Corsair API/DB layer
      try {
        const result = await getCalendarEvents(ctx.userId!, { limit: 100 })
        if (!result.success || !result.data) return []

        return (result.data as any[]).map((e: any) => ({
          id: e.id,
          userId: ctx.userId!,
          corsair_event_id: e.id,
          title: e.summary || e.title || '(No Title)',
          description: e.description || null,
          startTime: new Date(e.start?.dateTime || e.start?.date || e.startTime || Date.now()),
          endTime: new Date(e.end?.dateTime || e.end?.date || e.endTime || Date.now()),
          location: e.location || null,
          is_all_day: !!(e.start?.date && !e.start?.dateTime),
          status: e.status || 'confirmed',
        }))
      } catch (err) {
        console.warn('[getEvents] Corsair fallback failed:', err)
        return []
      }
    }),
});
