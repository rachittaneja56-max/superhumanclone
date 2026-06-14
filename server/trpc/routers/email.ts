import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { z } from 'zod';
import { emails, auditLogs, calendarEvents } from '@/server/db/schema';
import { eq, and, desc, gt, between } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  getEmails,
  sendEmail,
  archiveEmail,
  deleteEmail as corsairDeleteEmail,
} from '@/server/corsair/client';
import { generateDigest } from '@/server/ai/provider';
import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN || '' });

export const emailRouter = router({
  getThreads: protectedProcedure
    .use(createRateLimitMiddleware('getThreads', 200, 60))
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      isArchived: z.boolean().default(false),
      tag: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await getEmails(ctx.userId!, { limit: input.limit })
      if (result.needsConnect) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Gmail not connected',
        })
      }
      return (result.data as any[]) || [];
    }),

  archiveEmail: protectedProcedure
    .use(createRateLimitMiddleware('archiveEmail', 100, 60))
    .input(z.object({
      emailId: z.string(), // Using Corsair's message ID now
    }))
    .mutation(async ({ ctx, input }) => {
      // Archive in Corsair/Gmail
      await archiveEmail(ctx.userId!, input.emailId)

      // Also update local DB if it exists (for cache/UI purposes)
      const localResult = await ctx.db.update(emails)
        .set({ is_archived: true })
        .where(and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      // Fire and forget audit log
      ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'email_archived',
        details: { emailId: input.emailId }
      }).catch(console.error);

      return { success: true, id: localResult[0]?.id || input.emailId };
    }),

  restoreFromArchive: protectedProcedure
    .input(z.object({
      emailId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // NOTE: Our client currently doesn't implement unarchive via Corsair,
      // but to match previous local behavior:
      const localResult = await ctx.db.update(emails)
        .set({ is_archived: false })
        .where(and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      return { success: true, id: localResult[0]?.id || input.emailId };
    }),

  deleteEmail: protectedProcedure
    .input(z.object({
      emailId: z.string(), // Corsair message id
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch row to verify ownership
      const email = await ctx.db.query.emails.findFirst({
        where: and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!))
      });
      if (!email) throw new TRPCError({ code: 'NOT_FOUND' });

      // 2. Soft delete
      await ctx.db.update(emails)
        .set({ is_deleted: true, deleted_at: new Date() })
        .where(eq(emails.id, email.id));

      // 3. Redis buffer
      await ctx.redis.set(`deleted:${ctx.userId}:${input.emailId}`, 'true', { ex: 600 });

      // 4. QStash purge job
      const { messageId } = await qstash.publishJSON({
        url: `${process.env.RAILWAY_WORKER_URL || ''}/workers/purge`,
        body: { userId: ctx.userId, emailId: input.emailId, dbId: email.id },
        headers: { 'X-Worker-Secret': process.env.WORKER_SECRET || '' },
        delay: '10m',
        retries: 3,
      });

      // 5. Store job ID
      await ctx.redis.set(`deletejob:${ctx.userId}:${input.emailId}`, messageId, { ex: 660 });

      return { success: true };
    }),

  restoreEmail: protectedProcedure
    .input(z.object({
      emailId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Redis get
      const jobId = await ctx.redis.get<string>(`deletejob:${ctx.userId}:${input.emailId}`);
      
      // 2. Cancel QStash job
      if (jobId) {
        try {
          await qstash.messages.delete(jobId);
        } catch(e) {
          console.error('Failed to cancel QStash message', e);
        }
        await ctx.redis.del(`deletejob:${ctx.userId}:${input.emailId}`);
        await ctx.redis.del(`deleted:${ctx.userId}:${input.emailId}`);
      }

      // 3. Restore
      await ctx.db.update(emails)
        .set({ is_deleted: false, deleted_at: null })
        .where(and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)));

      return { success: true };
    }),

  emptyTrash: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Find all is_deleted=true
      const trashed = await ctx.db.query.emails.findMany({
        where: and(eq(emails.userId, ctx.userId!), eq(emails.is_deleted, true)),
        columns: { id: true, corsair_message_id: true }
      });

      for (const t of trashed) {
        await corsairDeleteEmail(ctx.userId!, t.corsair_message_id);
      }

      await ctx.db.update(emails)
        .set({ body_text: null })
        .where(and(eq(emails.userId, ctx.userId!), eq(emails.is_deleted, true)));

      return { success: true, count: trashed.length };
    }),

  getMorningDigest: protectedProcedure
    .use(createRateLimitMiddleware('getMorningDigest', 10, 3600))
    .input(z.object({}))
    .query(async ({ ctx }) => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const cacheKey = `digest:${ctx.userId}:${dateStr}`;

      // 1. Redis cache check
      const cached = await ctx.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as { digest: string; emailCount: number; eventCount: number };
        } catch (err) {
          // Fall through on JSON parse error
        }
      }

      // 2. Parallel fetch
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const [unreads, events] = await Promise.all([
        ctx.db.select({
          from_name: emails.from_name,
          from_address: emails.from_address,
          subject: emails.subject,
          snippet: emails.snippet,
          priority: emails.priority,
        })
        .from(emails)
        .where(
          and(
            eq(emails.userId, ctx.userId!),
            eq(emails.is_read, false),
            eq(emails.ai_triage_skipped, false),
            gt(emails.created_at, dayAgo)
          )
        )
        .orderBy(desc(emails.priority))
        .limit(20),

        ctx.db.select({
          title: calendarEvents.title,
          start_time: calendarEvents.start_time,
          end_time: calendarEvents.end_time,
          location: calendarEvents.location,
          is_all_day: calendarEvents.is_all_day,
        })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, ctx.userId!),
            between(calendarEvents.start_time, startOfDay, endOfDay)
          )
        )
      ]);

      // 3. Build prompt data
      const formattedEmails = unreads.map(e => ({
        from: e.from_name ? `${e.from_name} <${e.from_address}>` : e.from_address,
        subject: e.subject ?? '(No Subject)',
        snippet: e.snippet ?? '',
        priority: e.priority,
      }));

      const formattedEvents = events.map(ev => ({
        title: ev.title,
        startTime: ev.start_time,
        endTime: ev.end_time,
        location: ev.location,
      }));

      const digest = await generateDigest(formattedEmails, formattedEvents);

      const result = {
        digest,
        emailCount: unreads.length,
        eventCount: events.length,
      };

      // 4. Redis cache set
      await ctx.redis.set(cacheKey, JSON.stringify(result), { ex: 3600 });

      return result;
    })
});
