import { NextResponse, type NextRequest } from 'next/server'
import { createCsrfMiddleware } from '@edge-csrf/nextjs'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/auth'

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

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith('/inbox') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/onboarding')
  )
}

export default async function middleware(req: NextRequest) {
  let csrfResponse;
  if (!req.headers.has('next-action')) {
    csrfResponse = await csrfProtect(req)
    if (csrfResponse.status === 403) return csrfResponse
  } else {
    // Next.js Server Actions have built-in CSRF protection based on Origin/Host headers
    // Still run csrfProtect to set the token cookie, but ignore 403s
    csrfResponse = await csrfProtect(req)
  }

  const res = NextResponse.next()
  
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  const userId = session.userId

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https:;
    worker-src 'self' blob:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https: *.googleusercontent.com;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' wss://*.ably.io https://*.ably.io https://*.railway.app;
    frame-src 'self' blob: https://challenges.cloudflare.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s{2,}/g, " ").trim()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  if (process.env.NODE_ENV === 'production') {
    requestHeaders.set('Content-Security-Policy', csp)
  }

  if (isProtectedPath(req.nextUrl.pathname)) {
    if (!userId) {
      const loginUrl = new URL('/login', req.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  
  const csrfCookie = csrfResponse?.headers.get('set-cookie')
  if (csrfCookie) {
    response.headers.append('set-cookie', csrfCookie)
  }

  // Copy session cookie to the response if it was modified
  const sessionCookie = res.headers.get('set-cookie')
  if (sessionCookie) {
    response.headers.append('set-cookie', sessionCookie)
  }

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', csp)
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}