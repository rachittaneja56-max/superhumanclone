import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/server/db'
import { users, accounts, sessions, verificationTokens } from '@/server/db/schema'
import { headers } from 'next/headers'
import { checkSignInRateLimit } from '@/server/auth/rate-limiter'
import { ensureUserSettings } from '@/server/auth/helpers'
import { redis } from '@/server/redis'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, 
    updateAge: 24 * 60 * 60,    
  },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          scope: 'openid email profile',
          // NOTE: NO gmail or calendar scopes here
          // Corsair handles Gmail/Calendar OAuth separately
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      const headersList = await headers()
      const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? '127.0.0.1'

      const allowed = await checkSignInRateLimit(ip)
      if (!allowed) return false

      return true
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },

  events: {
    async createUser({ user }) {
      if (user.id) {
        await ensureUserSettings(user.id)
      }
    },
    async signOut(message: any) {
      const session = message?.session
      if (session && 'userId' in session) {
        await redis.del('session:valid:' + session.userId)
        await redis.del('settings:' + session.userId)
      }
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
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
  },
})
