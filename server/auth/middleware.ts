import NextAuth from 'next-auth';
import authConfig from './config';
import { createCsrfMiddleware } from '@edge-csrf/nextjs';
import { NextResponse, type NextRequest } from 'next/server';

const { auth } = NextAuth(authConfig);

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { userSettings } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

const sql = neon(process.env.DATABASE_URL!);
const edgeDb = drizzle({ client: sql });

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

  // Handle onboarding gate for authenticated users
  if (session && session.user?.id) {
    // Exclude the connect page and callback from the gate to avoid redirect loops
    const isConnectPage = req.nextUrl.pathname.startsWith('/onboarding/connect');
    const isCallback = req.nextUrl.pathname.startsWith('/api/corsair/callback');
    
    if (isProtectedRoute && !isConnectPage && !isCallback) {
      try {
        const settings = await edgeDb
          .select({ onboardingCompleted: userSettings.onboardingCompleted, gmailConnected: userSettings.gmailConnected })
          .from(userSettings)
          .where(eq(userSettings.userId, session.user.id))
          .limit(1)
          .then(res => res[0]);

        if (settings) {
          if (!settings.onboardingCompleted && req.nextUrl.pathname !== '/onboarding') {
            return NextResponse.redirect(new URL('/onboarding', req.url));
          }
          if (settings.onboardingCompleted && !settings.gmailConnected) {
            return NextResponse.redirect(new URL('/onboarding/connect', req.url));
          }
        }
      } catch (error) {
        console.error('Middleware DB error:', error);
      }
    }
  }

  return response;
}) as any;

