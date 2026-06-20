import { router, protectedProcedure, createRateLimitMiddleware, protectedQueryProcedure } from '../trpc';
import { emails, auditLogs, calendarEvents, autoReplyDrafts, aiConsentRules, users } from '@/server/db/schema';
import { eq, and, desc, gt, between, inArray, asc, or, ilike, sql, lt } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import pino from 'pino';
import {
  archiveEmail,
  restoreArchivedEmail,
  deleteEmail as corsairDeleteEmail,
  permanentlyDeleteEmail,
  restoreEmailFromTrash,
  getThreadMessages as corsairGetThread,
  getDraftMessages as corsairGetDraftMessages,
  markEmailRead,
  markEmailUnread,
  getMessages as corsairGetMessages,
} from '@/server/corsair/client';
import { mapGmailMessageToEmailRow } from '@/server/corsair/email-mapper';
import { generateAutoReplies, generateDigest, generateTLDR, rewriteDraft } from '@/server/ai/provider';
import { Client } from '@upstash/qstash';
import { mapEmailForListClient, mapEmailForThreadClient, redactSensitiveForClient } from '@/lib/email-client';
import {
  cacheTtls,
  invalidateMailCache,
  mailVersionKey,
  mailboxCacheKey,
  threadCacheKey,
  unreadCountsCacheKey,
} from '@/server/cache';
import { processSendJob } from '@/server/workers/send-worker';
import { getSafeUserSettings } from '@/server/db/user-settings-compat';
import { isDomainBlocked } from '@/lib/domain-matcher';

const qstash = new Client({ token: process.env.QSTASH_TOKEN || '' });
const logger = pino();

