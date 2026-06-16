import { processOAuthCallback } from 'corsair/oauth'
import { corsair } from '@/corsair'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { syncInboxIfEmpty } from '@/server/corsair/sync'
import { getCorsairCallbackUrl } from '@/server/corsair/url'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')

  if (!code || !state) {
    return redirect('/onboarding/connect?error=missing_params')
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
        // Seed local emails table on first connect
        await syncInboxIfEmpty(userId).catch((err) =>
          console.error('[OAuth] Initial inbox sync failed:', err)
        )
      }
    }

    return redirect(`/onboarding/connect?connected=true&plugin=${encodeURIComponent(result.plugin)}`)
  } catch (error: any) {
    console.error('OAuth Callback Error:', error)
    return redirect('/onboarding/connect?error=' + encodeURIComponent(error.message))
  }
}
