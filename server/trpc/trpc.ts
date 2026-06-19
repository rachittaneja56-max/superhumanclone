import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { Context } from './context';
import { sql } from 'drizzle-orm';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const setRLSContext = t.middleware(async ({ ctx, next }) => {
  await ctx.db.execute(sql`SET LOCAL app.current_user_id = '${sql.raw(ctx.userId!)}'`);
  return next({ ctx });
});

// Full procedure with RLS context — use for mutations only
export const protectedProcedure = t.procedure.use(enforceAuth).use(setRLSContext);

// Lightweight procedure without setRLSContext — use for read-only queries.
// Skips the `SET LOCAL app.current_user_id` round-trip that adds latency on every call.
export const protectedQueryProcedure = t.procedure.use(enforceAuth);


export const createRateLimitMiddleware = (key: string, limit: number, windowSeconds: number) => {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    const redisKey = `ratelimit:${key}:${ctx.userId}`;
    const count = await ctx.redis.incr(redisKey);
    
    if (count === 1) {
      await ctx.redis.expire(redisKey, windowSeconds);
    }
    
    if (count > limit) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded' });
    }
    
    return next({ ctx });
  });
};

export const createPublicRateLimitMiddleware = (key: string, limit: number, windowSeconds: number) => {
  return t.middleware(async ({ ctx, next }) => {
    const redisKey = `ratelimit:public:${key}:${ctx.ip}`;
    const count = await ctx.redis.incr(redisKey);
    
    if (count === 1) {
      await ctx.redis.expire(redisKey, windowSeconds);
    }
    
    if (count > limit) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please try again later.' });
    }
    
    return next({ ctx });
  });
};
