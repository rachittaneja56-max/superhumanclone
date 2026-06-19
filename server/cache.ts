import 'server-only';
import type { Redis } from '@upstash/redis';

const SETTINGS_TTL = 300;      // was 60 — settings rarely change
const MAILBOX_TTL = 120;        // was 30 — version-based, stale impossible
const UNREAD_TTL = 120;         // was 30 — version-based, stale impossible
const THREAD_TTL = 600;         // was 300 — thread content is stable
const CALENDAR_TTL = 300;       // was 60 — events don't change every minute
const VERSION_TTL = 60 * 60 * 24 * 7;


export function settingsVersionKey(userId: string) {
  return `user:${userId}:settings:v1:version`;
}

export function mailVersionKey(userId: string) {
  return `user:${userId}:mail:v1:version`;
}

export function calendarVersionKey(userId: string) {
  return `user:${userId}:calendar:v1:version`;
}

export function settingsCacheKey(userId: string, version: string | number) {
  return `user:${userId}:settings:v1:${version}`;
}

export function mailboxCacheKey(userId: string, folder: string, version: string | number, limit: number, offset: number, query: string, pageToken = '') {
  return `user:${userId}:mailbox:${folder}:v1:${version}:${limit}:${offset}:${encodeURIComponent(query.trim().toLowerCase())}:${encodeURIComponent(pageToken)}`;
}

export function unreadCountsCacheKey(userId: string, version: string | number) {
  return `user:${userId}:unreadCounts:v1:${version}`;
}

export function threadCacheKey(userId: string, threadId: string, version: string | number) {
  return `user:${userId}:thread:${threadId}:v1:${version}`;
}

export function calendarCacheKey(
  userId: string,
  version: string | number,
  startDate: string,
  endDate: string
) {
  return `user:${userId}:calendar:v1:${version}:${encodeURIComponent(startDate)}:${encodeURIComponent(endDate)}`;
}

async function bumpVersion(redis: Redis, key: string) {
  await redis.incr(key);
  await redis.expire(key, VERSION_TTL).catch(() => null);
}

export async function invalidateSettingsCache(redis: Redis, userId: string) {
  await bumpVersion(redis, settingsVersionKey(userId));
}

export async function invalidateMailCache(redis: Redis, userId: string) {
  await bumpVersion(redis, mailVersionKey(userId));
}

export async function invalidateCalendarCache(redis: Redis, userId: string) {
  await bumpVersion(redis, `user:${userId}:calendar:v1:version`);
}

// ── Connection-state cache (90s TTL per plugin) ──────────────────
const CONN_STATE_TTL = 90;

export function connStateCacheKey(userId: string, plugin: 'gmail' | 'googlecalendar') {
  return `user:${userId}:conn:${plugin}:v1`;
}

export function reconcileCacheKey(userId: string) {
  return `user:${userId}:reconcile:v1`;
}

export async function invalidateConnectionCache(redis: Redis, userId: string) {
  await Promise.all([
    redis.del(connStateCacheKey(userId, 'gmail')),
    redis.del(connStateCacheKey(userId, 'googlecalendar')),
    redis.del(reconcileCacheKey(userId)),
  ]).catch(() => null);
}

export const cacheTtls = {
  settings: SETTINGS_TTL,
  mailbox: MAILBOX_TTL,
  unread: UNREAD_TTL,
  thread: THREAD_TTL,
  calendar: CALENDAR_TTL,
  connState: CONN_STATE_TTL,
};

