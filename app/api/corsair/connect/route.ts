import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGmailAuthUrl, getCalendarAuthUrl } from '@/server/corsair/client'
import { ensureTenantProvisioned } from '@/server/corsair/provision'

export async function GET(req: NextRequest) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/corsair/callback`

  try {
    await ensureTenantProvisioned(userId)

    let authUrl = ''
    if (provider === 'gmail') {
      authUrl = await getGmailAuthUrl(userId, redirectUri)
    } else if (provider === 'googlecalendar') {
      authUrl = await getCalendarAuthUrl(userId, redirectUri)
    } else {
      return NextResponse.redirect(new URL('/onboarding/connect?error=invalid_provider', req.url))
    }

    return NextResponse.redirect(authUrl)
  } catch (err: any) {
    console.error('Failed to generate OAuth URL:', err)
    return NextResponse.redirect(
      new URL(`/onboarding/connect?error=${encodeURIComponent(err.message || 'auth_url_failed')}`, req.url)
    )
  }
}
