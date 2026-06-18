import 'server-only'

import { redis } from '@/server/redis'

const ADMIN_UNLOCK_TTL_SECONDS = 60 * 60 * 4

function getAdminUnlockKey(sessionId: string) {
  return `auth:admin-unlocked:${sessionId}`
}

export async function markAdminSessionUnlocked(sessionId: string) {
  await redis.set(getAdminUnlockKey(sessionId), '1', { ex: ADMIN_UNLOCK_TTL_SECONDS })
}

export async function clearAdminSessionUnlocked(sessionId: string | null | undefined) {
  if (!sessionId) return
  await redis.del(getAdminUnlockKey(sessionId)).catch(() => null)
}

export async function isAdminSessionUnlocked(sessionId: string | null | undefined) {
  if (!sessionId) return false

  const value = await redis.get<string | number | boolean>(getAdminUnlockKey(sessionId)).catch(() => null)
  return value === '1' || value === 1 || value === true
}
