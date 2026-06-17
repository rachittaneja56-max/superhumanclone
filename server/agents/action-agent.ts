import 'server-only';
import { db } from '../db';
import { auditLogs, hitlActions } from '../db/schema';
import { sanitisePayload } from '@/lib/sanitise-payload';
import { redis } from '../redis';
import { mapHitlActionForClient, mapHitlPayloadForClient } from '../ai/agents/action-agent';

export async function hitlInterceptor(
  userId: string,
  sessionId: string | null,
  action: { actionType: string; payload: any; humanReadable: string }
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const safePayload = mapHitlPayloadForClient(action.actionType, action.payload ?? {});

  // 1. Insert HITL action into DB
  const [row] = await db.insert(hitlActions).values({
    userId,
    action_type: action.actionType,
    payload: sanitisePayload(safePayload),
    status: 'pending',
    expires_at: expiresAt,
  }).returning({ id: hitlActions.id });

  const actionId = row.id;
  const safeCard = mapHitlActionForClient({
    id: actionId,
    action_type: action.actionType,
    payload: safePayload,
    expires_at: expiresAt,
    humanReadable: action.humanReadable,
  });

  await redis.set(`hitl:pending:${actionId}`, safeCard, { ex: 60 * 5 });

  await db.insert(auditLogs).values({
    userId,
    action: 'hitl_created',
    details: sanitisePayload({
      actionType: action.actionType,
      sessionId,
      riskLevel: safeCard.riskLevel,
      payload: safePayload,
    }),
  }).catch(() => undefined);

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
      data: safeCard,
    }),
  }).catch(() => undefined);

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
      resolve(false);
    }
  });
}
