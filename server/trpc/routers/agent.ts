import { z } from 'zod';
import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { db } from '../../db';
import { hitlActions, auditLogs } from '../../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { redis } from '../../redis';

const resolveHitlLimit = createRateLimitMiddleware('hitl_resolve', 60, 60);

export const agentRouter = router({
  getPendingHITL: protectedProcedure
    .query(async ({ ctx }) => {
      const pendingAction = await db.query.hitlActions.findFirst({
        where: and(
          eq(hitlActions.userId, ctx.userId!),
          eq(hitlActions.status, 'pending'),
          gt(hitlActions.expires_at, new Date())
        ),
      });
      return pendingAction || null;
    }),

  resolveHITL: protectedProcedure
    .use(resolveHitlLimit)
    .input(z.object({
      actionId: z.string().uuid(),
      decision: z.enum(['approved', 'rejected']),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.query.hitlActions.findFirst({
        where: eq(hitlActions.id, input.actionId),
      });

      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'HITL action not found' });
      }

      if (row.userId !== ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authorized to resolve this action' });
      }

      if (row.status !== 'pending') {
        throw new TRPCError({ code: 'CONFLICT', message: 'HITL action already resolved or expired' });
      }

      if (new Date(row.expires_at) < new Date()) {
        throw new TRPCError({ code: 'CONFLICT', message: 'HITL action has expired' });
      }

      // Update the DB
      await db.update(hitlActions)
        .set({ status: input.decision, resolved_at: new Date() })
        .where(eq(hitlActions.id, input.actionId));

      // Publish to Redis to resume the agent interceptor
      await redis.publish(`hitl:response:${input.actionId}`, input.decision);

      // Audit Log
      await db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'hitl_resolved',
        details: { actionType: row.action_type, decision: input.decision },
      }).catch(console.error);

      return { resolved: true, decision: input.decision };
    }),
});
