import { NextResponse } from 'next/server';
import { redis } from '@/server/redis';
import { db } from '@/server/db';
import { emails } from '@/server/db/schema';
import { Client as QStash } from '@upstash/qstash';

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
      // If no sender (e.g. sync event), ignore for triage
      return NextResponse.json({ status: 'ignored' });
    }

    if (event.type === 'email.received' && event.data?.messageId) {
      const emailData = event.data;
      
      const [inserted] = await db.insert(emails).values({
        userId,
        corsair_message_id: emailData.messageId,
        from_address: sender,
        to_address: emailData.to?.[0]?.email || '',
        subject: emailData.subject ?? '',
        snippet: emailData.snippet ?? '',
        body_text: emailData.body?.text ?? null,
        ai_triage_skipped: true // defaults to true, explicitly setting for clarity
      }).onConflictDoNothing().returning({ id: emails.id });

      if (!inserted) {
        return NextResponse.json({ status: 'duplicate_db' });
      }

      const qstash = new QStash({ token: process.env.QSTASH_TOKEN! });

      await qstash.publishJSON({
        url: `${process.env.RAILWAY_WORKER_URL}/workers/triage`,
        body: {
          userId: event.userId,
          emailId: inserted.id,
          corsairMessageId: emailData.messageId,
          fromAddress: sender,
          subject: emailData.subject ?? '',
          snippet: emailData.snippet ?? '',
          bodyText: emailData.body?.text ?? null,
        },
        headers: { 'X-Worker-Secret': process.env.WORKER_SECRET! },
        retries: 3,
      }).catch(err => {
        // Never let QStash failure block webhook response
        console.error('QStash enqueue failed:', err.message);
      });
    }

    return NextResponse.json({ status: 'dispatched' });

  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
