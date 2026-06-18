import "server-only";

import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { invalidateCalendarCache, invalidateMailCache } from "@/server/cache";
import { createCalendarEvent, sendEmail } from "@/server/corsair/client";
import { db as defaultDb } from "../db";
import { auditLogs, emails, hitlActions, users } from "../db/schema";
import { sanitisePayload } from "@/lib/sanitise-payload";
import { redis as defaultRedis } from "../redis";
import { mapHitlActionForClient, mapHitlPayloadForClient, type SafeHitlAction } from "../ai/agents/action-agent";
import type { Redis } from "@upstash/redis";
import { redactSensitiveForClient } from "@/lib/email-client";

const PRIVATE_HITL_TTL_SECONDS = 60 * 5;

const sendEmailProposalSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().max(240).default(""),
  body: z.string().max(20000).default(""),
  threadId: z.string().optional(),
});

const createEventProposalSchema = z.object({
  title: z.string().min(1).max(240),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.string().email()).default([]),
  description: z.string().max(4000).optional(),
  location: z.string().max(240).optional(),
  addMeetLink: z.boolean().default(true),
});

type HitlDeps = {
  db?: typeof defaultDb;
  redis?: Redis;
};

function getPrivatePayloadKey(actionId: string) {
  return `hitl:private:${actionId}`;
}

async function publishHitlCard(userId: string, safeCard: SafeHitlAction) {
  if (!process.env.ABLY_API_KEY) {
    return;
  }

  const base64Key = Buffer.from(process.env.ABLY_API_KEY).toString("base64");

  await fetch(`https://rest.ably.io/channels/private:user-${userId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${base64Key}`,
    },
    body: JSON.stringify({
      name: "hitl:action",
      data: safeCard,
    }),
  }).catch(() => undefined);
}

export async function createHitlProposal(
  userId: string,
  sessionId: string | null,
  action: { actionType: string; payload: Record<string, unknown>; humanReadable: string },
  deps: HitlDeps = {},
): Promise<{ actionId: string; safeCard: SafeHitlAction }> {
  const db = deps.db ?? defaultDb;
  const redis = deps.redis ?? defaultRedis;
  const expiresAt = new Date(Date.now() + PRIVATE_HITL_TTL_SECONDS * 1000);
  const safePayload = mapHitlPayloadForClient(action.actionType, action.payload ?? {});

  const [row] = await db.insert(hitlActions).values({
    userId,
    action_type: action.actionType,
    payload: action.payload ?? {},
    status: "pending",
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

  await redis.set(getPrivatePayloadKey(actionId), JSON.stringify(action.payload ?? {}), {
    ex: PRIVATE_HITL_TTL_SECONDS,
  });
  await redis.set(`hitl:pending:${actionId}`, safeCard, { ex: PRIVATE_HITL_TTL_SECONDS });

  await db.insert(auditLogs).values({
    userId,
    action: "hitl_created",
    details: sanitisePayload({
      actionType: action.actionType,
      sessionId,
      riskLevel: safeCard.riskLevel,
      payload: safePayload,
    }),
  }).catch(() => undefined);

  await publishHitlCard(userId, safeCard);

  return { actionId, safeCard };
}

export async function executeApprovedHitlAction(
  userId: string,
  actionId: string,
  deps: HitlDeps = {},
) {
  const db = deps.db ?? defaultDb;
  const redis = deps.redis ?? defaultRedis;

  const row = await db.query.hitlActions.findFirst({
    where: and(eq(hitlActions.id, actionId), eq(hitlActions.userId, userId)),
  });

  if (!row) {
    throw new Error("HITL action not found");
  }

  const rawPrivatePayload = await redis.get<string>(getPrivatePayloadKey(actionId));
  const privatePayload = rawPrivatePayload
    ? (JSON.parse(rawPrivatePayload) as Record<string, unknown>)
    : (row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : null);

  if (!privatePayload) {
    throw new Error("HITL action payload expired");
  }

  if (row.action_type === "send_email") {
    const payload = sendEmailProposalSchema.parse(privatePayload);
    const result = await sendEmail(userId, payload);
    if (result.needsConnect) {
      throw new Error("gmail_not_connected");
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true, name: true },
    });
    const sentMessageId = result?.data?.id || result?.data?.messageId || crypto.randomUUID();

    await db.insert(emails).values({
      userId,
      corsair_message_id: sentMessageId,
      thread_id: payload.threadId || sentMessageId,
      from_address: currentUser?.email || "me@aethra.local",
      from_name: currentUser?.name || "Me",
      to_address: payload.to.join(", "),
      subject: payload.subject,
      snippet: redactSensitiveForClient(payload.body).slice(0, 180),
      body_text: payload.body,
      body_html: `<pre style="white-space:pre-wrap;font-family:inherit">${payload.body.replace(/[&<>]/g, (ch: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] || ch))}</pre>`,
      is_read: true,
      is_archived: false,
      is_deleted: false,
      ai_triage_skipped: true,
    }).onConflictDoNothing();

    await invalidateMailCache(redis, userId).catch(() => null);
  } else if (row.action_type === "create_event") {
    const payload = createEventProposalSchema.parse(privatePayload);
    const result = await createCalendarEvent(userId, payload);
    if (result.needsConnect) {
      throw new Error("calendar_not_connected");
    }

    await invalidateCalendarCache(redis, userId).catch(() => null);
  }

  await redis.del(getPrivatePayloadKey(actionId)).catch(() => null);
  await redis.del(`hitl:pending:${actionId}`).catch(() => null);

  await db.insert(auditLogs).values({
    userId,
    action: "hitl_resolved",
    details: sanitisePayload({
      actionId,
      actionType: row.action_type,
      executed: true,
    }),
  }).catch(() => undefined);
}

export async function hitlInterceptor(
  userId: string,
  sessionId: string | null,
  action: { actionType: string; payload: Record<string, unknown>; humanReadable: string },
) {
  return createHitlProposal(userId, sessionId, action);
}
