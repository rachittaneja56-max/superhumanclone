import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/server/db'
import { corsairAccounts, corsairIntegrations } from '@/server/db/schema'
import { invalidateSettingsCache, reconcileCacheKey, cacheTtls } from '@/server/cache'
import { redis } from '@/server/redis'
import { ensureSafeUserSettings, saveSafeUserSettings } from '@/server/db/user-settings-compat'
import { isAdminUser } from '@/server/admin/access-utils'

export type GoogleConnectionState = {
  gmailConnected: boolean
  calendarConnected: boolean
}

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

export async function getPersistedGoogleConnectionState(userId: string): Promise<GoogleConnectionState> {
  const rows = await db
    .select({
      integrationName: corsairIntegrations.name,
      accountId: corsairAccounts.id,
    })
    .from(corsairAccounts)
    .innerJoin(corsairIntegrations, eq(corsairAccounts.integrationId, corsairIntegrations.id))
    .where(
      and(
        eq(corsairAccounts.tenantId, userId),
        inArray(corsairIntegrations.name, ['gmail', 'googlecalendar'])
      )
    )

  const gmailRows = rows.filter((row) => row.integrationName === 'gmail')
  const calendarRows = rows.filter((row) => row.integrationName === 'googlecalendar')

  if (gmailRows.length > 1 || calendarRows.length > 1) {
    console.warn('[Google Connection] Duplicate Corsair account rows detected', {
      userId: userId.slice(0, 8),
      gmailRows: gmailRows.length,
      calendarRows: calendarRows.length,
    })
  }

  return {
    gmailConnected: gmailRows.length > 0,
    calendarConnected: calendarRows.length > 0,
  }
}

export async function reconcileGoogleConnectionState(userId: string): Promise<GoogleConnectionState> {
  const cacheKey = reconcileCacheKey(userId)
  try {
    const cached = await redis.get<string>(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached) as GoogleConnectionState
      if (typeof parsed?.gmailConnected === 'boolean' && typeof parsed?.calendarConnected === 'boolean') {
        return parsed
      }
    }
  } catch {
    // Redis unavailable or bad data - fall through to DB truth.
  }

  await ensureUserSettings(userId)

  const persisted = await getPersistedGoogleConnectionState(userId)

  await saveSafeUserSettings(userId, persisted)
  await invalidateSettingsCache(redis, userId).catch(() => null)

  await redis.set(cacheKey, JSON.stringify(persisted), {
    ex: cacheTtls.connState,
  }).catch(() => null)

  return persisted
}

export { isAdminUser }
