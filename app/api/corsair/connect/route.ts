import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGmailAuthUrl, getCalendarAuthUrl } from '@/server/corsair/client'
import { getCorsairCallbackUrl } from '@/server/corsair/url'

export async function GET(req: NextRequest) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')
  const flow = url.searchParams.get('flow')
  const redirectUri = getCorsairCallbackUrl(req)
  const callbackUrl = new URL(redirectUri)

  if (flow) {
    callbackUrl.searchParams.set('flow', flow)
  }

  try {
    let authUrl = ''
    if (provider === 'gmail') {
      authUrl = await getGmailAuthUrl(userId, callbackUrl.toString())
    } else if (provider === 'googlecalendar') {
      authUrl = await getCalendarAuthUrl(userId, callbackUrl.toString())
    } else if (provider === 'workspace') {
      // 1. Generate the base Gmail OAuth URL
      const baseAuthUrl = await getGmailAuthUrl(userId, callbackUrl.toString())
      
      // 2. Parse the URL to inject additional scopes
      const urlObj = new URL(baseAuthUrl)
      const currentScopes = urlObj.searchParams.get('scope') || ''
      
      // Google Calendar required scopes
      const calendarScopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ].join(' ')
      
      // 3. Append scopes and force a new refresh token
      urlObj.searchParams.set('scope', `${currentScopes} ${calendarScopes}`.trim())
      urlObj.searchParams.set('prompt', 'consent')
      urlObj.searchParams.set('access_type', 'offline')
      
      authUrl = urlObj.toString()
    } else {
      return NextResponse.redirect(new URL('/onboarding/connect?error=invalid_provider', req.url))
    }

    return NextResponse.redirect(authUrl)
  } catch (err: any) {
    console.error('Failed to generate OAuth URL', err)
    return NextResponse.redirect(
      new URL('/onboarding/connect?error=connect_failed', req.url)
    )
  }
}
