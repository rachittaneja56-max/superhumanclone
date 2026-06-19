// server/auth/helpers.ts
import 'server-only'
import { db } from '@/server/db'
import { invalidateSettingsCache, invalidateConnectionCache, reconcileCacheKey, cacheTtls } from '@/server/cache'
import { redis } from '@/server/redis'
import { ensureSafeUserSettings, saveSafeUserSettings } from '@/server/db/user-settings-compat'
import { isAdminUser } from '@/server/admin/access-utils'

export async function ensureUserSettings(userId: string): Promise<void> {
  await ensureSafeUserSettings(userId)
}

export async function expireUserHITLActions(userId: string): Promise<void> {
  const { hitlActions } = await import('@/server/db/schema')
  const { eq, and } = await import('drizzle-orm')
  await db.update(hitlActions)
    .set({ status: 'expired' })
    .where(
      and(
        eq(hitlActions.userId, userId),
        eq(hitlActions.status, 'pending')
      )
    )
}

export async function reconcileGoogleConnectionState(userId: string) {
  // Check Redis cache first — skip the two live Google API probes on repeated navigations
  const cacheKey = reconcileCacheKey(userId)
  try {
    const cached = await redis.get<string>(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached) as { gmailConnected: boolean; calendarConnected: boolean }
      if (typeof parsed?.gmailConnected === 'boolean') {
        return parsed
      }
    }
  } catch {
    // Redis unavailable or bad data — fall through to live probe
  }

  await ensureUserSettings(userId)

  const { isUserConnected } = await import('@/server/corsair/client')

  const [gmailConnected, calendarConnected] = await Promise.all([
    isUserConnected(userId, 'gmail'),
    isUserConnected(userId, 'googlecalendar'),
  ])

  await saveSafeUserSettings(userId, {
    gmailConnected,
    calendarConnected,
  })

  await invalidateSettingsCache(redis, userId).catch(() => null)

  // Cache the reconciled result for 90 seconds
  await redis.set(cacheKey, JSON.stringify({ gmailConnected, calendarConnected }), {
    ex: cacheTtls.connState,
  }).catch(() => null)

  return { gmailConnected, calendarConnected }
}

export { isAdminUser }
