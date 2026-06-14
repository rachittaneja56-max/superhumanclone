import 'server-only';
import { db } from '../db';
import { hitlActions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { sanitisePayload } from '@/lib/sanitise-payload';

/** Payload published to Ably for HITL — never includes body/content */
interface HITLActionInput {
  actionType: string;
  payload: Record<string, unknown>;
  humanReadable: string;
}

/**
 * HITL interceptor.
 * 1. Inserts a hitl_actions row (status=pending).
 * 2. Pushes the action card to the user via Ably REST.
 * 3. Polls the DB every 2 seconds until approved/rejected/expired (max 5 min).
 * Returns true if approved, false if rejected or timed out.
 */
export async function hitlInterceptor(
  userId: string,
  _sessionId: string | null,
  action: HITLActionInput
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // 1. Insert HITL action into DB
  const [row] = await db
    .insert(hitlActions)
    .values({
      userId,
      action_type: action.actionType,
      // body stripped before storage — security rule
      payload: sanitisePayload(action.payload) as Record<string, unknown>,
      status: 'pending',
      expires_at: expiresAt,
    })
    .returning({ id: hitlActions.id });

  const actionId = row.id;

  // 2. Publish to Ably via REST (no body content — only metadata)
  if (!process.env.ABLY_API_KEY) {
    throw new Error('ABLY_API_KEY is not set');
  }

  const base64Key = Buffer.from(process.env.ABLY_API_KEY).toString('base64');

  await fetch(
    `https://rest.ably.io/channels/private:user-${userId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${base64Key}`,
      },
      body: JSON.stringify({
        name: 'hitl:action',
        data: {
          actionId,
          actionType: action.actionType,
          humanReadable: action.humanReadable,
          expiresAt: expiresAt.toISOString(),
          payload: sanitisePayload(action.payload),
        },
      }),
    }
  ).catch((err) => console.error('Failed to publish hitl action to Ably:', err));

  // 3. Poll DB every 2 seconds until resolved or expired (max 5 min = 150 polls)
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLLS = Math.ceil((5 * 60 * 1000) / POLL_INTERVAL_MS);

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const current = await db.query.hitlActions.findFirst({
      where: eq(hitlActions.id, actionId),
      columns: { status: true, expires_at: true },
    });

    if (!current) return false;

    if (current.status === 'approved') return true;
    if (current.status === 'rejected' || current.status === 'expired') return false;

    // If DB row is still pending but wall-clock expired, bail
    if (new Date(current.expires_at) < new Date()) return false;
  }

  // Timed out
  return false;
}
