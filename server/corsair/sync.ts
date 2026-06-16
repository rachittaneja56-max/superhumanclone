import 'server-only'
import { db } from '@/server/db'
import { emails } from '@/server/db/schema'
import { eq, count } from 'drizzle-orm'
import { getMessages } from '@/server/corsair/client'

function getHeader(msg: any, name: string): string {
  return msg.payload?.headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function parseFromVal(fromVal: string): { name: string | null; address: string } {
  const match = fromVal.match(/^(.*?)\s*<([^>]+)>/)
  if (match) {
    return { name: match[1].replace(/['"]/g, '').trim() || null, address: match[2].trim() }
  }
  return { name: null, address: fromVal.trim() }
}

function parseEmailBody(payload: any): { text: string; html: string } {
  let text = ''
  let html = ''
  function decode(data: string) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  }
  function traverse(part: any) {
    if (!part) return
    if (part.body?.data) {
      const decoded = decode(part.body.data)
      if (part.mimeType === 'text/plain') text = decoded
      else if (part.mimeType === 'text/html') html = decoded
    }
    if (part.parts) part.parts.forEach(traverse)
  }
  traverse(payload)
  return { text, html }
}

export async function syncInboxIfEmpty(userId: string): Promise<void> {
  try {
    // Check if we have any emails for this user
    const [result] = await db
      .select({ count: count() })
      .from(emails)
      .where(eq(emails.userId, userId))

    if ((result?.count ?? 0) > 0) return // Already have emails

    console.log('[Sync] No emails found, triggering initial Gmail API sync for', userId.slice(0, 8))

    // Fetch from Gmail API (not the DB layer — which only has minimal metadata)
    const corsairResult = await getMessages(userId, { limit: 50 })
    if (!corsairResult.success || !Array.isArray(corsairResult.data) || corsairResult.data.length === 0) {
      console.log('[Sync] No messages returned from Gmail API')
      return
    }

    for (const msg of corsairResult.data) {
      if (!msg?.id) continue

      const fromVal = getHeader(msg, 'From')
      const toVal = getHeader(msg, 'To')
      const subjectVal = getHeader(msg, 'Subject') || '(no subject)'
      const { name: fromName, address: fromAddress } = parseFromVal(fromVal)
      const { text: bodyText, html: bodyHtml } = parseEmailBody(msg.payload)

      await db.insert(emails).values({
        userId,
        corsair_message_id: msg.id,
        thread_id: msg.threadId || msg.id,
        subject: subjectVal,
        from_address: fromAddress || 'unknown@unknown.com',
        from_name: fromName,
        to_address: toVal || '',
        snippet: msg.snippet || null,
        body_text: bodyText || null,
        body_html: bodyHtml || null,
        is_read: !msg.labelIds?.includes('UNREAD'),
        is_archived: false,
        is_deleted: false,
        ai_triage_skipped: true,
        created_at: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
      }).onConflictDoNothing()
    }

    console.log('[Sync] Initial Gmail sync complete for', userId.slice(0, 8))
  } catch (err) {
    // Sync failure must never crash the inbox page
    console.error('[Sync] Initial sync failed:', err)
  }
}
