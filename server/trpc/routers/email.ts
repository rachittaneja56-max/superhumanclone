import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { z } from 'zod';
import { emails, auditLogs, calendarEvents, autoReplyDrafts } from '@/server/db/schema';
import { eq, and, desc, gt, between, inArray, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  sendEmail as corsairSendEmail,
  archiveEmail,
  deleteEmail as corsairDeleteEmail,
  syncGmailInbox,
  getThread as corsairGetThread,
  markEmailRead,
} from '@/server/corsair/client';
import { generateDigest, rewriteDraft } from '@/server/ai/provider';
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
      const results = await ctx.db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_archived, input.isArchived),
          eq(emails.is_deleted, false)
        ),
        orderBy: [desc(emails.created_at)],
        limit: input.limit
      });

      if (results.length === 0) {
        const syncResult = await syncGmailInbox(ctx.userId!);
        if (syncResult.needsConnect) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Gmail not connected' });
        }
        
        return await ctx.db.query.emails.findMany({
          where: and(
            eq(emails.userId, ctx.userId!),
            eq(emails.is_archived, input.isArchived),
            eq(emails.is_deleted, false)
          ),
          orderBy: [desc(emails.created_at)],
          limit: input.limit
        });
      }

      return results;
    }),

  getThread: protectedProcedure
    .input(z.object({
      threadId: z.string().min(1).max(200)
    }))
    .query(async ({ ctx, input }) => {
      const threadEmails = await ctx.db.query.emails.findMany({
        where: and(
          eq(emails.thread_id, input.threadId),
          eq(emails.userId, ctx.userId!)
        ),
        orderBy: [asc(emails.created_at)]
      });

      let hydrated = false;
      for (const email of threadEmails) {
        if (!email.body_text) {
          const result = await corsairGetThread(ctx.userId!, input.threadId);
          if (result.data && Array.isArray(result.data)) {
            for (const msg of result.data) {
              await ctx.db.update(emails)
                .set({ body_text: msg.bodyText || msg.body_text, body_html: msg.bodyHtml || msg.body_html })
                .where(and(eq(emails.corsair_message_id, msg.id), eq(emails.userId, ctx.userId!)));
            }
          }
          hydrated = true;
          break;
        }
      }

      if (hydrated) {
        return ctx.db.query.emails.findMany({
          where: and(
            eq(emails.thread_id, input.threadId),
            eq(emails.userId, ctx.userId!)
          ),
          orderBy: [asc(emails.created_at)]
        });
      }

      return threadEmails;
    }),

  markRead: protectedProcedure
    .input(z.object({
      emailIds: z.array(z.string().uuid()).max(50)
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(emails)
        .set({ is_read: true })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));

      const toUpdate = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { corsair_message_id: true }
      });
      
      toUpdate.forEach(e => {
        markEmailRead(ctx.userId!, e.corsair_message_id).catch(console.error);
      });

      return { success: true };
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
    }),

  rewriteDraft: protectedProcedure
    .use(createRateLimitMiddleware('rewriteDraft', 20, 60))
    .input(z.object({
      draft: z.string().min(1).max(5000),
      instruction: z.enum(['improve_tone','make_shorter','make_formal','convert_to_bullets','translate']),
      translateTo: z.string().max(50).optional(),
    }))
    .mutation(async ({ input }) => {
      const rewritten = await rewriteDraft(input.draft, input.instruction, input.translateTo);
      return { rewritten };
    }),

  sendEmail: protectedProcedure
    .use(createRateLimitMiddleware('sendEmail', 20, 3600))
    .input(z.object({
      to: z.array(z.string().email()),
      cc: z.array(z.string().email()).optional(),
      subject: z.string().min(1),
      body: z.string(),
      threadId: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const undoToken = crypto.randomUUID();
      await ctx.redis.set(`undo:send:${ctx.userId}:${undoToken}`, JSON.stringify(input), { ex: 10 });
      return { undoToken, expiresAt: Date.now() + 10000 };
    }),

  sendConfirmed: protectedProcedure
    .use(createRateLimitMiddleware('sendConfirmed', 20, 3600))
    .input(z.object({
      undoToken: z.string().uuid()
    }))
    .mutation(async ({ ctx, input }) => {
      const redisKey = `undo:send:${ctx.userId}:${input.undoToken}`;
      const payloadStr = await ctx.redis.get<string>(redisKey);
      
      if (!payloadStr) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Send window expired or invalid token' });
      }

      const payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;

      await corsairSendEmail(ctx.userId!, {
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        threadId: payload.threadId,
      });

      await ctx.redis.del(redisKey);

      ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'email_sent',
        details: { to: payload.to, subject: payload.subject }
      }).catch(console.error);

      return { success: true };
    }),

  cancelSend: protectedProcedure
    .input(z.object({
      undoToken: z.string().uuid()
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.redis.del(`undo:send:${ctx.userId}:${input.undoToken}`);
      return { cancelled: true };
    }),

  getAutoReplies: protectedProcedure
    .input(z.object({
      emailId: z.string().uuid()
    }))
    .query(async ({ ctx, input }) => {
      // JOIN to verify ownership
      const drafts = await ctx.db
        .select({
          id: autoReplyDrafts.id,
          reply_text: autoReplyDrafts.reply_text,
          status: autoReplyDrafts.status,
          created_at: autoReplyDrafts.created_at,
        })
        .from(autoReplyDrafts)
        .innerJoin(emails, eq(autoReplyDrafts.emailId, emails.id))
        .where(
          and(
            eq(autoReplyDrafts.emailId, input.emailId),
            eq(emails.userId, ctx.userId!)
          )
        );
      return drafts;
    })
});
