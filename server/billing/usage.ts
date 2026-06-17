import "server-only";

import type { Redis } from "@upstash/redis";

export type UsageKind = "ai" | "email-triage";

const USAGE_TTL_SECONDS = 60 * 60 * 24 * 40;

export function usageMonth(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function aiUsageKey(userId: string, date = new Date()) {
  return `usage:${userId}:ai:${usageMonth(date)}`;
}

export function emailTriageUsageKey(userId: string, date = new Date()) {
  return `usage:${userId}:email-triage:${usageMonth(date)}`;
}

export function usageKey(userId: string, kind: UsageKind, date = new Date()) {
  return kind === "ai" ? aiUsageKey(userId, date) : emailTriageUsageKey(userId, date);
}

export async function incrementUsage(redis: Redis, userId: string, kind: UsageKind, amount = 1) {
  const key = usageKey(userId, kind);
  const next = amount === 1 ? await redis.incr(key) : await redis.incrby(key, amount);
  await redis.expire(key, USAGE_TTL_SECONDS).catch(() => null);
  return next;
}

export async function getUsage(redis: Redis, userId: string, kind: UsageKind) {
  const raw = await redis.get<number | string>(usageKey(userId, kind));
  return Number(raw ?? 0);
}

export async function resetUsage(redis: Redis, userId: string, kind: UsageKind) {
  await redis.del(usageKey(userId, kind));
}
