import 'server-only'
import { db } from '@/server/db'
import { emails, calendarEvents, aiConsentRules, users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { isDomainBlocked } from '@/lib/domain-matcher'
import { mapGmailMessageToEmailRow } from '@/server/corsair/email-mapper'
import { redis } from '@/server/redis'
import { Client } from '@upstash/qstash'
import { invalidateMailCache, invalidateCalendarCache } from '@/server/cache'

const qstash = new Client({ token: process.env.QSTASH_TOKEN || '' })

async function invalidateUserMailCaches(userId: string, threadId?: string | null) {
  await invalidateMailCache(redis, userId)
  if (threadId) {
    await redis.del(`thread:${userId}:${threadId}`).catch(() => null)
  }
}

type GmailWebhookResult =
  | { type: 'messageReceived'; emailAddress: string; message: { id?: string } & Record<string, unknown> }
  | { type: 'messageDeleted'; emailAddress: string; message: { id?: string } & Record<string, unknown> }
  | {
      type: 'messageLabelChanged'
      emailAddress: string
      message: { id?: string; labelIds?: string[] } & Record<string, unknown>
      labelsAdded?: string[]
      labelsRemoved?: string[]
    }

type CalendarWebhookResult =
  | { type: 'eventCreated'; calendarId: string; event: Record<string, unknown> }
  | { type: 'eventUpdated'; calendarId: string; event: Record<string, unknown> }
  | { type: 'eventDeleted'; calendarId: string; eventId: string }

function getTenantId(ctx: Record<string, unknown>): string | undefined {
  const tenantId = ctx.tenantId ?? ctx.tenant_id
  return typeof tenantId === 'string' ? tenantId : undefined
}

async function resolveUserId(
  ctx: Record<string, unknown>,
  emailAddress?: string
): Promise<string | null> {
  const tenantId = getTenantId(ctx)
  if (tenantId) return tenantId

  if (emailAddress) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, emailAddress),
      columns: { id: true },
    })
    return user?.id ?? null
  }

  return null
}

async function checkPrivacyGate(userId: string, fromAddress: string): Promise<boolean> {
  const rules = await db.query.aiConsentRules.findMany({
    where: eq(aiConsentRules.userId, userId),
  })
  return isDomainBlocked(fromAddress, rules)
}

async function publishAblyEvent(userId: string, eventName: string, data?: unknown) {
  const ablyKey = process.env.ABLY_API_KEY
  if (!ablyKey) return

  await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(ablyKey).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: eventName, data: data ?? {} }),
  }).catch((err) => console.error('[Webhook] Ably publish failed:', err))
}

async function queueTriageJob(
  userId: string,
  emailId: string,
  corsairMessageId: string,
  fromAddress: string,
  subject: string,
  snippet: string | null,
  bodyText: string | null
) {
  if (!process.env.QSTASH_TOKEN) return

  const baseUrl = process.env.RAILWAY_WORKER_URL || process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) return

  await qstash.publishJSON({
    url: `${baseUrl}/workers/triage`,
    body: {
      userId,
      emailId,
      corsairMessageId,
      fromAddress,
      subject,
      snippet: snippet ?? '',
      bodyText,
    },
    headers: { 'X-Worker-Secret': process.env.WORKER_SECRET || '' },
    retries: 3,
  }).catch((err) => console.error('[Webhook] QStash triage enqueue failed:', err))
}

function mapCalendarEvent(userId: string, event: Record<string, unknown>) {
  const id = event.id as string | undefined
  if (!id) return null

  const startRaw = (event.start as { dateTime?: string; date?: string } | undefined)?.dateTime
    ?? (event.start as { date?: string } | undefined)?.date
  const endRaw = (event.end as { dateTime?: string; date?: string } | undefined)?.dateTime
    ?? (event.end as { date?: string } | undefined)?.date
  if (!startRaw || !endRaw) return null

  const start = (event.start as { dateTime?: string; date?: string } | undefined)
  const isAllDay = !!start?.date && !start?.dateTime

  return {
    userId,
    corsair_event_id: id,
    title: (event.summary as string) || '(No Title)',
    description: (event.description as string) || null,
    start_time: new Date(startRaw),
    end_time: new Date(endRaw),
    location: (event.location as string) || null,
    is_all_day: isAllDay,
    status: (event.status as string) || 'confirmed',
  }
}

