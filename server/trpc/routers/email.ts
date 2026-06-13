import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { z } from 'zod';
import { emails, auditLogs } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  getEmails,
  sendEmail,
  archiveEmail,
} from '@/server/corsair/client';

export const emailRouter = router({
  getThreads: protectedProcedure
    .use(createRateLimitMiddleware('getThreads', 200, 60))
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      isArchived: z.boolean().default(false),
      tag: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await getEmails(ctx.userId!, { limit: input.limit })
      if (result.needsConnect) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Gmail not connected',
        })
      }
      return (result.data as any[]) || [];
    }),

  archiveEmail: protectedProcedure
    .use(createRateLimitMiddleware('archiveEmail', 100, 60))
    .input(z.object({
      emailId: z.string(), // Using Corsair's message ID now
    }))
    .mutation(async ({ ctx, input }) => {
      // Archive in Corsair/Gmail
      await archiveEmail(ctx.userId!, input.emailId)

      // Also update local DB if it exists (for cache/UI purposes)
      const localResult = await ctx.db.update(emails)
        .set({ is_archived: true })
        .where(and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      // Fire and forget audit log
      ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'email_archived',
        details: { emailId: input.emailId }
      }).catch(console.error);

      return { success: true, id: localResult[0]?.id || input.emailId };
    }),

  restoreFromArchive: protectedProcedure
    .input(z.object({
      emailId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // NOTE: Our client currently doesn't implement unarchive via Corsair,
      // but to match previous local behavior:
      const localResult = await ctx.db.update(emails)
        .set({ is_archived: false })
        .where(and(eq(emails.corsair_message_id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      return { success: true, id: localResult[0]?.id || input.emailId };
    })
});
