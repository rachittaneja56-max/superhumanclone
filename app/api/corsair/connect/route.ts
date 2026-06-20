import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthUrl } from 'corsair/oauth'
import { getSession } from '@/lib/auth'
import { getCorsairCallbackUrl } from '@/server/corsair/url'
import { ensureIntegrationCredentials } from '@/server/corsair/provision'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 600, // 10 minutes
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const provider = req.nextUrl.searchParams.get('provider')
  if (!provider) {
    return NextResponse.redirect(new URL('/onboarding/connect?error=missing_provider', req.url))
  }

  // The redirect URI must match exactly what is registered in Google Cloud Console.
  // Never append extra query params — Google will reject mismatched URIs.
  const redirectUri = getCorsairCallbackUrl(req)

  try {
    await ensureIntegrationCredentials()
    const { corsair } = await import('@/corsair')

    if (provider === 'gmail') {
      const { url, state } = await generateOAuthUrl(corsair, 'gmail', { tenantId: userId, redirectUri })
      const res = NextResponse.redirect(url)
      res.cookies.set('oauth_state', state, COOKIE_OPTS)
      return res
    }

    if (provider === 'googlecalendar') {
      const { url, state } = await generateOAuthUrl(corsair, 'googlecalendar', { tenantId: userId, redirectUri })
      const res = NextResponse.redirect(url)
      res.cookies.set('oauth_state', state, COOKIE_OPTS)
      return res
    }

    if (provider === 'workspace') {
      // Generate a Gmail OAuth URL — we'll inject Calendar scopes on top so the
      // user only sees ONE Google consent screen covering both Gmail + Calendar.
      const { url, state } = await generateOAuthUrl(corsair, 'gmail', { tenantId: userId, redirectUri })

      // Inject Calendar scopes and force the full consent screen so Google
      // returns a refresh_token that covers both scopes.
      const oauthUrl = new URL(url)
      const currentScopes = oauthUrl.searchParams.get('scope') || ''
      const calendarScopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ].join(' ')
      oauthUrl.searchParams.set('scope', `${currentScopes} ${calendarScopes}`.trim())
      oauthUrl.searchParams.set('prompt', 'consent')
      oauthUrl.searchParams.set('access_type', 'offline')

      const res = NextResponse.redirect(oauthUrl.toString())
      // Store Corsair's HMAC-signed state in the cookie (required for callback verification)
      res.cookies.set('oauth_state', state, COOKIE_OPTS)
      // Store the flow type so the callback knows to clone the token to Calendar
      res.cookies.set('oauth_flow', 'workspace', { ...COOKIE_OPTS, httpOnly: false })
      return res
    }

    return NextResponse.redirect(new URL('/onboarding/connect?error=invalid_provider', req.url))
  } catch (err: any) {
    console.error('[OAuth Connect] Failed to generate OAuth URL:', err)
    return NextResponse.redirect(new URL('/onboarding/connect?error=connect_failed', req.url))
  }
}
