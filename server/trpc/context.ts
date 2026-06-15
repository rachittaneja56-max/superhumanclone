import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/server/db'
import { redis } from '@/server/redis'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'

export async function createTRPCContext({ req }: { req: Request }) {
  const { userId: clerkUserId } = await auth()

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

  if (clerkUserId) {
    // Check Redis cache first
    const cacheKey = `session:valid:${clerkUserId}`
    const cached = await redis.get(cacheKey).catch(() => null)

    if (cached) {
      userId = clerkUserId
    } else {
      // Verify user still exists in DB
      try {
        const { users } = await import('@/server/db/schema')
        const validUser = await db.query.users.findFirst({
          where: eq(users.id, clerkUserId),
          columns: { id: true },
        })

        if (validUser) {
          userId = clerkUserId
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
