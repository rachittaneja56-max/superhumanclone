import NextAuth from 'next-auth'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/server/db'
import { users, accounts, sessions, verificationTokens } from '@/server/db/schema'
import { headers } from 'next/headers'
import { checkSignInRateLimit } from '@/server/auth/rate-limiter'
import { ensureUserSettings } from '@/server/auth/helpers'
import { redis } from '@/server/redis'
import { authConfig } from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      const headersList = await headers()
      const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? '127.0.0.1'

      const allowed = await checkSignInRateLimit(ip)
      if (!allowed) return false

      return true
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
})
