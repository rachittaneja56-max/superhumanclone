import 'server-only'
import { getSession } from '@/lib/auth'
import { db } from '@/server/db'
import { redis } from '@/server/redis'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'

export async function createTRPCContext({ req }: { req: Request }) {
  const session = await getSession()
  const customUserId = session.userId

  // CSRF check for all non-GET requests
  if (req.method !== 'GET') {
    const csrfHeader = req.headers.get('x-trpc-csrf')
    if (csrfHeader !== 'aethra-client') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Missing CSRF header',
      })
    }
  }

  let userId: string | null = null

  if (customUserId) {
    // Check Redis cache first
    const cacheKey = `session:valid:${customUserId}`
    const cached = await redis.get(cacheKey).catch(() => null)

    if (cached) {
      userId = customUserId
    } else {
      // Verify user still exists in DB
      try {
        const { users } = await import('@/server/db/schema')
        const validUser = await db.query.users.findFirst({
          where: eq(users.id, customUserId),
          columns: { id: true },
        })

        if (validUser) {
          userId = customUserId
          await redis.set(cacheKey, '1', { ex: 60 }).catch(() => null)
        }
      } catch (err) {
        console.error('[TRPC Context] DB user check failed:', err)
      }
    }
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '127.0.0.1'
  return { db, redis, userId, ip }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>
