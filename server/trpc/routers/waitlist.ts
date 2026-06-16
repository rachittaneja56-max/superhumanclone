import { router, publicProcedure, createPublicRateLimitMiddleware } from '../trpc';
import { z } from 'zod';
import { waitlistEmails } from '@/server/db/schema';
import { TRPCError } from '@trpc/server';
import { joinWaitlistSchema } from '@/lib/schemas';

export const waitlistRouter = router({
  join: publicProcedure
    .use(createPublicRateLimitMiddleware('waitlist', 3, 3600))
    .input(joinWaitlistSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.insert(waitlistEmails).values({ email: input.email });
      } catch (e: any) {
        if (e.code === '23505') {
          return { success: true };
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to join waitlist' });
      }
      return { success: true };
    })
});
