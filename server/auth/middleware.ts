import NextAuth from 'next-auth';
import authConfig from './config';
import { createCsrfMiddleware } from '@edge-csrf/nextjs';
import { NextResponse, type NextRequest } from 'next/server';

const { auth } = NextAuth(authConfig);

const csrfMiddleware = createCsrfMiddleware({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    name: '__Host-csrf',
    sameSite: 'lax',
    httpOnly: true,
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  excludePathPrefixes: [
    '/api/webhooks/',
    '/api/auth/',
    '/api/trpc/',
  ],
});

export default auth(async function middleware(req: NextRequest) {
  const csrfResponse = await csrfMiddleware(req);
  if (csrfResponse.status !== 200) return csrfResponse;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const response = NextResponse.next();
  response.headers.set('x-nonce', nonce);

  const session = (req as any).auth;

  const protectedPaths = ['/inbox', '/calendar', '/settings', '/search', '/agent', '/onboarding'];
  const isProtectedRoute = protectedPaths.some(p => req.nextUrl.pathname.startsWith(p));

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return response;
}) as any;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/auth).*)',
  ],
};
