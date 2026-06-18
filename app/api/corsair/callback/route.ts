import { processOAuthCallback } from 'corsair/oauth'
import { corsair } from '@/corsair'
import { NextResponse, NextRequest } from 'next/server'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { syncInboxIfEmpty } from '@/server/corsair/sync'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'

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
    if (userId) {
      await ensureTenantProvisioned(userId)

      if (result.plugin === 'gmail') {
        // Start the initial mailbox sync without blocking the onboarding redirect.
        void syncInboxIfEmpty(userId).catch((err) =>
          console.error('[OAuth] Initial inbox sync failed:', err)
        )
      }

      await reconcileGoogleConnectionState(userId).catch((err) => {
        console.error('[OAuth] Failed to reconcile connection state:', err)
      })
    }

    return NextResponse.redirect(new URL(`/onboarding/connect?connected=true&plugin=${encodeURIComponent(result.plugin)}`, req.url))
  } catch (error: any) {
    console.error('OAuth Callback Error')
    return NextResponse.redirect(new URL('/onboarding/connect?error=callback_failed', req.url))
  }
}
