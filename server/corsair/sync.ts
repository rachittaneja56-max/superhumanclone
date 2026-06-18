import 'server-only'
import { db } from '@/server/db'
import { aiConsentRules, emails } from '@/server/db/schema'
import { eq, count } from 'drizzle-orm'
import { getMessages } from '@/server/corsair/client'
import { mapGmailMessageToEmailRow } from '@/server/corsair/email-mapper'
import { isDomainBlocked } from '@/lib/domain-matcher'

export async function syncInboxIfEmpty(userId: string): Promise<void> {
  try {
    const [result] = await db
      .select({ count: count() })
      .from(emails)
      .where(eq(emails.userId, userId))

    if ((result?.count ?? 0) > 0) return

    console.log('[Sync] No emails found, triggering initial Gmail API sync for', userId.slice(0, 8))

    const corsairResult = await getMessages(userId, { limit: 50 })
    if (!corsairResult.success || !Array.isArray(corsairResult.data) || corsairResult.data.length === 0) {
      console.log('[Sync] No messages returned from Gmail API')
      return
    }

    const consentRules = await db.query.aiConsentRules.findMany({
      where: eq(aiConsentRules.userId, userId),
      columns: { pattern: true, isBlocked: true },
    })

    for (const msg of corsairResult.data) {
      if (!msg?.id) continue
      const row = mapGmailMessageToEmailRow(userId, msg)
      const aiTriageSkipped = row.from_address ? isDomainBlocked(row.from_address, consentRules) : false

      await db.insert(emails).values({
        ...row,
        ai_triage_skipped: aiTriageSkipped,
      }).onConflictDoNothing()
    }

    console.log('[Sync] Initial Gmail sync complete for', userId.slice(0, 8))
  } catch (err) {
    console.error('[Sync] Initial sync failed:', err)
  }
}
