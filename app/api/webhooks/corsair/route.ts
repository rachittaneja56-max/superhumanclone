import { NextResponse } from 'next/server'
import { timingSafeCompare } from '@/lib/crypto'
import { createHmac } from 'node:crypto'
import { redis } from '@/server/redis'
import { db } from '@/server/db'
import { emails, aiConsentRules } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { isDomainBlocked } from '@/lib/domain-matcher'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    // 1. Read raw ArrayBuffer FIRST
    const rawBody = await req.arrayBuffer()
    
    // 2. HMAC verify
    const signatureHeader = req.headers.get('x-corsair-signature')
    if (!signatureHeader) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }
    
    const secret = process.env.CORSAIR_WEBHOOK_SECRET
    if (!secret) {
      console.error('CORSAIR_WEBHOOK_SECRET is not configured')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    
    const hmac = createHmac('sha256', secret)
    hmac.update(Buffer.from(rawBody))
    const expectedSignature = hmac.digest('hex')
    
    if (!timingSafeCompare(signatureHeader, expectedSignature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    
    // 3. Redis SET NX idempotency check
    const eventId = req.headers.get('x-corsair-event-id')
    if (!eventId) {
      return NextResponse.json({ error: 'Missing event ID' }, { status: 400 })
    }
    
    const isNew = await redis.setnx(`webhook:${eventId}`, '1')
    if (!isNew) {
      // Already processed
      return NextResponse.json({ success: true, message: 'Already processed' })
    }
    await redis.expire(`webhook:${eventId}`, 60 * 60 * 24 * 7) // 7 days
    
    // 4. JSON.parse only after steps 1-3
    const textBody = new TextDecoder().decode(rawBody)
    const payload = JSON.parse(textBody)
    
    const userId = payload.tenantId
    if (!userId) {
      return NextResponse.json({ success: true, message: 'No tenant ID' })
    }

    if (payload.event === 'messages.new' && payload.data) {
       const msg = payload.data

       // 5. Domain consent check
       let aiTriageSkipped = true
       const fromEmail = msg.from?.email || msg.from || ''
       
       if (fromEmail) {
         const rules = await db.query.aiConsentRules.findMany({
           where: eq(aiConsentRules.userId, userId)
         })
         
         const isBlocked = isDomainBlocked(fromEmail, rules)
         aiTriageSkipped = isBlocked
       }
       
       // 6. Direct DB save
       await db.insert(emails).values({
          userId,
          corsair_message_id: msg.id,
          thread_id: msg.threadId || msg.id,
          subject: msg.subject || '(no subject)',
          from_address: fromEmail,
          from_name: msg.from?.name || '',
          to_address: Array.isArray(msg.to) ? msg.to.map((t: any) => typeof t === 'string' ? t : t.email).join(', ') : (msg.to || ''),
          snippet: msg.snippet || '',
          body_text: msg.body?.text || msg.bodyText || null,
          body_html: msg.body?.html || msg.bodyHtml || null,
          is_read: msg.isRead ?? msg.labelIds?.includes('UNREAD') === false,
          is_archived: false,
          is_deleted: false,
          ai_triage_skipped: aiTriageSkipped,
          created_at: msg.date ? new Date(msg.date) : new Date(),
       }).onConflictDoNothing()
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Webhook] Error processing webhook:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
