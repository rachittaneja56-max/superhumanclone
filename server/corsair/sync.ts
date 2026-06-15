import 'server-only'
import { db } from '@/server/db'
import { emails } from '@/server/db/schema'
import { eq, count } from 'drizzle-orm'
import { getThreads } from '@/server/corsair/client'

export async function syncInboxIfEmpty(userId: string): Promise<void> {
  try {
    // Check if we have any emails for this user
    const [result] = await db
      .select({ count: count() })
      .from(emails)
      .where(eq(emails.userId, userId))

    if ((result?.count ?? 0) > 0) return // Already have emails

    // No emails — trigger Corsair sync
    console.log('[Sync] No emails found, triggering initial sync for', userId.slice(0, 8))

    // Pull from Corsair's synced DB into our emails table
    const corsairResult = await getThreads(userId, { limit: 100 })
    if (!corsairResult.success || !corsairResult.data) return

    // Insert each email into our DB
    const threads = Array.isArray(corsairResult.data)
      ? corsairResult.data
      : corsairResult.data.threads ?? []

    for (const thread of threads) {
      const messages = thread.messages ?? [thread]
      for (const msg of messages) {
        if (!msg.id) continue
        await db.insert(emails).values({
          userId,
          corsair_message_id: msg.id,
          thread_id: thread.id ?? msg.threadId ?? msg.id,
          subject: msg.subject ?? '(no subject)',
          from_address: msg.from?.email ?? msg.from ?? '',
          from_name: msg.from?.name ?? '',
          to_address: Array.isArray(msg.to)
            ? msg.to.map((t: any) => typeof t === 'string' ? t : t.email).join(', ')
            : (msg.to ?? ''),
          snippet: msg.snippet ?? '',
          body_text: msg.body?.text ?? msg.bodyText ?? null,
          body_html: msg.body?.html ?? msg.bodyHtml ?? null,
          is_read: msg.isRead ?? msg.labelIds?.includes('UNREAD') === false,
          is_archived: false,
          is_deleted: false,
          ai_triage_skipped: true,
          created_at: msg.date ? new Date(msg.date) : new Date(),
        }).onConflictDoNothing()
      }
    }

    console.log('[Sync] Initial sync complete for', userId.slice(0, 8))
  } catch (err) {
    // Sync failure must never crash the inbox page
    console.error('[Sync] Initial sync failed:', err)
  }
}
