import { db } from '@/server/db';
import { redis } from '@/server/redis';
import { auth } from '@/server/auth';
import { TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { authSessions } from '@/server/db/schema';
import { and, eq, gt } from 'drizzle-orm';

export const createContext = async (opts?: FetchCreateContextFnOptions) => {
  const req = opts?.req;
  const session = await auth();

  if (req && req.method !== 'GET') {
    const csrfHeader = req.headers.get('x-trpc-csrf');
    if (csrfHeader !== 'tempo-client') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'CSRF check failed' });
    }
  }

  const userId = session?.user?.id || null;

  if (userId) {
    const cacheKey = `session:valid:${userId}`;
    const cached = await redis.get(cacheKey);

    if (!cached) {
      const sessionExists = await db.query.authSessions.findFirst({
        where: and(
          eq(authSessions.userId, userId),
          gt(authSessions.expires, new Date())
        ),
      });

      if (!sessionExists) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session expired' });
      }

      await redis.set(cacheKey, '1', { ex: 60 });
    }
  }

  return {
    db,
    redis,
    session,
    userId,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
