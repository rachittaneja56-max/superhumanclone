import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { emails, auditLogs, calendarEvents, autoReplyDrafts, users } from '@/server/db/schema';
import { eq, and, desc, gt, between, inArray, asc, or, ilike, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  sendEmail as corsairSendEmail,
  archiveEmail,
  deleteEmail as corsairDeleteEmail,
  getThreadMessages as corsairGetThread,
  markEmailRead,
  getMessages as corsairGetMessages,
} from '@/server/corsair/client';
import { generateDigest, rewriteDraft } from '@/server/ai/provider';
import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN || '' });
const THREAD_CACHE_TTL = 60;
const INBOX_CACHE_TTL = 30;

import {
  getThreadsSchema,
  getThreadSchema,
  markReadSchema,
  archiveEmailSchema,
  restoreFromArchiveSchema,
  deleteEmailSchema,
  restoreEmailSchema,
  emptyTrashSchema,
  getMorningDigestSchema,
  rewriteDraftSchema,
  sendEmailSchema,
  sendConfirmedSchema,
  cancelSendSchema,
  getAutoRepliesSchema
} from '@/lib/schemas';
import { z } from 'zod';

const bulkActionSchema = z.object({
  emailIds: z.array(z.string()).min(1).max(100),
});

const mailboxSchema = z.object({
  folder: z.enum(['inbox', 'drafts', 'sent', 'spam', 'trash']),
  limit: z.number().int().min(1).max(100).default(50),
  query: z.string().trim().optional().default(''),
});

const draftSchema = z.object({
  id: z.string().optional(),
  to: z.string().trim().default(''),
  subject: z.string().trim().default(''),
  body: z.string().default(''),
  threadId: z.string().optional(),
});
function getHeader(headers: any[] | undefined, name: string): string {
  if (!headers) return '';
  return headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseEmailBody(payload: any): { text: string; html: string } {
  let text = '';
  let html = '';

  function decode(data: string) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  }

  function traverse(part: any) {
    if (!part) return;
    if (part.body?.data) {
      const decoded = decode(part.body.data);
      if (part.mimeType === 'text/plain') {
        text = decoded;
      } else if (part.mimeType === 'text/html') {
        html = decoded;
      }
    }
    if (part.parts) {
      for (const p of part.parts) {
        traverse(p);
      }
    }
  }

  traverse(payload);
  return { text, html };
}