export async function handleGmailWebhook(ctx: Record<string, unknown>, result: GmailWebhookResult) {
  const userId = await resolveUserId(ctx, result.emailAddress)
  if (!userId) {
    console.warn('[Webhook] Gmail event with no resolvable tenant')
    return
  }

  const messageId = result.message?.id
  if (!messageId) return

  if (result.type === 'messageReceived') {
    const row = mapGmailMessageToEmailRow(userId, result.message)
    const aiTriageSkipped = await checkPrivacyGate(userId, row.from_address)

    const [inserted] = await db
      .insert(emails)
      .values({ ...row, ai_triage_skipped: aiTriageSkipped })
      .onConflictDoNothing()
      .returning({ id: emails.id })

    await invalidateUserMailCaches(userId, row.thread_id)
    await publishAblyEvent(userId, 'webhook:email')

    if (inserted && !aiTriageSkipped) {
      await queueTriageJob(
        userId,
        inserted.id,
        messageId,
        row.from_address,
        row.subject ?? '(no subject)',
        row.snippet,
        row.body_text
      )
    }
    return
  }

  if (result.type === 'messageDeleted') {
    await db
      .update(emails)
      .set({ is_deleted: true, deleted_at: new Date() })
      .where(eq(emails.corsair_message_id, messageId))
    await invalidateUserMailCaches(userId)
    await publishAblyEvent(userId, 'webhook:email')
    return
  }

  if (result.type === 'messageLabelChanged') {
    const labelsAdded = result.labelsAdded ?? []
    const labelsRemoved = result.labelsRemoved ?? []
    const labelIds = result.message.labelIds ?? []

    await db
      .update(emails)
      .set({
        is_read: !labelIds.includes('UNREAD'),
        is_archived: !labelIds.includes('INBOX'),
      })
      .where(eq(emails.corsair_message_id, messageId))

    const row = await db.query.emails.findFirst({
      where: eq(emails.corsair_message_id, messageId),
      columns: { thread_id: true },
    })
    await invalidateUserMailCaches(userId, row?.thread_id)
    if (labelsRemoved.includes('INBOX') || labelsAdded.includes('TRASH')) {
      await publishAblyEvent(userId, 'webhook:email')
    }
  }
}

export async function handleCalendarWebhook(ctx: Record<string, unknown>, result: CalendarWebhookResult) {
  const userId = getTenantId(ctx)
  if (!userId) {
    console.warn('[Webhook] Calendar event with no tenantId query param')
    return
  }

  if (result.type === 'eventDeleted') {
    await db.delete(calendarEvents).where(eq(calendarEvents.corsair_event_id, result.eventId))
    await invalidateCalendarCache(redis, userId)
    return
  }

  const mapped = mapCalendarEvent(userId, result.event)
  if (!mapped) return

  await db
    .insert(calendarEvents)
    .values(mapped)
    .onConflictDoUpdate({
      target: calendarEvents.corsair_event_id,
      set: {
        title: mapped.title,
        description: mapped.description,
        start_time: mapped.start_time,
        end_time: mapped.end_time,
        location: mapped.location,
        is_all_day: mapped.is_all_day,
        status: mapped.status,
        updated_at: new Date(),
      },
    })
  await invalidateCalendarCache(redis, userId)
}

export function extractPubSubMessageId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { message?: { messageId?: string } }
    return parsed.message?.messageId ?? null
  } catch {
    return null
  }
}

export async function claimWebhookEvent(eventId: string): Promise<boolean> {
  const isNew = await redis.setnx(`webhook:${eventId}`, '1')
  if (!isNew) return false
  await redis.expire(`webhook:${eventId}`, 60 * 60 * 24 * 7)
  return true
}
