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

export const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      session: ctx.session,
      userId: ctx.userId,
    },
  });
});

export const setRLSContext = t.middleware(async ({ ctx, next }) => {
  await ctx.db.execute(sql`SET LOCAL app.current_user_id = '${sql.raw(ctx.userId!)}'`);
  return next({ ctx });
});

export const protectedProcedure = t.procedure.use(enforceAuth).use(setRLSContext);

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

import { emailRouter } from './routers/email';
import { calendarRouter } from './routers/calendar';
import { agentRouter } from './routers/agent';
import { searchRouter } from './routers/search';
import { contactsRouter } from './routers/contacts';
import { settingsRouter } from './routers/settings';
import { realtimeRouter } from './routers/realtime';
import { auditRouter } from './routers/audit';

export const appRouter = router({
  email: emailRouter,
  calendar: calendarRouter,
  agent: agentRouter,
  search: searchRouter,
  contacts: contactsRouter,
  settings: settingsRouter,
  realtime: realtimeRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
