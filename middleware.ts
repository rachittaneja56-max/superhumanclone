import { NextResponse, type NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { createCsrfMiddleware } from '@edge-csrf/nextjs'

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

const isAppRoute = createRouteMatcher([
  '/inbox(.*)',
  '/calendar(.*)',
  '/agent(.*)',
  '/search(.*)',
  '/settings(.*)',
])

const isOnboardingRoute = createRouteMatcher([
  '/onboarding(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  let csrfResponse;
  if (!req.headers.has('next-action')) {
    csrfResponse = await csrfProtect(req)
    if (csrfResponse.status === 403) return csrfResponse
  } else {
    // Next.js Server Actions have built-in CSRF protection based on Origin/Host headers
    // Still run csrfProtect to set the token cookie, but ignore 403s
    csrfResponse = await csrfProtect(req)
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https:;
    worker-src 'self' blob:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https: clerk.com *.clerk.com;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' wss://*.ably.io https://*.ably.io https://*.railway.app clerk.com *.clerk.com *.clerk.accounts.dev https://clerk-telemetry.com;
    frame-src 'self' blob: https://challenges.cloudflare.com clerk.com *.clerk.com *.clerk.accounts.dev;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s{2,}/g, " ").trim()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  if (process.env.NODE_ENV === 'production') {
    requestHeaders.set('Content-Security-Policy', csp)
  }

  if (isAppRoute(req) || isOnboardingRoute(req)) {
    if (!userId) {
      await auth.protect()
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  
  const csrfCookie = csrfResponse?.headers.get('set-cookie')
  if (csrfCookie) {
    response.headers.append('set-cookie', csrfCookie)
  }

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', csp)
  }
  return response
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
    