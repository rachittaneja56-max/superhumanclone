import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { z } from 'zod';
import { emails, auditLogs } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const emailRouter = router({
  getThreads: protectedProcedure
    .use(createRateLimitMiddleware('getThreads', 200, 60))
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      isArchived: z.boolean().default(false),
      tag: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(emails.userId, ctx.userId!),
        eq(emails.is_archived, input.isArchived),
        eq(emails.is_deleted, false)
      ];

      const results = await ctx.db.query.emails.findMany({
        where: and(...conditions),
        limit: input.limit,
        orderBy: [desc(emails.created_at)],
      });

      return results;
    }),

  archiveEmail: protectedProcedure
    .use(createRateLimitMiddleware('archiveEmail', 100, 60))
    .input(z.object({
      emailId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.update(emails)
        .set({ is_archived: true })
        .where(and(eq(emails.id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found or access denied.' });
      }

      // Fire and forget audit log
      ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'email_archived',
        details: { emailId: input.emailId }
      }).catch(console.error);

      return { success: true, id: result[0].id };
    }),

  restoreFromArchive: protectedProcedure
    .input(z.object({
      emailId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.update(emails)
        .set({ is_archived: false })
        .where(and(eq(emails.id, input.emailId), eq(emails.userId, ctx.userId!)))
        .returning({ id: emails.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found or access denied.' });
      }

      return { success: true, id: result[0].id };
    })
});