import {
  getThreadsSchema,
  getMailboxThreadsSchema,
  getUnreadCountsSchema,
  getThreadSchema,
  markReadSchema,
  markUnreadSchema,
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

const draftSchema = z.object({
  id: z.string().optional(),
  to: z.string().trim().default(''),
  cc: z.string().trim().default(''),
  bcc: z.string().trim().default(''),
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

function isOutboundSentMessage(row: {
  from_address?: string | null;
  to_address?: string | null;
}, meEmail?: string | null) {
  if (!meEmail) return false;
  if ((row.from_address ?? "").toLowerCase() !== meEmail.toLowerCase()) return false;
  return Boolean((row.to_address ?? "").trim());
}

async function invalidateMailCaches(ctx: any, threadId?: string | null) {
  await invalidateMailCache(ctx.redis, ctx.userId);
  if (threadId) {
    await ctx.redis.del(`thread:${ctx.userId}:${threadId}`).catch(() => null);
  }
}

function encodePageToken(row?: { createdAt?: string | Date | null; id?: string | null }) {
  if (!row?.createdAt || !row.id) return null;
  const payload = JSON.stringify({
    createdAt: new Date(row.createdAt).toISOString(),
    id: row.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodePageToken(token?: string | null): { createdAt: string; id: string } | null {
  if (!token) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as { createdAt?: string; id?: string };
    if (!parsed.createdAt || !parsed.id) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

async function seedMailboxFromCorsair(
  ctx: any,
  seedParams: { limit: number; maxPages?: number } = { limit: 50, maxPages: 20 },
) {
  const pageSize = Math.max(10, seedParams.limit);
  const maxPages = Math.max(1, seedParams.maxPages ?? 20);
  let pageToken: string | undefined;
  let inserted = 0;
  const consentRules = await ctx.db.query.aiConsentRules.findMany({
    where: eq(aiConsentRules.userId, ctx.userId!),
    columns: { pattern: true, isBlocked: true },
  });

  for (let _page = 0; _page < maxPages; _page += 1) {
    const corsairResult = await corsairGetMessages(ctx.userId!, {
      limit: pageSize,
      ...(pageToken ? { pageToken } : {}),
    });

    if (corsairResult.needsConnect) {
      return { inserted, needsConnect: true };
    }

    if (!corsairResult.success || !Array.isArray(corsairResult.data) || corsairResult.data.length === 0) {
      break;
    }

    for (const msg of corsairResult.data) {
      if (!msg.id) continue;
      const row = mapGmailMessageToEmailRow(ctx.userId!, msg);
      const aiTriageSkipped = row.from_address ? isDomainBlocked(row.from_address, consentRules) : false;

      await ctx.db.insert(emails).values({
        ...row,
        ai_triage_skipped: aiTriageSkipped,
      }).onConflictDoNothing();
      inserted += 1;
    }

    pageToken = corsairResult.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return { inserted, needsConnect: false };
}

async function queueSendJob(ctx: any, undoToken: string) {
  if (!process.env.QSTASH_TOKEN) return null;

  const baseUrl = process.env.RAILWAY_WORKER_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) return null;

  const { messageId } = await qstash.publishJSON({
    url: `${baseUrl}/workers/send`,
    body: {
      userId: ctx.userId,
      undoToken,
    },
    headers: { 'X-Worker-Secret': process.env.WORKER_SECRET || '' },
    delay: '10s',
    retries: 3,
  });

  await ctx.redis.set(`sendjob:${ctx.userId}:${undoToken}`, messageId, { ex: 600 });
  return messageId;
}

async function publishMailboxEvent(
  userId: string,
  eventName: string,
  data: { mailbox?: 'inbox' | 'drafts' | 'sent' | 'spam' | 'trash'; threadId?: string | null; delta?: number } = {}
) {
  const ablyKey = process.env.ABLY_API_KEY
  if (!ablyKey) return

  await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(ablyKey).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: eventName,
      data: {
        mailbox: data.mailbox ?? 'inbox',
        threadId: data.threadId ?? null,
        delta: data.delta ?? 0,
      },
    }),
  }).catch(() => null)
}

async function resolveEmailActionTarget(
  ctx: any,
  identifier: string
): Promise<{ id: string; corsair_message_id: string; thread_id: string | null } | null> {
  const row = await ctx.db.query.emails.findFirst({
    where: and(
      eq(emails.userId, ctx.userId!),
      or(
        eq(emails.corsair_message_id, identifier),
        eq(emails.id, identifier),
        eq(emails.thread_id, identifier)
      )
    ),
    columns: {
      id: true,
      corsair_message_id: true,
      thread_id: true,
    },
    orderBy: [asc(emails.created_at)],
  })
  return row ?? null
}

export const emailRouter = router({
  syncMailbox: protectedProcedure
    .mutation(async ({ ctx }) => {
      const result = await seedMailboxFromCorsair(ctx, { limit: 50, maxPages: 2 });
      if (result.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }
      await invalidateMailCaches(ctx);
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {});
      return { success: true, inserted: result.inserted };
    }),

  getMailboxThreads: protectedQueryProcedure
    .use(createRateLimitMiddleware('getMailboxThreads', 240, 60))
    .input(getMailboxThreadsSchema)
    .query(async ({ ctx, input }) => {
      const version = Number((await ctx.redis.get<string>(mailVersionKey(ctx.userId!))) ?? '0');
      const cacheKey = mailboxCacheKey(ctx.userId!, input.folder, version, input.limit, input.offset, input.query || '', input.pageToken || '');
      const cached = await ctx.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }

      const cursor = decodePageToken(input.pageToken);
      const me = input.folder === 'inbox' || input.folder === 'sent'
        ? await ctx.db.query.users.findFirst({
            where: eq(users.id, ctx.userId!),
            columns: { email: true, name: true },
          })
        : null;
      const isNotSentByMe = me?.email ? sql`${emails.from_address} <> ${me.email}` : sql`true`;

      if (input.folder === 'drafts') {
        const draftResult = await corsairGetDraftMessages(ctx.userId!, {
          limit: input.limit + 1,
          pageToken: input.pageToken || undefined,
        });
        if (draftResult.needsConnect) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
        }
        const draftRows = Array.isArray(draftResult.data) ? draftResult.data : [];
        const mappedDrafts = draftRows
          .map((draft: any) => {
            const headers = draft.payload?.headers || [];
            const subject = getHeader(headers, 'Subject') || '(no subject)';
            const { text: bodyText } = parseEmailBody(draft.payload);

            return mapEmailForListClient({
              id: draft.id,
              thread_id: draft.threadId || draft.id,
              from_name: 'Draft',
              from_address: '',
              subject,
              snippet: redactSensitiveForClient(bodyText || draft.snippet || 'Draft in progress.'),
              is_read: true,
              created_at: draft.internalDate ? new Date(Number(draft.internalDate)) : new Date(),
              mailbox: 'drafts',
            });
          })
          .filter(Boolean);
        const items = mappedDrafts.slice(0, input.limit);
        const nextPageToken = mappedDrafts.length > input.limit ? draftResult.nextPageToken ?? null : null;
        const result = { items, nextPageToken };
        await ctx.redis.set(cacheKey, JSON.stringify(result), { ex: cacheTtls.mailbox });
        return result;
      }

      if (input.folder === 'sent') {
        const pattern = normalizeSearchPattern(input.query);
        let rows = await ctx.db.query.emails.findMany({
          where: and(
            eq(emails.userId, ctx.userId!),
            eq(emails.is_deleted, false),
            me?.email ? sql`${emails.from_address} = ${me.email} and ${emails.to_address} <> ''` : sql`false`,
            cursor
              ? or(
                  lt(emails.created_at, new Date(cursor.createdAt)),
                  and(eq(emails.created_at, new Date(cursor.createdAt)), lt(emails.id, cursor.id))
                )
              : sql`true`,
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
          limit: input.limit + 1,
          offset: cursor ? 0 : input.offset,
        });
        if (!cursor && input.offset === 0 && !input.query.trim() && rows.length === 0) {
          try {
            const seedResult = await seedMailboxFromCorsair(ctx, { limit: input.limit, maxPages: 1 });
            if (seedResult.needsConnect) {
              throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
            }
            rows = await ctx.db.query.emails.findMany({
              where: and(
                eq(emails.userId, ctx.userId!),
                eq(emails.is_deleted, false),
                me?.email ? sql`${emails.from_address} = ${me.email} and ${emails.to_address} <> ''` : sql`false`,
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
              limit: input.limit + 1,
              offset: cursor ? 0 : input.offset,
            });
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.warn('[getMailboxThreads] Sent fallback failed:', err);
          }
        }
        const mapped = rows
          .filter((r) => isOutboundSentMessage(r, me?.email))
          .map((r) =>
          mapEmailForListClient({
            ...r,
            from_name: me?.name || r.from_name || 'Me',
            from_address: r.from_address,
            mailbox: 'sent',
          })
        );
        const items = mapped.slice(0, input.limit);
        const nextPageToken = mapped.length > input.limit ? encodePageToken(items[items.length - 1]) : null;
        const result = { items, nextPageToken };
        await ctx.redis.set(cacheKey, JSON.stringify(result), { ex: cacheTtls.mailbox });
        return result;
      }

      const isSpam = input.folder === 'spam';
      let rows = await ctx.db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          input.folder === 'trash' ? eq(emails.is_deleted, true) : eq(emails.is_deleted, false),
          input.folder === 'inbox' ? and(eq(emails.is_archived, false), isNotSentByMe) : sql`true`,
          cursor
            ? or(
                lt(emails.created_at, new Date(cursor.createdAt)),
                and(eq(emails.created_at, new Date(cursor.createdAt)), lt(emails.id, cursor.id))
              )
            : sql`true`,
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
          tag: true,
          priority: true,
          created_at: true,
          is_archived: true,
          is_deleted: true,
        },
        orderBy: [desc(emails.created_at)],
        limit: input.limit + 1,
        offset: cursor ? 0 : input.offset,
      });

      if (!cursor && input.offset === 0 && !input.query.trim() && rows.length === 0) {
        try {
          const seedResult = await seedMailboxFromCorsair(ctx, { limit: input.limit, maxPages: 1 });
          if (seedResult.needsConnect) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
          }
          rows = await ctx.db.query.emails.findMany({
            where: and(
              eq(emails.userId, ctx.userId!),
              input.folder === 'trash' ? eq(emails.is_deleted, true) : eq(emails.is_deleted, false),
              input.folder === 'inbox' ? and(eq(emails.is_archived, false), isNotSentByMe) : sql`true`,
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
              tag: true,
              priority: true,
              created_at: true,
              is_archived: true,
              is_deleted: true,
            },
            orderBy: [desc(emails.created_at)],
            limit: input.limit + 1,
            offset: cursor ? 0 : input.offset,
            });
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          console.warn('[getMailboxThreads] Mailbox fallback failed:', err);
        }
      }

      const mapped = rows.map((r) => mapEmailForListClient({ ...r, mailbox: input.folder }));
      const items = mapped.slice(0, input.limit);
      const nextPageToken = mapped.length > input.limit ? encodePageToken(items[items.length - 1]) : null;
      const result = { items, nextPageToken };

      await ctx.redis.set(cacheKey, JSON.stringify(result), { ex: cacheTtls.mailbox });
      return result;
    }),

  getThreads: protectedQueryProcedure
    .use(createRateLimitMiddleware('getThreads', 200, 60))
    .input(getThreadsSchema)
    .query(async ({ ctx, input }) => {
      const version = Number((await ctx.redis.get<string>(mailVersionKey(ctx.userId!))) ?? '0')
      const cacheKey = `user:${ctx.userId}:threads:v1:${version}:${input.isArchived ? 'archived' : 'active'}:${input.limit}`
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
          priority: true,
          created_at: true,
        },
        orderBy: [desc(emails.created_at)],
        limit: input.limit
      });

      // If local DB is empty (e.g. first load before webhooks), pull from Corsair
      if (results.length === 0) {
        try {
          await seedMailboxFromCorsair(ctx, { limit: input.limit, maxPages: 1 });
          // Re-fetch after seeding the first page so the local mailbox can render immediately.
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
              priority: true,
              created_at: true,
            },
            orderBy: [desc(emails.created_at)],
            limit: input.limit
          });
        } catch (err) {
          // Corsair fetch failed (not connected) — return empty gracefully
          console.warn('[getThreads] Corsair fallback failed:', err);
          return [];
        }
      }

      const mapped = results.map((r) => mapEmailForListClient(r))

      await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: cacheTtls.mailbox })
      return mapped;
    }),

  getUnreadCounts: protectedQueryProcedure
    .input(getUnreadCountsSchema)
    .query(async ({ ctx }) => {
      const version = Number((await ctx.redis.get<string>(mailVersionKey(ctx.userId!))) ?? '0');
      const cacheKey = unreadCountsCacheKey(ctx.userId!, version);
      const cached = await ctx.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as {
            inbox: number;
            drafts: number;
            sent: number;
            spam: number;
            trash: number;
          };
        } catch {}
      }

      const countRows = async (whereClause: any) => {
        const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(emails).where(whereClause);
        return Number(rows[0]?.count ?? 0);
      };

      const me = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId!),
        columns: { email: true },
      });

      const [inboxUnread, draftsCount, sentCount, spamCount, trashCount] = await Promise.all([
        countRows(and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_deleted, false),
          eq(emails.is_archived, false),
          me?.email ? sql`${emails.from_address} <> ${me.email}` : sql`true`,
          eq(emails.is_read, false)
        )),
        corsairGetDraftMessages(ctx.userId!, { limit: 1 }).then((result) => {
          if (result.needsConnect) return 0;
          return Number(result.resultSizeEstimate ?? (Array.isArray(result.data) ? result.data.length : 0));
        }).catch(() => 0),
        countRows(and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_deleted, false),
          me?.email ? eq(emails.from_address, me.email) : sql`false`
        )),
        countRows(and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_deleted, false),
          or(eq(emails.tag, 'newsletter'), eq(emails.tag, 'social'))
        )),
        countRows(and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_deleted, true)
        )),
      ]);

      const result = {
        inbox: inboxUnread,
        drafts: draftsCount,
        sent: sentCount,
        spam: spamCount,
        trash: trashCount,
      };

      await ctx.redis.set(cacheKey, JSON.stringify(result), { ex: cacheTtls.unread });
      return result;
    }),

  getThread: protectedQueryProcedure
    .input(getThreadSchema)
    .query(async ({ ctx, input }) => {
      const version = Number((await ctx.redis.get<string>(mailVersionKey(ctx.userId!))) ?? '0');
      const cacheKey = threadCacheKey(ctx.userId!, input.threadId, version);
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
        const consentRules = await ctx.db.query.aiConsentRules.findMany({
          where: eq(aiConsentRules.userId, ctx.userId!),
          columns: { pattern: true, isBlocked: true },
        });
        for (const msg of messages) {
          if (!msg?.id) continue;
          const row = mapGmailMessageToEmailRow(ctx.userId!, msg);

          await ctx.db.insert(emails).values({
            ...row,
            thread_id: msg.threadId || input.threadId,
            ai_triage_skipped: row.from_address ? isDomainBlocked(row.from_address, consentRules) : false,
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
        const refreshed = await ctx.db.query.emails.findMany({
          where: and(
            eq(emails.thread_id, input.threadId),
            eq(emails.userId, ctx.userId!)
          ),
          orderBy: [asc(emails.created_at)]
        });
        const mapped = refreshed.map((email) => mapEmailForThreadClient(email))
        await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: cacheTtls.thread })
        return mapped
      }

      const firstEmail = threadEmails[0];
      if (firstEmail && !firstEmail.tldr) {
        const settings = await getSafeUserSettings(ctx.userId!);
        if (settings.aiEnabled && settings.privacyConfigured && firstEmail.from_address) {
          const consentRules = await ctx.db.query.aiConsentRules.findMany({
            where: eq(aiConsentRules.userId, ctx.userId!),
            columns: { pattern: true, isBlocked: true },
          });
          const blocked = isDomainBlocked(firstEmail.from_address, consentRules);
          if (!blocked) {
            const source = firstEmail.body_text || firstEmail.snippet || firstEmail.subject || '';
            const tldr = await generateTLDR(firstEmail.subject || 'Conversation summary', source, { userId: ctx.userId! });
            await ctx.db.update(emails)
              .set({ tldr })
              .where(and(eq(emails.id, firstEmail.id), eq(emails.userId, ctx.userId!)));
            threadEmails = threadEmails.map((email) => (email.id === firstEmail.id ? { ...email, tldr } : email));
          }
        } else if (settings.aiEnabled && settings.privacyConfigured) {
          const source = firstEmail.body_text || firstEmail.snippet || firstEmail.subject || '';
          const tldr = await generateTLDR(firstEmail.subject || 'Conversation summary', source, { userId: ctx.userId! });
          await ctx.db.update(emails)
            .set({ tldr })
            .where(and(eq(emails.id, firstEmail.id), eq(emails.userId, ctx.userId!)));
          threadEmails = threadEmails.map((email) => (email.id === firstEmail.id ? { ...email, tldr } : email));
        }
      }

      const mapped = threadEmails.map((email) => mapEmailForThreadClient(email))
      await ctx.redis.set(cacheKey, JSON.stringify(mapped), { ex: cacheTtls.thread })
      return mapped;
    }),

  markRead: protectedProcedure
    .input(markReadSchema)
    .mutation(async ({ ctx, input }) => {
      const toUpdate = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { corsair_message_id: true, thread_id: true }
      });

      const results = await Promise.all(
        toUpdate.map((email) => markEmailRead(ctx.userId!, email.corsair_message_id))
      );
      if (results.some((result) => result.needsConnect)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      await ctx.db.update(emails)
        .set({ is_read: true })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));

      const firstThreadId = toUpdate[0]?.thread_id ?? null
      await invalidateMailCaches(ctx, firstThreadId)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'inbox',
        threadId: firstThreadId,
      })

      return { success: true };
    }),

  markUnread: protectedProcedure
    .input(markUnreadSchema)
    .mutation(async ({ ctx, input }) => {
      const toUpdate = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { corsair_message_id: true, thread_id: true }
      });

      const results = await Promise.all(
        toUpdate.map((email) => markEmailUnread(ctx.userId!, email.corsair_message_id))
      );
      if (results.some((result) => result.needsConnect)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      await ctx.db.update(emails)
        .set({ is_read: false })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));

      await invalidateMailCaches(ctx, toUpdate[0]?.thread_id);
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'inbox',
        threadId: toUpdate[0]?.thread_id,
      });

      return { success: true };
    }),

  bulkMarkRead: protectedProcedure
    .input(bulkActionSchema)
    .mutation(async ({ ctx, input }) => {
      const toUpdate = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { corsair_message_id: true, thread_id: true }
      });

      const results = await Promise.all(toUpdate.map((email) => markEmailRead(ctx.userId!, email.corsair_message_id)));
      if (results.some((result) => result.needsConnect)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      await ctx.db.update(emails)
        .set({ is_read: true })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));
      await invalidateMailCaches(ctx, toUpdate[0]?.thread_id)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'inbox',
        threadId: toUpdate[0]?.thread_id,
      })

      return { success: true, count: toUpdate.length };
    }),

  bulkArchive: protectedProcedure
    .input(bulkActionSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { corsair_message_id: true, thread_id: true }
      });

      const results = await Promise.all(rows.map((email) => archiveEmail(ctx.userId!, email.corsair_message_id)));
      if (results.some((result) => result.needsConnect)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }
      await ctx.db.update(emails)
        .set({ is_archived: true })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));
      await invalidateMailCaches(ctx, rows[0]?.thread_id)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'inbox',
        threadId: rows[0]?.thread_id,
      })

      return { success: true, count: rows.length };
    }),

  bulkDelete: protectedProcedure
    .input(bulkActionSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.query.emails.findMany({
        where: and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)),
        columns: { id: true, corsair_message_id: true, thread_id: true }
      });

      const results = await Promise.all(rows.map((email) => corsairDeleteEmail(ctx.userId!, email.corsair_message_id)));
      if (results.some((result) => result.needsConnect)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      await ctx.db.update(emails)
        .set({ is_deleted: true, deleted_at: new Date() })
        .where(and(inArray(emails.id, input.emailIds), eq(emails.userId, ctx.userId!)));

      await invalidateMailCaches(ctx, rows[0]?.thread_id)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'trash',
        threadId: rows[0]?.thread_id,
      })
      return { success: true, count: rows.length };
    }),

  archiveEmail: protectedProcedure
    .use(createRateLimitMiddleware('archiveEmail', 100, 60))
    .input(archiveEmailSchema)
    .mutation(async ({ ctx, input }) => {
      // Archive in Corsair/Gmail
      const target = await resolveEmailActionTarget(ctx, input.emailId)
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })

      const archiveResult = await archiveEmail(ctx.userId!, target.corsair_message_id)
      if (archiveResult.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      // Also update local DB if it exists (for cache/UI purposes)
      const localResult = await ctx.db.update(emails)
        .set({ is_archived: true })
        .where(and(eq(emails.corsair_message_id, target.corsair_message_id), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      await invalidateMailCaches(ctx, target.thread_id)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'inbox',
        threadId: target.thread_id,
      })

      // Fire and forget audit log
      ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'email_archived',
        details: { emailId: target.thread_id || target.id }
      }).catch(console.error);

      return { success: true, id: localResult[0]?.id || target.id };
    }),

  restoreFromArchive: protectedProcedure
    .input(restoreFromArchiveSchema)
    .mutation(async ({ ctx, input }) => {
      const target = await resolveEmailActionTarget(ctx, input.emailId)
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })

      const restoreResult = await restoreArchivedEmail(ctx.userId!, target.corsair_message_id)
      if (restoreResult.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      const localResult = await ctx.db.update(emails)
        .set({ is_archived: false })
        .where(and(eq(emails.corsair_message_id, target.corsair_message_id), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      await invalidateMailCaches(ctx, target.thread_id)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'inbox',
        threadId: target.thread_id,
      })

      return { success: true, id: localResult[0]?.id || target.id };
    }),

  deleteEmail: protectedProcedure
    .input(deleteEmailSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch row to verify ownership
      const email = await resolveEmailActionTarget(ctx, input.emailId);
      if (!email) throw new TRPCError({ code: 'NOT_FOUND' });

      const deleteResult = await corsairDeleteEmail(ctx.userId!, email.corsair_message_id)
      if (deleteResult.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      // 2. Soft delete locally after upstream trash succeeds
      await ctx.db.update(emails)
        .set({ is_deleted: true, deleted_at: new Date() })
        .where(eq(emails.id, email.id));

      await invalidateMailCaches(ctx, email.thread_id)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'trash',
        threadId: email.thread_id,
      })

      // 3. Redis buffer
      await ctx.redis.set(`deleted:${ctx.userId}:${email.corsair_message_id}`, 'true', { ex: 600 });

      // 4. QStash purge job
      if (process.env.QSTASH_TOKEN && process.env.RAILWAY_WORKER_URL && process.env.WORKER_SECRET) {
        const { messageId } = await qstash.publishJSON({
          url: `${process.env.RAILWAY_WORKER_URL}/workers/purge`,
          body: { userId: ctx.userId, emailId: email.corsair_message_id, dbId: email.id },
          headers: { 'X-Worker-Secret': process.env.WORKER_SECRET },
          delay: '10m',
          retries: 3,
        });

        // 5. Store job ID
        await ctx.redis.set(`deletejob:${ctx.userId}:${email.corsair_message_id}`, messageId, { ex: 660 });
      }

      return { success: true };
    }),

  restoreEmail: protectedProcedure
    .input(restoreEmailSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Redis get
      const target = await resolveEmailActionTarget(ctx, input.emailId)
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })
      const jobId = await ctx.redis.get<string>(`deletejob:${ctx.userId}:${target.corsair_message_id}`);
      
      // 2. Cancel QStash job
      if (jobId) {
        try {
          await qstash.messages.delete(jobId);
        } catch(e) {
          console.error('Failed to cancel QStash message', e);
        }
        await ctx.redis.del(`deletejob:${ctx.userId}:${target.corsair_message_id}`);
        await ctx.redis.del(`deleted:${ctx.userId}:${target.corsair_message_id}`);
      }

      const restoreResult = await restoreEmailFromTrash(ctx.userId!, target.corsair_message_id)
      if (restoreResult.needsConnect) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      // 3. Restore
      await ctx.db.update(emails)
        .set({ is_deleted: false, deleted_at: null })
        .where(and(eq(emails.corsair_message_id, target.corsair_message_id), eq(emails.userId, ctx.userId!)));

      await invalidateMailCaches(ctx, target.thread_id)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'trash',
        threadId: target.thread_id,
      })

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

      const results = await Promise.all(
        trashed.map((email) => permanentlyDeleteEmail(ctx.userId!, email.corsair_message_id))
      );
      if (results.some((result) => result.needsConnect)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }

      await ctx.db.update(emails)
        .set({ body_text: null })
        .where(and(eq(emails.userId, ctx.userId!), eq(emails.is_deleted, true)));

      await invalidateMailCaches(ctx)
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'trash',
        delta: -trashed.length,
      })

      return { success: true, count: trashed.length };
    }),

  getMorningDigest: protectedQueryProcedure
    .use(createRateLimitMiddleware('getMorningDigest', 10, 3600))
    .input(getMorningDigestSchema)
    .query(async ({ ctx }) => {
      const settings = await getSafeUserSettings(ctx.userId!);

      if (!settings.aiEnabled || !settings.morningDigestEnabled || !settings.privacyConfigured) {
        return { digest: '', emailCount: 0, eventCount: 0 };
      }

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

      const digest = await generateDigest(formattedEmails, formattedEvents, { userId: ctx.userId! });

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
    .mutation(async ({ ctx, input }) => {
      const rewritten = await rewriteDraft(input.draft, input.instruction, input.translateTo, { userId: ctx.userId! });
      return { rewritten };
    }),

  sendEmail: protectedProcedure
    .use(createRateLimitMiddleware('sendEmail', 20, 3600))
    .input(sendEmailSchema)
    .mutation(async ({ ctx, input }) => {
      const undoToken = crypto.randomUUID();
      logger.info({
        event: 'send_email_queued',
        userId: ctx.userId?.slice(0, 8),
        hasBody: Boolean(input.body?.trim()),
        recipientCount: input.to.length,
      });
      // Keep the payload alive longer than the undo window so the queued job
      // still has something to send even if QStash fires a little late.
      await ctx.redis.set(`undo:send:${ctx.userId}:${undoToken}`, JSON.stringify(input), { ex: 300 });
      await queueSendJob(ctx, undoToken).catch(() => null);
      return { undoToken, expiresAt: Date.now() + 10000 };
    }),

  sendConfirmed: protectedProcedure
    .use(createRateLimitMiddleware('sendConfirmed', 20, 3600))
    .input(sendConfirmedSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await processSendJob({ userId: ctx.userId!, undoToken: input.undoToken }, { db: ctx.db, redis: ctx.redis });
      if (result.status === 'needs_connect') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'gmail_not_connected' });
      }
      if (result.status === 400) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }
      if (result.status === 'skipped') {
        return { success: true, skipped: true, reason: result.reason };
      }
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
        cc: input.cc,
        bcc: input.bcc,
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
      await invalidateMailCaches(ctx, input.threadId);
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'drafts',
        threadId: input.threadId ?? null,
      })
      return draft;
    }),

  deleteDraft: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = `draft:${ctx.userId}:${input.id}`;
      await ctx.redis.del(key);
      await ctx.redis.srem(`drafts:index:${ctx.userId}`, key);
      await ctx.redis.del(`mailbox:${ctx.userId}:drafts:50`).catch(() => null);
      await invalidateMailCaches(ctx);
      await publishMailboxEvent(ctx.userId!, 'mailbox:refresh', {
        mailbox: 'drafts',
      })
      return { success: true };
    }),

  cancelSend: protectedProcedure
    .input(cancelSendSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.redis.del(`undo:send:${ctx.userId}:${input.undoToken}`);
      const jobId = await ctx.redis.get<string>(`sendjob:${ctx.userId}:${input.undoToken}`);
      if (jobId && process.env.QSTASH_TOKEN) {
        try {
          await qstash.messages.delete(jobId);
        } catch {}
      }
      await ctx.redis.del(`sendjob:${ctx.userId}:${input.undoToken}`).catch(() => null);
      return { cancelled: true };
    }),

  getAutoReplies: protectedQueryProcedure
    .input(getAutoRepliesSchema)
    .query(async ({ ctx, input }) => {
      const settings = await getSafeUserSettings(ctx.userId!);

      if (!settings.aiEnabled || !settings.draftSuggestionsEnabled || !settings.privacyConfigured) {
        return [];
      }

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
      if (drafts.length > 0) {
        return drafts;
      }

      const sourceEmail = await ctx.db.query.emails.findFirst({
        where: and(eq(emails.id, input.emailId), eq(emails.userId, ctx.userId!)),
        columns: {
          from_address: true,
          subject: true,
          snippet: true,
          body_text: true,
          ai_triage_skipped: true,
        },
      });

      if (!sourceEmail || sourceEmail.ai_triage_skipped) {
        return [];
      }

      const consentRules = await ctx.db.query.aiConsentRules.findMany({
        where: eq(aiConsentRules.userId, ctx.userId!),
        columns: { pattern: true, isBlocked: true },
      });

      if (sourceEmail.from_address && isDomainBlocked(sourceEmail.from_address, consentRules)) {
        return [];
      }

      const content = sourceEmail.body_text || sourceEmail.snippet || sourceEmail.subject || '';
      const replies = await generateAutoReplies(sourceEmail.subject || 'Reply draft', content, { userId: ctx.userId! });

      await ctx.db.delete(autoReplyDrafts)
        .where(and(eq(autoReplyDrafts.emailId, input.emailId), eq(autoReplyDrafts.userId, ctx.userId!)));

      const inserted = await ctx.db.insert(autoReplyDrafts)
        .values([
          { userId: ctx.userId!, emailId: input.emailId, reply_text: replies.direct, status: 'draft' },
          { userId: ctx.userId!, emailId: input.emailId, reply_text: replies.warm, status: 'draft' },
          { userId: ctx.userId!, emailId: input.emailId, reply_text: replies.boundary, status: 'draft' },
        ])
        .returning({
          id: autoReplyDrafts.id,
          reply_text: autoReplyDrafts.reply_text,
          status: autoReplyDrafts.status,
          created_at: autoReplyDrafts.created_at,
        });

      return inserted;
    })
});
