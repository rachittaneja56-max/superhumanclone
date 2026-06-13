import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createCsrfMiddleware } from '@edge-csrf/nextjs'
import { neon } from '@neondatabase/serverless'

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

const csrfProtect = createCsrfMiddleware({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    name: '__Host-csrf',
    sameSite: 'lax' as const,
    httpOnly: true,
  },
  excludePathPrefixes: [
    '/api/auth/',
    '/api/webhooks/',
    '/api/trpc/',
  ],
})

const APP_ROUTES = [
  '/inbox',
  '/calendar',
  '/agent',
  '/search',
  '/settings',
]

const ONBOARDING_ROUTES = [
  '/onboarding',
]

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/api/auth',
  '/api/webhooks',
  '/api/trpc',
  '/api/corsair/callback',
  '/onboarding',
]

export default auth(async function middleware(req) {
  const { pathname } = req.nextUrl
  const session = (req as any).auth

  const csrfResponse = await csrfProtect(req)
  if (csrfResponse.status === 403) return csrfResponse

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' wss://*.ably.io https://*.ably.io https://*.railway.app;
    frame-src blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s{2,}/g, " ").trim()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  if (process.env.NODE_ENV === 'production') {
    requestHeaders.set('Content-Security-Policy', csp)
  }

  const isAppRoute = APP_ROUTES.some(r => pathname.startsWith(r))
  const isOnboardingRoute = ONBOARDING_ROUTES.some(r => pathname.startsWith(r))

  if ((isAppRoute || isOnboardingRoute) && !session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAppRoute && session?.user?.id) {
    try {
      const sql = neon(process.env.DATABASE_URL!)
      const result = await sql`
        SELECT
          onboarding_completed,
          gmail_connected
        FROM user_settings
        WHERE user_id = ${session.user.id}
        LIMIT 1
      `

      const settings = result[0]

      if (!settings) {
        return NextResponse.redirect(new URL('/onboarding/privacy', req.url))
      }

      if (!settings.onboarding_completed) {
        return NextResponse.redirect(new URL('/onboarding/privacy', req.url))
      }

      if (!settings.gmail_connected) {
        return NextResponse.redirect(new URL('/onboarding/connect', req.url))
      }
    } catch (error) {
      console.error('Middleware settings check failed:', error)
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', csp)
  }
  return response
})
    