import { processOAuthCallback } from 'corsair/oauth'
import { corsair } from '@/corsair'
import { NextResponse, NextRequest } from 'next/server'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { syncInboxIfEmpty } from '@/server/corsair/sync'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { isUserConnected } from '@/server/corsair/client'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const flow = req.nextUrl.searchParams.get('flow')

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
        // Seed local emails table on first connect
        await syncInboxIfEmpty(userId).catch((err) =>
          console.error('[OAuth] Initial inbox sync failed:', err)
        )
      }
    }

    const workspaceFlow = flow === 'workspace'

    if (workspaceFlow && result.plugin === 'gmail') {
      const calendarConnected = await isUserConnected(userId, 'googlecalendar')
      if (!calendarConnected) {
        return NextResponse.redirect(
          new URL('/api/corsair/connect?provider=googlecalendar&flow=workspace', req.url)
        )
      }
    }

    return NextResponse.redirect(
      new URL(`/onboarding/connect?connected=true&plugin=${encodeURIComponent(result.plugin)}&flow=${workspaceFlow ? 'workspace' : ''}`, req.url)
    )
  } catch (error: any) {
    console.error('OAuth Callback Error:', error)
    return NextResponse.redirect(new URL('/onboarding/connect?error=' + encodeURIComponent(error.message), req.url))
  }
}
