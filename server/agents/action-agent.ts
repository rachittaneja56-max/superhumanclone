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

  // 3. Poll Redis for response
  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;
    let isResolved = false;
    
    const cleanup = () => {
      isResolved = true;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };

    const checkStatus = async () => {
      if (isResolved) return;
      try {
        const status = await redis.get<string>(`hitl:response:${actionId}`);
        if (status) {
          cleanup();
          resolve(status === 'approved');
        }
      } catch (err) {
        console.error('Error polling hitl status:', err);
      }
    };

    // Poll every 3 seconds
    intervalId = setInterval(checkStatus, 3000);

    // Timeout after 5 minutes
    timeoutId = setTimeout(() => {
      if (isResolved) return;
      cleanup();
      resolve(false);
    }, 5 * 60 * 1000);
  });
}
