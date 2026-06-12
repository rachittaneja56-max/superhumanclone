import { NextResponse } from 'next/server';
import { redis } from '@/server/redis';
import { db } from '@/server/db';
import { aiConsentRules, emails } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { isDomainBlocked } from '@/lib/domain-matcher';

export const runtime = 'edge';

const CORSAIR_SECRET = process.env.CORSAIR_WEBHOOK_SECRET || '';

// Constant time string comparison for Edge runtime
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Convert ArrayBuffer to Hex String
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: Request) {
  try {
    // 1. Read raw body FIRST
    const rawBody = await req.arrayBuffer();

    // 2. Get signature
    const sig = req.headers.get('x-corsair-signature') ?? '';

    // 3. Compute HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(CORSAIR_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, rawBody);
    const hmacHex = bufferToHex(signatureBuffer);

    // 4. Constant time compare
    if (!timingSafeEqual(sig, 'sha256=' + hmacHex)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 5. Peek eventId for idempotency
    const textBody = new TextDecoder().decode(rawBody);
    
    let eventId = '';
    try {
      const peek = JSON.parse(textBody);
      eventId = peek.id;
    } catch (e) {
      return new NextResponse('Invalid JSON', { status: 400 });
    }

    if (!eventId) {
      return new NextResponse('Missing event ID', { status: 400 });
    }

    const idempotencyKey = 'webhook:' + eventId;
    const isNew = await redis.set(idempotencyKey, '1', { nx: true, ex: 86400 });
    if (isNew === null) {
      return NextResponse.json({ status: 'duplicate' }, { status: 200 });
    }

    // 6. Full JSON parse
    const event = JSON.parse(textBody);
    const userId = event.userId;

    if (!userId) {
      return new NextResponse('Missing userId', { status: 400 });
    }

    // 7. Extract sender
    const sender = event.data?.from?.email ?? event.data?.attendee?.email;
    if (!sender) {
      // If no sender (e.g. sync event), just pass to worker
      await publishToWorker(event);
      return NextResponse.json({ status: 'dispatched' });
    }

    // 8. Extract domain
    const parts = sender.split('@');
    const domain = parts.length === 2 ? parts[1] : '';

    // 9. Consent check
    const cacheKey = 'consent:' + userId + ':' + domain;
    let cachedRules = await redis.get<string[]>(cacheKey);

    if (cachedRules === null) {
      const rules = await db.query.aiConsentRules.findMany({
        where: eq(aiConsentRules.userId, userId),
        columns: { domain: true }
      });
      cachedRules = rules.map(r => r.domain);
      await redis.set(cacheKey, JSON.stringify(cachedRules), { ex: 3600 });
    }

    const isBlocked = isDomainBlocked(sender, cachedRules);

    console.log(`[Webhook] Event: ${event.type}, ID: ${eventId}, User: ${userId}, Blocked: ${isBlocked}`);

    // 10. If blocked
    if (isBlocked) {
      if (event.type === 'email.received' && event.data?.messageId) {
        await db.insert(emails).values({
          userId,
          corsair_message_id: event.data.messageId,
          from_address: sender,
          to_address: event.data.to?.[0]?.email || '',
          ai_triage_skipped: true
        });

        // Publish to Ably REST API
        await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(process.env.ABLY_API_KEY || '').toString('base64')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: 'webhook:email', data: { status: 'blocked' } })
        });
      }
      return NextResponse.json({ status: 'blocked_and_saved' });
    }

    // 11. If allowed
    await publishToWorker(event);
    return NextResponse.json({ status: 'dispatched' });

  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

async function publishToWorker(payload: any) {
  const qstashUrl = process.env.QSTASH_URL;
  const qstashToken = process.env.QSTASH_TOKEN;
  const workerUrl = process.env.RAILWAY_WORKER_URL || 'https://api.tempo.com';

  if (!qstashUrl || !qstashToken) return;

  await fetch(`${qstashUrl}/v2/publish/${workerUrl}/workers/triage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${qstashToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}
