import { z } from 'zod';
import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { db } from '../../db';
import { hitlActions, auditLogs } from '../../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { redis } from '../../redis';
import { mapHitlActionForClient } from '../../ai/agents/action-agent';
import { sanitisePayload } from '@/lib/sanitise-payload';

const resolveHitlLimit = createRateLimitMiddleware('hitl_resolve', 60, 60);
const chatMessageLimit = createRateLimitMiddleware('agent_chat', 50, 3600);

import { getPendingHITLSchema, resolveHITLSchema, chatMessageSchema } from '@/lib/schemas';

export const agentRouter = router({
  getPendingHITL: protectedProcedure
    .input(getPendingHITLSchema)
    .query(async ({ ctx }) => {
      const pendingAction = await db.query.hitlActions.findFirst({
        where: and(
          eq(hitlActions.userId, ctx.userId!),
          eq(hitlActions.status, 'pending'),
          gt(hitlActions.expires_at, new Date())
        ),
      });
      return pendingAction ? mapHitlActionForClient(pendingAction) : null;
    }),

  resolveHITL: protectedProcedure
    .use(resolveHitlLimit)
    .input(resolveHITLSchema)
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
      await redis.del(`hitl:pending:${input.actionId}`);

      // Audit Log
      await db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'hitl_resolved',
        details: sanitisePayload({ actionType: row.action_type, decision: input.decision }),
      }).catch(() => undefined);

      return { resolved: true, decision: input.decision };
    }),

  chatMessage: protectedProcedure
    .use(chatMessageLimit)
    .input(chatMessageSchema)
    .mutation(async ({ ctx, input }) => {
      const workerUrl = process.env.RAILWAY_WORKER_URL || 'http://localhost:8080';
      const upstream = await fetch(workerUrl + '/agent/chat', {
        method: 'POST',
        headers: {
          'X-Worker-Secret': process.env.WORKER_SECRET || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: ctx.userId,
          sessionId: input.sessionId,
          message: input.message,
          threadContext: input.threadContext,
        }),
      });

      // Using the exact pattern requested by the user, though usually TRPC v11 uses async generator for streams.
      return new Response(upstream.body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }),
});
