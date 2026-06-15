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
         const domain = fromEmail.split('@')[1] || ''
         const versionStr = await redis.get<string>(`consent_version:${userId}`) ?? '0'
         const cacheKey = `consent:${userId}:${domain}:${versionStr}`
         const cached = await redis.get<string>(cacheKey)

         if (cached !== null) {
           aiTriageSkipped = cached === 'blocked'
         } else {
           const rules = await db.query.aiConsentRules.findMany({
             where: eq(aiConsentRules.userId, userId)
           })
           
           aiTriageSkipped = isDomainBlocked(fromEmail, rules)
           await redis.set(cacheKey, aiTriageSkipped ? 'blocked' : 'allowed', { ex: 3600 })
         }
       }
       
       if (aiTriageSkipped) {
         // 6. BLOCKED: Direct DB save with ai_triage_skipped = true
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
            ai_triage_skipped: true,
            created_at: msg.date ? new Date(msg.date) : new Date(),
         }).onConflictDoNothing()

         // Ably publish webhook:email
         if (process.env.ABLY_API_KEY) {
           const base64Key = Buffer.from(process.env.ABLY_API_KEY).toString('base64');
           await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Basic ${base64Key}`,
             },
             body: JSON.stringify({
               name: 'webhook:email',
               data: { emailId: msg.id, fromAddress: fromEmail, subject: msg.subject }
             }),
           }).catch((err) => console.error('Failed to publish webhook:email to ably:', err));
         }

       } else {
         // 7. ALLOWED: Dispatch to QStash worker
         const qstashUrl = process.env.QSTASH_URL || 'https://qstash.upstash.io/v2'
         const qstashToken = process.env.QSTASH_TOKEN
         if (qstashToken) {
           await fetch(`${qstashUrl}/publish/${process.env.RAILWAY_WORKER_URL || ''}/workers/triage`, {
             method: 'POST',
             headers: {
               'Authorization': `Bearer ${qstashToken}`,
               'Content-Type': 'application/json',
               'Upstash-Forward-X-Worker-Secret': process.env.WORKER_SECRET || '',
             },
             body: JSON.stringify({
               userId,
               emailId: msg.id, // we pass corsair id, triage worker will need to insert it
               corsairMessageId: msg.id,
               fromAddress: fromEmail,
               subject: msg.subject || '(no subject)',
               snippet: msg.snippet || '',
               bodyText: msg.body?.text || msg.bodyText || null,
               // we also need to pass thread_id and to_address to worker so it can insert
               threadId: msg.threadId || msg.id,
               fromName: msg.from?.name || '',
               toAddress: Array.isArray(msg.to) ? msg.to.map((t: any) => typeof t === 'string' ? t : t.email).join(', ') : (msg.to || ''),
               bodyHtml: msg.body?.html || msg.bodyHtml || null,
               isRead: msg.isRead ?? msg.labelIds?.includes('UNREAD') === false,
               createdAt: msg.date ? new Date(msg.date).toISOString() : new Date().toISOString(),
             }),
           }).catch((err) => console.error('Failed to publish to QStash:', err));
         }
       }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Webhook] Error processing webhook:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
