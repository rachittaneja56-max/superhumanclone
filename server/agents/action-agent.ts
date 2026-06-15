import 'server-only';
import { db } from '../db';
import { hitlActions } from '../db/schema';
import { sanitisePayload } from '@/lib/sanitise-payload';
import { redis } from '../redis';

export async function hitlInterceptor(
  userId: string,
  sessionId: string | null,
  action: { actionType: string; payload: any; humanReadable: string }
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // 1. Insert HITL action into DB
  const [row] = await db.insert(hitlActions).values({
    userId,
    action_type: action.actionType,
    payload: sanitisePayload(action.payload),
    status: 'pending',
    expires_at: expiresAt,
  }).returning({ id: hitlActions.id });

  const actionId = row.id;

  // 2. Publish to Ably via REST
  if (!process.env.ABLY_API_KEY) {
    throw new Error('ABLY_API_KEY is not set');
  }

  const base64Key = Buffer.from(process.env.ABLY_API_KEY).toString('base64');
  
  await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${base64Key}`,
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
  }).catch((err) => console.error('Failed to publish hitl action to ably:', err));

  // 3. Wait for Redis pub/sub response
  return new Promise((resolve) => {
    // Subscribe to specific channel
    const channel = `hitl:response:${actionId}`;
    
    let isResolved = false;

    // Set timeout first so it can be const
    const timeoutId = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      
      try {
         if (typeof (redis as any).unsubscribe === 'function') {
             (redis as any).unsubscribe(channel);
         }
      } catch (e) {}

      resolve(false);
    }, 5 * 60 * 1000);

    const subscribeCallback = (message: string) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timeoutId);
      
      // Cleanup
      try {
         if (typeof (redis as any).unsubscribe === 'function') {
             (redis as any).unsubscribe(channel);
         }
      } catch (e) {}

      resolve(message === 'approved');
    };

    // Attempt to use it
    try {
      if (typeof (redis as any).subscribe === 'function') {
        (redis as any).subscribe(channel, subscribeCallback);
      }
    } catch (e) {
      console.error("Redis subscribe failed", e);
    }
  });
}
