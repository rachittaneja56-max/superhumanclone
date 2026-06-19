import { processOAuthCallback } from 'corsair/oauth'
import { corsair } from '@/corsair'
import { NextResponse, NextRequest } from 'next/server'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { syncInboxIfEmpty } from '@/server/corsair/sync'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'
import { invalidateConnectionCache, invalidateSettingsCache } from '@/server/cache'
import { redis } from '@/server/redis'
import { ensureSafeUserSettings, getSafeUserSettings, saveSafeUserSettings } from '@/server/db/user-settings-compat'

import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  
  const cookieStore = await cookies()
  const flow = req.nextUrl.searchParams.get('flow') || cookieStore.get('oauth_flow')?.value
  
  // Clear the cookie if it exists
  if (cookieStore.has('oauth_flow')) {
    cookieStore.delete('oauth_flow')
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/onboarding/connect?error=missing_params', req.url))
  }

  const redirectUri = getCorsairCallbackUrl(req)

  try {
    const result = await processOAuthCallback(corsair, {
      code,
      state,
      redirectUri,
    })

    const userId = result.tenantId
    let liveState = { gmailConnected: false, calendarConnected: false }

    if (userId) {
      await ensureTenantProvisioned(userId)
      await ensureSafeUserSettings(userId)

      if (result.plugin === 'gmail') {
        void syncInboxIfEmpty(userId).catch((err) =>
          console.error('[OAuth] Initial inbox sync failed:', err)
        )
      }

      liveState = await reconcileGoogleConnectionState(userId).catch((err) => {
        console.error('[OAuth] Failed to reconcile connection state:', err)
        return { gmailConnected: false, calendarConnected: false }
      })

      await saveSafeUserSettings(userId, {
        gmailConnected: liveState.gmailConnected,
        calendarConnected: liveState.calendarConnected,
      })

      await Promise.all([
        invalidateSettingsCache(redis, userId),
        invalidateConnectionCache(redis, userId),
      ]).catch(() => null)
    }

    const settings = userId ? await getSafeUserSettings(userId).catch(() => null) : null

    if (flow === 'workspace' && userId) {
      if (result.plugin === 'gmail') {
        // The unified token with both scopes was just saved to the `gmail` plugin.
        // We now securely clone that exact row to the `googlecalendar` plugin.
        const { db } = await import('@/server/db')
        const { corsairAccounts, corsairIntegrations } = await import('@/server/db/schema')
        const { eq, and, inArray } = await import('drizzle-orm')
        
        const integrations = await db.query.corsairIntegrations.findMany({
          where: inArray(corsairIntegrations.name, ['gmail', 'googlecalendar'])
        })
        const gmailInt = integrations.find(i => i.name === 'gmail')
        const calInt = integrations.find(i => i.name === 'googlecalendar')

        if (gmailInt && calInt) {
          const gmailAccount = await db.query.corsairAccounts.findFirst({
            where: and(
              eq(corsairAccounts.tenantId, userId),
              eq(corsairAccounts.integrationId, gmailInt.id)
            )
          })

          if (gmailAccount) {
            // Remove any existing calendar account to prevent duplication errors
            await db.delete(corsairAccounts).where(
              and(
                eq(corsairAccounts.tenantId, userId),
                eq(corsairAccounts.integrationId, calInt.id)
              )
            )
            // Insert exact copy for Calendar
            await db.insert(corsairAccounts).values({
              id: crypto.randomUUID(),
              tenantId: userId,
              integrationId: calInt.id,
              config: gmailAccount.config,
              dek: gmailAccount.dek,
            })
          }
        }
        
        // Both are now securely connected
        await saveSafeUserSettings(userId, {
          gmailConnected: true,
          calendarConnected: true,
        })
        
        await Promise.all([
          invalidateSettingsCache(redis, userId),
          invalidateConnectionCache(redis, userId),
        ]).catch(() => null)
        
        if (!settings?.privacyConfigured) {
          return NextResponse.redirect(new URL('/onboarding/privacy', req.url))
        }
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }

      if (result.plugin === 'googlecalendar') {
        if (!settings?.privacyConfigured) {
          return NextResponse.redirect(new URL('/onboarding/privacy', req.url))
        }
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }

      if (liveState.gmailConnected || liveState.calendarConnected) {
        return NextResponse.redirect(new URL(`/onboarding/connect?connected=true&plugin=${encodeURIComponent(result.plugin)}&flow=workspace`, req.url))
      }
    }

    if (liveState.gmailConnected && liveState.calendarConnected) {
      if (!settings?.privacyConfigured) {
        return NextResponse.redirect(new URL('/onboarding/privacy', req.url))
      }

      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    if (liveState.gmailConnected) {
      return NextResponse.redirect(new URL(`/inbox?connected=true&plugin=${encodeURIComponent(result.plugin)}`, req.url))
    }

    if (liveState.calendarConnected) {
      return NextResponse.redirect(new URL(`/calendar?connected=true&plugin=${encodeURIComponent(result.plugin)}`, req.url))
    }

    return NextResponse.redirect(new URL(`/onboarding/connect?error=connection_not_confirmed&plugin=${encodeURIComponent(result.plugin)}${flow ? `&flow=${encodeURIComponent(flow)}` : ''}`, req.url))
  } catch (error: any) {
    console.error('OAuth Callback Error', error)
    return NextResponse.redirect(new URL('/onboarding/connect?error=callback_failed', req.url))
  }
}
