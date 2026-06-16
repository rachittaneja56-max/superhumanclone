import 'server-only';
import type { Redis } from '@upstash/redis';

const SETTINGS_TTL = 60;
const MAILBOX_TTL = 30;
const UNREAD_TTL = 30;
const THREAD_TTL = 300;
const VERSION_TTL = 60 * 60 * 24 * 7;

export function settingsVersionKey(userId: string) {
  return `user:${userId}:settings:v1:version`;
}

export function mailVersionKey(userId: string) {
  return `user:${userId}:mail:v1:version`;
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

export const cacheTtls = {
  settings: SETTINGS_TTL,
  mailbox: MAILBOX_TTL,
  unread: UNREAD_TTL,
  thread: THREAD_TTL,
};
