import NextAuth from 'next-auth';
import { headers } from 'next/headers';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/server/db';
import { userSettings, hitlActions } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { checkSignInRateLimit, RateLimitError } from '@/server/auth/rate-limiter';
import authConfig from './config';

async function ensureUserSettings(userId: string) {
  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  if (!existing) {
    await db.insert(userSettings).values({ userId });
  }
}

async function expireUserHITLActions(userId: string) {
  await db.update(hitlActions)
    .set({ status: 'expired' })
    .where(eq(hitlActions.userId, userId));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      const ip = (await headers()).get('x-forwarded-for') ?? '127.0.0.1';
      try {
        await checkSignInRateLimit(ip);
      } catch (e) {
        if (e instanceof RateLimitError) return false;
        throw e;
      }

      if (account?.provider === 'google' && user.id) {
        await ensureUserSettings(user.id);
      }
      return true;
    },
  },
  events: {
    async signOut(message: any) {
      if (message?.session?.userId) {
        await expireUserHITLActions(message.session.userId);
      }
    },
  },
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Host-next-auth.csrf-token'
        : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
});