function normalizeSearchPattern(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return '';
  return `%${trimmed.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

async function invalidateMailCaches(ctx: any, threadId?: string | null) {
  const keys = [
    `inbox:${ctx.userId}:active:50`,
    `inbox:${ctx.userId}:archived:50`,
    `mailbox:${ctx.userId}:inbox:50:`,
    `mailbox:${ctx.userId}:drafts:50:`,
    `mailbox:${ctx.userId}:sent:50:`,
    `mailbox:${ctx.userId}:spam:50:`,
    `mailbox:${ctx.userId}:trash:50:`,
  ];
  await Promise.all(keys.map((key) => ctx.redis.del(key).catch(() => null)));
  if (threadId) {
    await ctx.redis.del(`thread:${ctx.userId}:${threadId}`).catch(() => null);
  }
}

export const emailRouter = router({
  getMailboxThreads: protectedProcedure
    .use(createRateLimitMiddleware('getMailboxThreads', 240, 60))
    .input(mailboxSchema)
    .query(async ({ ctx, input }) => {
      const cacheKey = `mailbox:${ctx.userId}:${input.folder}:${input.limit}:${input.query || ''}`;
      const cached = await ctx.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }

      if (input.folder === 'drafts') {
        const draftKeys = await ctx.redis.smembers(`drafts:index:${ctx.userId}`).catch(() => []);
        const drafts = await Promise.all(
          draftKeys.map(async (key) => {
            const raw = await ctx.redis.get<string>(key).catch(() => null);
            return raw ? JSON.parse(raw) : null;
          })
        );
        const filtered = drafts.filter(Boolean).filter((draft: any) => {
          const q = input.query.trim().toLowerCase();
          if (!q) return true;
          return [draft.to, draft.subject, draft.body].join(' ').toLowerCase().includes(q);
        }).sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
        const result = filtered.slice(0, input.limit);
        await ctx.redis.set(cacheKey, JSON.stringify(result), { ex: 20 });
        return result;
      }

      if (input.folder === 'sent') {
        const me = await ctx.db.query.users.findFirst({
          where: eq(users.id, ctx.userId!),
          columns: { email: true, name: true },
        });
        const pattern = normalizeSearchPattern(input.query);
        const rows = await ctx.db.query.emails.findMany({
          where: and(
            eq(emails.userId, ctx.userId!),
            eq(emails.is_deleted, false),
            or(
              eq(emails.is_archived, false),
              eq(emails.is_archived, true)
            ),
            me?.email ? eq(emails.from_address, me.email) : sql`true`,
            pattern
              ? or(
                  ilike(emails.subject, pattern),
                  ilike(emails.to_address, pattern),
                  ilike(emails.snippet, pattern)
                )
              : sql`true`
          ),
          columns: {
            id: true,
            thread_id: true,
            from_name: true,
            from_address: true,
            to_address: true,
            subject: true,
            snippet: true,
            is_read: true,
            created_at: true,
          },
          orderBy: [desc(emails.created_at)],
          limit: input.limit,
        });
        const mapped = rows.map((r) => ({
          ...r,
          mailbox: 'sent',
          fromName: r.from_name || me?.name || r.from_address,
          fromAddress: r.from_address,
        }));
        await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: 20 });
        return mapped;
      }

      const isSpam = input.folder === 'spam';
      const rows = await ctx.db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          input.folder === 'trash' ? eq(emails.is_deleted, true) : eq(emails.is_deleted, false),
          input.folder === 'inbox' ? eq(emails.is_archived, false) : sql`true`,
          isSpam
            ? or(
                eq(emails.tag, 'newsletter'),
                eq(emails.tag, 'social')
              )
            : sql`true`,
          input.query.trim()
            ? or(
                ilike(emails.subject, normalizeSearchPattern(input.query)),
                ilike(emails.from_address, normalizeSearchPattern(input.query)),
                ilike(emails.snippet, normalizeSearchPattern(input.query))
              )
            : sql`true`
        ),
        columns: {
          id: true,
          thread_id: true,
          from_name: true,
          from_address: true,
          subject: true,
          snippet: true,
          is_read: true,
          tldr: true,
          ai_triage_skipped: true,
          created_at: true,
          is_archived: true,
          is_deleted: true,
        },
        orderBy: [desc(emails.created_at)],
        limit: input.limit,
      });

      const mapped = rows.map((r) => ({
        ...r,
        mailbox: input.folder,
        threadId: r.thread_id || r.id,
        fromAddress: r.from_address,
        fromName: r.from_name,
        receivedAt: r.created_at,
      }));

      await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: 20 });
      return mapped;
    }),

  getThreads: protectedProcedure
    .use(createRateLimitMiddleware('getThreads', 200, 60))
    .input(getThreadsSchema)
    .query(async ({ ctx, input }) => {
      const cacheKey = `inbox:${ctx.userId}:${input.isArchived ? 'archived' : 'active'}:${input.limit}`
      const cached = await ctx.redis.get<string>(cacheKey)
      if (cached) {
        try {
          return JSON.parse(cached)
        } catch {}
      }

      let results = await ctx.db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_archived, input.isArchived),
          eq(emails.is_deleted, false)
        ),
        columns: {
          id: true,
          thread_id: true,
          from_name: true,
          from_address: true,
          subject: true,
          snippet: true,
          is_read: true,
          tldr: true,
          ai_triage_skipped: true,
          created_at: true,
        },
        orderBy: [desc(emails.created_at)],
        limit: input.limit
      });

      // If local DB is empty (e.g. first load before webhooks), pull from Corsair
      if (results.length === 0) {
        try {
          const corsairResult = await corsairGetMessages(ctx.userId!, { limit: input.limit });
          if (corsairResult.success && Array.isArray(corsairResult.data) && corsairResult.data.length > 0) {
            // Seed local DB with the fetched messages
            for (const msg of corsairResult.data) {
              const msgId = msg.id;
              if (!msgId) continue;

              const headers = msg.payload?.headers || [];
              const fromVal = getHeader(headers, 'From');
              const toVal = getHeader(headers, 'To');
              const subjectVal = getHeader(headers, 'Subject') || '(no subject)';
              const { text: bodyText, html: bodyHtml } = parseEmailBody(msg.payload);

              // Extract sender name and address
              let fromName: string | null = null;
              let fromAddress = '';
              const match = fromVal.match(/^(.*?)\s*<([^>]+)>/);
              if (match) {
                fromName = match[1].replace(/['"]/g, '').trim();
                fromAddress = match[2].trim();
              } else {
                fromAddress = fromVal.trim();
              }

              await ctx.db.insert(emails).values({
                userId: ctx.userId!,
                corsair_message_id: msgId,
                thread_id: msg.threadId || msgId,
                from_address: fromAddress,
                from_name: fromName,
                to_address: toVal,
                subject: subjectVal,
                snippet: msg.snippet ?? null,
                body_text: bodyText || null,
                body_html: bodyHtml || null,
                is_read: !msg.labelIds?.includes('UNREAD'),
                is_archived: false,
                is_deleted: false,
                ai_triage_skipped: true,
                created_at: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
              }).onConflictDoNothing();
            }
            // Re-fetch after seed
            results = await ctx.db.query.emails.findMany({
              where: and(
                eq(emails.userId, ctx.userId!),
                eq(emails.is_archived, input.isArchived),
                eq(emails.is_deleted, false)
              ),
              columns: {
                id: true,
                thread_id: true,
                from_name: true,
                from_address: true,
                subject: true,
                snippet: true,
                is_read: true,
                tldr: true,
                ai_triage_skipped: true,
                created_at: true,
              },
              orderBy: [desc(emails.created_at)],
              limit: input.limit
            });
          }
        } catch (err) {
          // Corsair fetch failed (not connected) — return empty gracefully
          console.warn('[getThreads] Corsair fallback failed:', err);
          return [];
        }
      }

      const mapped = results.map(r => ({
        id: r.id,
        threadId: r.thread_id || r.id,
        fromAddress: r.from_address,
        fromName: r.from_name,
        subject: r.subject,
        snippet: r.snippet,
        isRead: r.is_read,
        aiTriageSkipped: r.ai_triage_skipped,
        tldr: r.tldr,
        receivedAt: r.created_at,
      }))

      await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: INBOX_CACHE_TTL })
      return mapped;
    }),

  getThread: protectedProcedure
    .input(getThreadSchema)
    .query(async ({ ctx, input }) => {
      const cacheKey = `thread:${ctx.userId}:${input.threadId}`
      const cached = await ctx.redis.get<string>(cacheKey)
      if (cached) {
        try {
          return JSON.parse(cached)
        } catch {}
      }

      let threadEmails = await ctx.db.query.emails.findMany({
        where: and(
          eq(emails.thread_id, input.threadId),
          eq(emails.userId, ctx.userId!)
        ),
        orderBy: [asc(emails.created_at)]
      });

      if (threadEmails.length === 0) {
        const result = await corsairGetThread(ctx.userId!, input.threadId);
        if (result.needsConnect) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
        }

        const messages = Array.isArray(result.data?.messages) ? result.data.messages : []
        for (const msg of messages) {
          if (!msg?.id) continue;

          const headers = msg.payload?.headers || [];
          const fromVal = getHeader(headers, 'From');
          const toVal = getHeader(headers, 'To');
          const subjectVal = getHeader(headers, 'Subject') || '(no subject)';
          const { text: bodyText, html: bodyHtml } = parseEmailBody(msg.payload);

          let fromName: string | null = null;
          let fromAddress = '';
          const match = fromVal.match(/^(.*?)\s*<([^>]+)>/);
          if (match) {
            fromName = match[1].replace(/['"]/g, '').trim();
            fromAddress = match[2].trim();
          } else {
            fromAddress = fromVal.trim();
          }

          await ctx.db.insert(emails).values({
            userId: ctx.userId!,
            corsair_message_id: msg.id,
            thread_id: msg.threadId || input.threadId,
            from_address: fromAddress || 'unknown@unknown.com',
            from_name: fromName,
            to_address: toVal || '',
            subject: subjectVal,
            snippet: msg.snippet ?? null,
            body_text: bodyText || null,
            body_html: bodyHtml || null,
            is_read: !msg.labelIds?.includes('UNREAD'),
            is_archived: false,
            is_deleted: false,
            ai_triage_skipped: true,
            created_at: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
          }).onConflictDoNothing();
        }

        threadEmails = await ctx.db.query.emails.findMany({
          where: and(
            eq(emails.thread_id, input.threadId),
            eq(emails.userId, ctx.userId!)
          ),
          orderBy: [asc(emails.created_at)]
        });
      }

      let hydrated = false;
      for (const email of threadEmails) {
        if (!email.body_text) {
          const result = await corsairGetThread(ctx.userId!, input.threadId);
          if (result.needsConnect) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
          }
          if (result.data && Array.isArray(result.data.messages)) {
            for (const msg of result.data.messages) {
              const { text: bodyText, html: bodyHtml } = parseEmailBody(msg.payload);
              await ctx.db.update(emails)
                .set({ body_text: bodyText || null, body_html: bodyHtml || null })
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

      await ctx.redis.set(cacheKey, JSON.stringify(threadEmails), { ex: THREAD_CACHE_TTL })
      return threadEmails;
    }),

  markRead: protectedProcedure
    .input(markReadSchema)
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

      await ctx.redis.del(`inbox:${ctx.userId}:active:50`)
      for (const emailId of input.emailIds) {
        const thread = await ctx.db.query.emails.findFirst({
          where: and(eq(emails.id, emailId), eq(emails.userId, ctx.userId!)),
          columns: { thread_id: true },
        })
        if (thread?.thread_id) {
          await ctx.redis.del(`thread:${ctx.userId}:${thread.thread_id}`)
        }
      }

      return { success: true };
    }),

  bulkMarkRead: protectedProcedure
    .input(bulkActionSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(emails)
        .set({ is_read: true })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));

      const toUpdate = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { corsair_message_id: true, thread_id: true }
      });

      await Promise.all(toUpdate.map((email) => markEmailRead(ctx.userId!, email.corsair_message_id).catch(console.error)));
      await ctx.redis.del(`inbox:${ctx.userId}:active:50`)
      await Promise.all(toUpdate.map((email) => email.thread_id ? ctx.redis.del(`thread:${ctx.userId}:${email.thread_id}`) : Promise.resolve()))

      return { success: true, count: toUpdate.length };
    }),

  bulkArchive: protectedProcedure
    .input(bulkActionSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { corsair_message_id: true, thread_id: true }
      });

      await Promise.all(rows.map((email) => archiveEmail(ctx.userId!, email.corsair_message_id).catch(console.error)));
      await ctx.db.update(emails)
        .set({ is_archived: true })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));
      await ctx.redis.del(`inbox:${ctx.userId}:active:50`)
      await Promise.all(rows.map((email) => email.thread_id ? ctx.redis.del(`thread:${ctx.userId}:${email.thread_id}`) : Promise.resolve()))

      return { success: true, count: rows.length };
    }),

  bulkDelete: protectedProcedure
    .input(bulkActionSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { id: true, corsair_message_id: true, thread_id: true }
      });

      await Promise.all(rows.map(async (email) => {
        await ctx.db.update(emails)
          .set({ is_deleted: true, deleted_at: new Date() })
          .where(eq(emails.id, email.id));
        await corsairDeleteEmail(ctx.userId!, email.corsair_message_id).catch(console.error);
      }));

      await ctx.redis.del(`inbox:${ctx.userId}:active:50`)
      await Promise.all(rows.map((email) => email.thread_id ? ctx.redis.del(`thread:${ctx.userId}:${email.thread_id}`) : Promise.resolve()))
      return { success: true, count: rows.length };
    }),

  archiveEmail: protectedProcedure
    .use(createRateLimitMiddleware('archiveEmail', 100, 60))
    .input(archiveEmailSchema)
    .mutation(async ({ ctx, input }) => {
      // Archive in Corsair/Gmail
      const archiveResult = await archiveEmail(ctx.userId!, input.emailId)
      if (archiveResult.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      // Also update local DB if it exists (for cache/UI purposes)
      const localResult = await ctx.db.update(emails)
        .set({ is_archived: true })
        .where(and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      await ctx.redis.del(`inbox:${ctx.userId}:active:50`)
      const thread = await ctx.db.query.emails.findFirst({
        where: and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)),
        columns: { thread_id: true },
      })
      if (thread?.thread_id) await ctx.redis.del(`thread:${ctx.userId}:${thread.thread_id}`)

      // Fire and forget audit log
      ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'email_archived',
        details: { emailId: input.emailId }
      }).catch(console.error);

      return { success: true, id: localResult[0]?.id || input.emailId };
    }),

  restoreFromArchive: protectedProcedure
    .input(restoreFromArchiveSchema)
    .mutation(async ({ ctx, input }) => {
      // NOTE: Our client currently doesn't implement unarchive via Corsair,
      // but to match previous local behavior:
      const localResult = await ctx.db.update(emails)
        .set({ is_archived: false })
        .where(and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      await ctx.redis.del(`inbox:${ctx.userId}:archived:50`)
      const thread = await ctx.db.query.emails.findFirst({
        where: and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)),
        columns: { thread_id: true },
      })
      if (thread?.thread_id) await ctx.redis.del(`thread:${ctx.userId}:${thread.thread_id}`)

      return { success: true, id: localResult[0]?.id || input.emailId };
    }),

  deleteEmail: protectedProcedure
    .input(deleteEmailSchema)
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

      await ctx.redis.del(`inbox:${ctx.userId}:active:50`)

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
    .input(restoreEmailSchema)
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

      await ctx.redis.del(`inbox:${ctx.userId}:active:50`)

      return { success: true };
    }),

  emptyTrash: protectedProcedure
    .input(emptyTrashSchema)
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
    .input(getMorningDigestSchema)
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
    .input(rewriteDraftSchema)
    .mutation(async ({ input }) => {
      const rewritten = await rewriteDraft(input.draft, input.instruction, input.translateTo);
      return { rewritten };
    }),

  sendEmail: protectedProcedure
    .use(createRateLimitMiddleware('sendEmail', 20, 3600))
    .input(sendEmailSchema)
    .mutation(async ({ ctx, input }) => {
      const undoToken = crypto.randomUUID();
      await ctx.redis.set(`undo:send:${ctx.userId}:${undoToken}`, JSON.stringify(input), { ex: 10 });
      return { undoToken, expiresAt: Date.now() + 10000 };
    }),

  sendConfirmed: protectedProcedure
    .use(createRateLimitMiddleware('sendConfirmed', 20, 3600))
    .input(sendConfirmedSchema)
    .mutation(async ({ ctx, input }) => {
      const redisKey = `undo:send:${ctx.userId}:${input.undoToken}`;
      const payloadStr = await ctx.redis.get<string>(redisKey);
      
      if (!payloadStr) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Send window expired or invalid token' });
      }

      const payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;

      const me = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId!),
        columns: { email: true, name: true },
      });

      const sendResult = await corsairSendEmail(ctx.userId!, {
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        threadId: payload.threadId,
      });

      if (sendResult.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      await ctx.redis.del(redisKey);
      await invalidateMailCaches(ctx, payload.threadId);

      const sentMessageId = sendResult?.data?.id || sendResult?.data?.messageId || crypto.randomUUID();
      await ctx.db.insert(emails).values({
        userId: ctx.userId!,
        corsair_message_id: sentMessageId,
        thread_id: payload.threadId || sentMessageId,
        from_address: me?.email || 'me@aethra.local',
        from_name: me?.name || 'Me',
        to_address: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
        subject: payload.subject,
        snippet: payload.body.slice(0, 180),
        body_text: payload.body,
        body_html: `<pre style="white-space:pre-wrap;font-family:inherit">${payload.body.replace(/[&<>]/g, (ch: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] || ch))}</pre>`,
        is_read: true,
        is_archived: false,
        is_deleted: false,
        ai_triage_skipped: true,
      }).onConflictDoNothing();

      ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'email_sent',
        details: { to: payload.to, subject: payload.subject }
      }).catch(console.error);

      return { success: true };
    }),

  saveDraft: protectedProcedure
    .use(createRateLimitMiddleware('saveDraft', 120, 60))
    .input(draftSchema)
    .mutation(async ({ ctx, input }) => {
      const id = input.id || crypto.randomUUID();
      const draft = {
        id,
        to: input.to,
        subject: input.subject,
        body: input.body,
        threadId: input.threadId || null,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      const key = `draft:${ctx.userId}:${id}`;
      await ctx.redis.set(key, JSON.stringify(draft), { ex: 60 * 60 * 24 * 14 });
      await ctx.redis.sadd(`drafts:index:${ctx.userId}`, key);
      await ctx.redis.expire(`drafts:index:${ctx.userId}`, 60 * 60 * 24 * 14);
      await ctx.redis.del(`mailbox:${ctx.userId}:drafts:50`).catch(() => null);
      return draft;
    }),

  deleteDraft: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = `draft:${ctx.userId}:${input.id}`;
      await ctx.redis.del(key);
      await ctx.redis.srem(`drafts:index:${ctx.userId}`, key);
      await ctx.redis.del(`mailbox:${ctx.userId}:drafts:50`).catch(() => null);
      return { success: true };
    }),

  cancelSend: protectedProcedure
    .input(cancelSendSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.redis.del(`undo:send:${ctx.userId}:${input.undoToken}`);
      return { cancelled: true };
    }),

  getAutoReplies: protectedProcedure
    .input(getAutoRepliesSchema)
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
