import { z } from 'zod';
import { router, protectedProcedure, protectedQueryProcedure } from '../trpc';
import { db } from '../../db';
import { contactIntelligence, emails, calendarEvents, aiConsentRules } from '../../db/schema';
import { eq, and, desc, or, ilike, gt } from 'drizzle-orm';
import { redis } from '../../redis';
import { generateContactSummary } from '../../ai/provider';
import { isDomainBlocked } from '@/lib/domain-matcher';
import { getContactIntelSchema } from '@/lib/schemas';

export const contactsRouter = router({
  getContactIntel: protectedQueryProcedure
    .input(getContactIntelSchema)
    .query(async ({ ctx, input }) => {
      const contactEmail = input.contactEmail.trim().toLowerCase();
      const consentVersion = Number((await redis.get<string>(`consent_version:${ctx.userId!}`)) ?? '0');
      const cacheKey = `contact:${ctx.userId}:${consentVersion}:${contactEmail}`;
      const cached = await redis.get<string>(cacheKey);

      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }

      // Parallel fetch
      const [recentEmails, nextEvent, existingIntel, consentRules] = await Promise.all([
        db.query.emails.findMany({
          where: and(
            eq(emails.userId, ctx.userId!),
            eq(emails.is_deleted, false),
            or(
              ilike(emails.from_address, `%${contactEmail}%`),
              ilike(emails.to_address, `%${contactEmail}%`)
            )
          ),
          orderBy: [desc(emails.created_at)],
          limit: 3,
        }),
        db.query.calendarEvents.findFirst({
          where: and(
            eq(calendarEvents.userId, ctx.userId!),
            gt(calendarEvents.start_time, new Date()),
            or(
              ilike(calendarEvents.title, `%${contactEmail}%`),
              ilike(calendarEvents.attendees_summary, `%${contactEmail}%`),
            )
          ),
          orderBy: [calendarEvents.start_time],
        }),
        db.query.contactIntelligence.findFirst({
          where: and(
            eq(contactIntelligence.userId, ctx.userId!),
            eq(contactIntelligence.email, contactEmail)
          ),
        }),
        db.query.aiConsentRules.findMany({
          where: eq(aiConsentRules.userId, ctx.userId!),
          columns: { pattern: true, isBlocked: true },
        }),
      ]);

      const privacyBlocked = Boolean(isDomainBlocked(contactEmail, consentRules));
      let summary: string | null = existingIntel?.summary ?? null;
      
      const isStale = !existingIntel || (Date.now() - new Date(existingIntel.updated_at).getTime() > 30 * 24 * 60 * 60 * 1000);
      const hasBlockedEmails = recentEmails.some((e) => e.ai_triage_skipped);

      if (!privacyBlocked && isStale && !hasBlockedEmails && recentEmails.length > 0) {
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
                email: contactEmail,
                summary,
                interaction_count: recentEmails.length,
              });
            }
          } catch (error) {
            console.error("Failed to generate contact summary:", error);
          }
        }
      } else if (privacyBlocked || hasBlockedEmails) {
        summary = null;
      }

      const result = {
        email: contactEmail,
        privacyBlocked,
        summary,
        recentEmails: recentEmails.map(e => ({ id: e.id, subject: e.subject, date: e.created_at })),
        nextEvent: nextEvent ? { title: nextEvent.title, start: nextEvent.start_time } : null,
      };

      await redis.set(cacheKey, JSON.stringify(result), { ex: 3600 }); // 1 hour TTL

      return result;
    }),
});
