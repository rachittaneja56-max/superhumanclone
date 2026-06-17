import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { contactIntelligence, emails, calendarEvents } from '../../db/schema';
import { eq, and, desc, or, ilike, gt } from 'drizzle-orm';
import { redis } from '../../redis';
import { generateContactSummary } from '../../ai/provider';
import { getContactIntelSchema } from '@/lib/schemas';

export const contactsRouter = router({
  getContactIntel: protectedProcedure
    .input(getContactIntelSchema)
    .query(async ({ ctx, input }) => {
      const cacheKey = `contact:${ctx.userId}:${input.contactEmail}`;
      const cached = await redis.get<string>(cacheKey);

      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }

      // Parallel fetch
      const [recentEmails, nextEvent, existingIntel] = await Promise.all([
        db.query.emails.findMany({
          where: and(
            eq(emails.userId, ctx.userId!),
            or(
              ilike(emails.from_address, `%${input.contactEmail}%`),
              ilike(emails.to_address, `%${input.contactEmail}%`)
            )
          ),
          orderBy: [desc(emails.created_at)],
          limit: 3,
        }),
        db.query.calendarEvents.findFirst({
          where: and(
            eq(calendarEvents.userId, ctx.userId!),
            gt(calendarEvents.start_time, new Date()),
            ilike(calendarEvents.title, `%${input.contactEmail}%`) // Simple approximation for attendees since attendees aren't separated in DB
          ),
          orderBy: [calendarEvents.start_time],
        }),
        db.query.contactIntelligence.findFirst({
          where: and(
            eq(contactIntelligence.userId, ctx.userId!),
            eq(contactIntelligence.email, input.contactEmail)
          ),
        }),
      ]);

      let summary = existingIntel?.summary || "No recent summary available.";
      
      const isStale = !existingIntel || (Date.now() - new Date(existingIntel.updated_at).getTime() > 30 * 24 * 60 * 60 * 1000);
      const hasBlockedEmails = recentEmails.some((e) => e.ai_triage_skipped);

      if (isStale && !hasBlockedEmails && recentEmails.length > 0) {
        const snippets = recentEmails.map((e) => e.snippet || "").filter(Boolean);
        if (snippets.length > 0) {
          try {
            summary = await generateContactSummary(snippets, { userId: ctx.userId! });
            
            // Upsert in DB
            if (existingIntel) {
              await db.update(contactIntelligence)
                .set({ summary, updated_at: new Date() })
                .where(eq(contactIntelligence.id, existingIntel.id));
            } else {
              await db.insert(contactIntelligence).values({
                userId: ctx.userId!,
                email: input.contactEmail,
                summary,
                interaction_count: recentEmails.length,
              });
            }
          } catch (error) {
            console.error("Failed to generate contact summary:", error);
          }
        }
      }

      const result = {
        email: input.contactEmail,
        summary,
        recentEmails: recentEmails.map(e => ({ id: e.id, subject: e.subject, date: e.created_at })),
        nextEvent: nextEvent ? { title: nextEvent.title, start: nextEvent.start_time } : null,
      };

      await redis.set(cacheKey, JSON.stringify(result), { ex: 3600 }); // 1 hour TTL

      return result;
    }),
});
