import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthUrl } from 'corsair/oauth'

import { getSession } from '@/lib/auth'
import { getPersistedGoogleConnectionState } from '@/server/auth/helpers'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { ensureIntegrationCredentials } from '@/server/corsair/provision'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 600,
}

function clearWorkspaceFlowCookie(res: NextResponse) {
  res.cookies.delete('oauth_flow')
  return res
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const provider = req.nextUrl.searchParams.get('provider')
  const flow = req.nextUrl.searchParams.get('flow')
  if (!provider) {
    return NextResponse.redirect(new URL('/onboarding/connect?error=missing_provider', req.url))
  }

  const redirectUri = getCorsairCallbackUrl(req)

  try {
    await ensureIntegrationCredentials()
    const { corsair } = await import('@/corsair')

    let targetProvider: 'gmail' | 'googlecalendar'
    let nextFlow: string | null = flow ?? null

    if (provider === 'workspace') {
      const connectionState = await getPersistedGoogleConnectionState(userId)
      if (!connectionState.gmailConnected) {
        targetProvider = 'gmail'
      } else if (!connectionState.calendarConnected) {
        targetProvider = 'googlecalendar'
      } else {
        targetProvider = 'gmail'
      }
      nextFlow = 'workspace'
    } else if (provider === 'gmail' || provider === 'googlecalendar') {
      targetProvider = provider
    } else {
      return NextResponse.redirect(new URL('/onboarding/connect?error=invalid_provider', req.url))
    }

    const { url, state } = await generateOAuthUrl(corsair, targetProvider, { tenantId: userId, redirectUri })
    const res = NextResponse.redirect(url)
    res.cookies.set('oauth_state', state, COOKIE_OPTS)

    if (nextFlow) {
      res.cookies.set('oauth_flow', nextFlow, COOKIE_OPTS)
    } else {
      clearWorkspaceFlowCookie(res)
    }

    return res
  } catch (err: any) {
    console.error('[OAuth Connect] Failed to generate OAuth URL:', err)
    return NextResponse.redirect(new URL('/onboarding/connect?error=connect_failed', req.url))
  }
}
