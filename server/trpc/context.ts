import 'server-only'
import { auth } from '@/auth'
import { db } from '@/server/db'
import { redis } from '@/server/redis'
import { TRPCError } from '@trpc/server'
import { sessions } from '@/server/db/schema'
import { eq, gt, and } from 'drizzle-orm'

export async function createTRPCContext({ req }: { req: Request }) {
  const session = await auth()

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

  if (session?.user?.id) {
    // Check Redis cache first
    const cacheKey = `session:valid:${session.user.id}`
    const cached = await redis.get(cacheKey)

    if (cached) {
      userId = session.user.id
    } else {
      // Verify session still exists in DB
      const validSession = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.userId, session.user.id),
          gt(sessions.expires, new Date())
        ),
        columns: { sessionToken: true },
      })

      if (validSession) {
        userId = session.user.id
        await redis.set(cacheKey, '1', { ex: 60 })
      }
    }
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '127.0.0.1'
  return { db, redis, session, userId, ip }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>
