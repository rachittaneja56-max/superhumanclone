import { processOAuthCallback } from 'corsair/oauth'
import { corsair } from '@/corsair'
import { NextResponse, NextRequest } from 'next/server'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { syncInboxIfEmpty } from '@/server/corsair/sync'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'
import { ensureSafeUserSettings, getSafeUserSettings } from '@/server/db/user-settings-compat'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')

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

    // tenantId is embedded in the signed OAuth state
    const userId = result.tenantId
    let liveState = { gmailConnected: false, calendarConnected: false }

    if (userId) {
      await ensureTenantProvisioned(userId)
      await ensureSafeUserSettings(userId)

      if (result.plugin === 'gmail') {
        // Start the initial mailbox sync without blocking the redirect.
        void syncInboxIfEmpty(userId).catch((err) =>
          console.error('[OAuth] Initial inbox sync failed:', err)
        )
      }

      liveState = await reconcileGoogleConnectionState(userId).catch((err) => {
        console.error('[OAuth] Failed to reconcile connection state:', err)
        return { gmailConnected: false, calendarConnected: false }
      })
    }

    const settings = userId ? await getSafeUserSettings(userId).catch(() => null) : null

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

    return NextResponse.redirect(new URL(`/onboarding/connect?error=connection_not_confirmed&plugin=${encodeURIComponent(result.plugin)}`, req.url))
  } catch (error: any) {
    console.error('OAuth Callback Error')
    return NextResponse.redirect(new URL('/onboarding/connect?error=callback_failed', req.url))
  }
}
