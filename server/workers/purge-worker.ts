import { z } from 'zod';
import { workerDb } from '../db/worker-index';
import { emails } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { deleteEmail as corsairDeleteEmail } from '../corsair/client';
import pino from 'pino';

const logger = pino();

const PurgePayloadSchema = z.object({
  userId: z.string(),
  emailId: z.string(), // Corsair message id
  dbId: z.string().uuid(),
});

export async function processPurgeJob(payload: unknown) {
  const parsed = PurgePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, error: 'Invalid payload' };
  }
  const { userId, emailId, dbId } = parsed.data;

  try {
    // 1. Verify it's still deleted
    const email = await workerDb.query.emails.findFirst({
      where: and(eq(emails.id, dbId), eq(emails.is_deleted, true))
    });

    if (!email) {
      logger.info({ event: 'purge_skipped_not_deleted', emailId, userId: userId.slice(0, 8) });
      return { status: 'skipped', reason: 'not_deleted' };
    }

    // 2. Call Corsair to actually delete it
    await corsairDeleteEmail(userId, emailId);

    // 3. Purge body_text
    await workerDb.update(emails)
      .set({ body_text: null })
      .where(eq(emails.id, dbId));

    logger.info({ event: 'purge_complete', emailId, userId: userId.slice(0, 8) });
    return { status: 'completed' };
  } catch (error) {
    logger.error({ err: error, emailId, userId }, 'Error processing purge job');
    throw error; // Let QStash retry if it's a network error
  }
}

// Next.js Edge/Node Route compatibility wrapper
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await processPurgeJob(payload);
    if (result.status === 400) {
      return new Response('Invalid Payload', { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
}
