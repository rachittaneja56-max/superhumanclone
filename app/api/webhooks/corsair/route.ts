import { NextResponse } from 'next/server'
import { processWebhook } from 'corsair'
import { corsair } from '@/corsair'
import { claimWebhookEvent, extractPubSubMessageId } from '@/server/corsair/webhook-sync'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    // 1. Read raw body first (before any parsing)
    const rawBody = await req.arrayBuffer()
    const textBody = new TextDecoder().decode(rawBody)

    // 2. Idempotency — Corsair verifies webhook signatures inside processWebhook
    const eventId =
      req.headers.get('x-corsair-event-id') ??
      extractPubSubMessageId(textBody)

    if (eventId) {
      const claimed = await claimWebhookEvent(eventId)
      if (!claimed) {
        return NextResponse.json({ success: true, message: 'Already processed' })
      }
    }

    // 3. Route through Corsair — verifies signatures and updates corsair_entities
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId') ?? undefined

    const result = await processWebhook(
      corsair,
      Object.fromEntries(req.headers.entries()),
      textBody,
      tenantId ? { tenantId } : undefined
    )

    if (result.response) {
      const status = result.response.statusCode ?? 200
      const body = result.response.returnToSender ?? result.response.data ?? result.response
      const responseBody =
        typeof body === 'string' ? body : body != null ? JSON.stringify(body) : ''

      return new NextResponse(responseBody, {
        status,
        headers: result.responseHeaders,
      })
    }

    return NextResponse.json({
      success: true,
      plugin: result.plugin,
      action: result.action,
    })
  } catch (err) {
    console.error('[Webhook] Error processing webhook:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
