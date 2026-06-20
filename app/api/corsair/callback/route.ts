import { processOAuthCallback } from 'corsair/oauth'
import { NextRequest, NextResponse } from 'next/server'

import { corsair } from '@/corsair'
import { getPersistedGoogleConnectionState } from '@/server/auth/helpers'
import { invalidateConnectionCache, invalidateSettingsCache } from '@/server/cache'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { syncInboxIfEmpty } from '@/server/corsair/sync'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { redis } from '@/server/redis'
import { ensureSafeUserSettings, getSafeUserSettings, saveSafeUserSettings } from '@/server/db/user-settings-compat'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 600,
}

function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.delete('oauth_state')
  res.cookies.delete('oauth_flow')
  return res
}

function keepWorkspaceFlow(res: NextResponse): NextResponse {
  res.cookies.set('oauth_flow', 'workspace', COOKIE_OPTS)
  return res
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const flow = req.cookies.get('oauth_flow')?.value ?? null

  if (!code || !state) {
    return clearAuthCookies(NextResponse.redirect(new URL('/onboarding/connect?error=missing_params', req.url)))
  }

  const redirectUri = getCorsairCallbackUrl(req)

  try {
    const result = await processOAuthCallback(corsair, { code, state, redirectUri })
    const userId = result.tenantId

    if (!userId) {
      return clearAuthCookies(NextResponse.redirect(new URL('/onboarding/connect?error=no_tenant', req.url)))
    }

    await ensureTenantProvisioned(userId)
    await ensureSafeUserSettings(userId)

    if (result.plugin === 'gmail') {
      void syncInboxIfEmpty(userId).catch((err) =>
        console.error('[OAuth] Initial inbox sync failed:', err)
      )
    }

    await saveSafeUserSettings(userId, {
      ...(result.plugin === 'gmail' ? { gmailConnected: true } : {}),
      ...(result.plugin === 'googlecalendar' ? { calendarConnected: true } : {}),
    })

    await Promise.all([
      invalidateSettingsCache(redis, userId),
      invalidateConnectionCache(redis, userId),
    ]).catch(() => null)

    if (flow === 'workspace' && result.plugin === 'gmail') {
      const nextUrl = new URL('/api/corsair/connect', req.url)
      nextUrl.searchParams.set('provider', 'googlecalendar')
      nextUrl.searchParams.set('flow', 'workspace')
      return keepWorkspaceFlow(NextResponse.redirect(nextUrl))
    }

    const connectionState = await getPersistedGoogleConnectionState(userId)
    await saveSafeUserSettings(userId, connectionState)

    const settings = await getSafeUserSettings(userId).catch(() => null)
    const allConnected = connectionState.gmailConnected && connectionState.calendarConnected

    if (flow === 'workspace' && result.plugin === 'googlecalendar' && allConnected) {
      await saveSafeUserSettings(userId, { onboardingCompleted: true })
      const target = settings?.privacyConfigured
        ? new URL('/dashboard', req.url)
        : new URL('/onboarding/privacy', req.url)
      return clearAuthCookies(NextResponse.redirect(target))
    }

    if (allConnected) {
      const target = settings?.privacyConfigured
        ? new URL('/dashboard', req.url)
        : new URL('/onboarding/privacy', req.url)
      return clearAuthCookies(NextResponse.redirect(target))
    }

    return clearAuthCookies(
      NextResponse.redirect(
        new URL(`/onboarding/connect?connected=true&plugin=${encodeURIComponent(result.plugin)}`, req.url)
      )
    )
  } catch (error: any) {
    console.error('[OAuth Callback] Error:', error?.message ?? error)
    return clearAuthCookies(NextResponse.redirect(new URL('/onboarding/connect?error=callback_failed', req.url)))
  }
}
