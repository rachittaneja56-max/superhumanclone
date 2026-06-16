import { z } from 'zod';
import { workerDb } from '../db/worker-index';
import { redis } from '../redis';
import { emails, aiConsentRules, autoReplyDrafts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { isDomainBlocked } from '@/lib/domain-matcher';
import { classifyEmail, generateTLDR, generateAutoReplies, generateEmbedding } from '../ai/provider';
import pino from 'pino';

const logger = pino();

const TriagePayloadSchema = z.object({
  userId: z.string(),
  emailId: z.string().uuid(),
  corsairMessageId: z.string(),
  fromAddress: z.string(),
  subject: z.string(),
  snippet: z.string(),
  bodyText: z.string().nullable(),
});

export async function processTriageJob(payload: unknown) {
  const startTime = Date.now();
  
  // 1. Validate input with Zod.
  const parsed = TriagePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, error: 'Invalid payload' };
  }
  const data = parsed.data;
  const { userId, emailId, corsairMessageId, fromAddress, subject, snippet, bodyText } = data;

  // 2. PRIVACY GATE
  const domain = fromAddress.split('@')[1] ?? '';
  const versionStr = await redis.get<string>(`consent_version:${userId}`) ?? '0';
  const cacheKey = `consent:${userId}:${domain}:${versionStr}`;
  const cached = await redis.get<string>(cacheKey);

  let isBlocked: boolean;
  if (cached !== null) {
    isBlocked = cached === 'blocked';
  } else {
    const rules = await workerDb.query.aiConsentRules.findMany({
      where: eq(aiConsentRules.userId, userId),
    });
    isBlocked = isDomainBlocked(fromAddress, rules.map(r => ({ pattern: r.pattern, isBlocked: r.isBlocked })));
    await redis.set(cacheKey, isBlocked ? 'blocked' : 'allowed', { ex: 3600 });
  }

  if (isBlocked) {
    console.log({ event: 'triage_skipped_privacy_gate', emailId, userId: userId.slice(0, 8) });
    return { status: 'skipped', reason: 'privacy_gate' };
  }

  // 3. Check token budget (circuit breaker)
  const budgetKey = 'tokens:' + userId + ':' + new Date().toISOString().slice(0, 10);
  const current = parseInt((await redis.get<string>(budgetKey)) ?? '0');
  const limit = parseInt(process.env.AI_DAILY_TOKEN_LIMIT ?? '100000');
  if (current > limit) {
    console.log({ event: 'triage_skipped_budget', emailId });
    return { status: 'skipped', reason: 'budget' };
  }

  // 4. classifyEmail
  const { tag, priority } = await classifyEmail(subject, snippet);
  await workerDb.update(emails)
    .set({ tag, priority })
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)));

  // 5. generateTLDR
  const content = bodyText ?? snippet;
  const tldr = await generateTLDR(subject, content);
  await workerDb.update(emails)
    .set({ tldr })
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)));

  // 6. generateAutoReplies
  const replies = await generateAutoReplies(subject, content);
  await workerDb.insert(autoReplyDrafts)
    .values([
      { userId, emailId, reply_text: replies.direct, status: 'draft' },
      { userId, emailId, reply_text: replies.warm, status: 'draft' },
      { userId, emailId, reply_text: replies.boundary, status: 'draft' },
    ])
    .onConflictDoNothing();

  // 7. generateEmbedding
  const embedding = await generateEmbedding(subject + ' ' + snippet);
  await workerDb.update(emails)
    .set({ embedding })
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)));

  // 8. UPDATE emails SET ai_triage_skipped=false
  await workerDb.update(emails)
    .set({ ai_triage_skipped: false })
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)));

  // 9. Increment token budget
  const estimatedTokensUsed = 1000; // Simple estimation
  await redis.incrby(budgetKey, estimatedTokensUsed);
  await redis.expire(budgetKey, 86400);

  // 10. Invalidate contact cache
  await redis.del('contact:' + userId + ':' + fromAddress);

  // 11. Publish Ably real-time event
  const ablyKey = process.env.ABLY_API_KEY;
  if (ablyKey) {
    await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(ablyKey).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'email:triaged', data: { emailId, tag, priority, tldr: tldr.slice(0, 100) } })
    });
  }

  // 12. Pino structured log
  logger.info({
    event: 'triage_complete',
    emailId,
    durationMs: Date.now() - startTime,
    tag,
    priority,
    userId: userId.slice(0, 8)
  });

  return { status: 'completed' };
}

// Next.js Edge/Node Route compatibility wrapper if it gets exposed directly
export async function POST(req: Request) {
  try {
    const secret = process.env.WORKER_SECRET
    if (secret && req.headers.get('x-worker-secret') !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await req.json();
    const result = await processTriageJob(payload);
    if (result.status === 400) {
      return new Response('Invalid Payload', { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error processing triage job');
    return new Response('Internal Server Error', { status: 500 });
  }
}
