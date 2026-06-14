import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import Ably from 'ably';
import { TRPCError } from '@trpc/server';

const ablyLimit = createRateLimitMiddleware('ably', 10, 60);

export const realtimeRouter = router({
  getAblyToken: protectedProcedure
    .use(ablyLimit)
    .query(async ({ ctx }) => {
      if (!process.env.ABLY_API_KEY) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ably API key not configured',
        });
      }

      const ably = new Ably.Rest(process.env.ABLY_API_KEY);
      
      const tokenRequest = await ably.auth.createTokenRequest({
        clientId: ctx.userId ?? undefined,
        capability: {
          [`private:user-${ctx.userId}`]: ['subscribe', 'history'],
        },
        ttl: 3600000, // 1 hour
      });

      return tokenRequest;
    }),
});
