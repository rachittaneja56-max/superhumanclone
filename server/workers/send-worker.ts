import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import pino from "pino";
import { emails, users } from "../db/schema";
import { invalidateMailCache } from "../cache";
import { sendEmail as corsairSendEmail } from "../corsair/client";
import { redactSensitiveForClient } from "@/lib/email-client";

const logger = pino();

const SendPayloadSchema = z.object({
  userId: z.string(),
  undoToken: z.string().uuid(),
});

type SendJobDeps = {
  db: any;
  redis: any;
};

export async function processSendJob(payload: unknown, deps: SendJobDeps) {
  const parsed = SendPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, error: "Invalid payload" };
  }

  const { userId, undoToken } = parsed.data;
  const undoKey = `undo:send:${userId}:${undoToken}`;
  const lockKey = `undo:send:lock:${userId}:${undoToken}`;
  const jobKey = `sendjob:${userId}:${undoToken}`;

  const claimed = await deps.redis.setnx(lockKey, "1");
  if (!claimed) {
    return { status: "skipped", reason: "already_processing" as const };
  }
  await deps.redis.expire(lockKey, 60).catch(() => null);

  const payloadStr = await deps.redis.get(undoKey);
  if (!payloadStr) {
    await deps.redis.del(lockKey).catch(() => null);
    await deps.redis.del(jobKey).catch(() => null);
    return { status: "skipped", reason: "expired_or_cancelled" as const };
  }

  const payloadData = typeof payloadStr === "string" ? JSON.parse(payloadStr) : payloadStr;

  const me = await deps.db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true, name: true },
  });

  const sendResult = await corsairSendEmail(userId, {
    to: payloadData.to,
    cc: payloadData.cc,
    bcc: payloadData.bcc,
    subject: payloadData.subject,
    body: payloadData.body,
    threadId: payloadData.threadId,
  });

  if (sendResult.needsConnect) {
    await deps.redis.del(lockKey).catch(() => null);
    return { status: "needs_connect" as const };
  }

  await deps.redis.del(undoKey).catch(() => null);
  await deps.redis.del(lockKey).catch(() => null);
  await deps.redis.del(jobKey).catch(() => null);

  const sentMessageId = sendResult?.data?.id || sendResult?.data?.messageId || crypto.randomUUID();
  await deps.db.insert(emails).values({
    userId,
    corsair_message_id: sentMessageId,
    thread_id: payloadData.threadId || sentMessageId,
    from_address: me?.email || "me@aethra.local",
    from_name: me?.name || "Me",
    to_address: Array.isArray(payloadData.to) ? payloadData.to.join(", ") : payloadData.to,
    subject: payloadData.subject,
    snippet: redactSensitiveForClient(payloadData.body).slice(0, 180),
    body_text: payloadData.body,
    body_html: `<pre style="white-space:pre-wrap;font-family:inherit">${payloadData.body.replace(/[&<>]/g, (ch: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] || ch))}</pre>`,
    is_read: true,
    is_archived: false,
    is_deleted: false,
    ai_triage_skipped: true,
  }).onConflictDoNothing();

  await invalidateMailCache(deps.redis, userId).catch(() => null);

  const ablyKey = process.env.ABLY_API_KEY;
  if (ablyKey) {
    await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(ablyKey).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "mail:sent",
        data: {
          mailbox: "sent",
          threadId: payloadData.threadId ?? null,
          delta: 1,
        },
      }),
    }).catch((err) => logger.warn({ err }, "Ably send event failed"));
  }

  return { status: "sent" as const };
}

export async function POST(req: Request) {
  try {
    const secret = process.env.WORKER_SECRET;
    if (secret && req.headers.get("x-worker-secret") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const result = await processSendJob(payload, {
      db: (await import("../db/worker-index")).workerDb,
      redis: (await import("../redis")).redis,
    });

    if (result.status === 400) {
      return new Response("Invalid Payload", { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error processing send job");
    return new Response("Internal Server Error", { status: 500 });
  }
}
