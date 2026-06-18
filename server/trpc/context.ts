import 'server-only'
import { getSession } from '@/lib/auth'
import { db } from '@/server/db'
import { redis } from '@/server/redis'
import { TRPCError } from '@trpc/server'

export async function createTRPCContext({ req }: { req: Request }) {
  const session = await getSession()

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

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '127.0.0.1'
  return { db, redis, userId: session.userId ?? null, ip }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>
