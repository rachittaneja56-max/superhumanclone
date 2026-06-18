import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { hitlActions, auditLogs, agentSessions } from '../../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { mapHitlActionForClient } from '../../ai/agents/action-agent';
import { sanitisePayload } from '@/lib/sanitise-payload';
import { resolveHitlTransition } from '../../agents/hitl-state';
import { executeApprovedHitlAction } from '../../agents/action-agent';

const resolveHitlLimit = createRateLimitMiddleware('hitl_resolve', 60, 60);
const chatMessageLimit = createRateLimitMiddleware('agent_chat', 50, 3600);

import {
  getPendingHITLSchema,
  resolveHITLSchema,
  chatMessageSchema,
  clearAgentSessionSchema,
  replaceAgentSessionHistorySchema,
} from '@/lib/schemas';

export const agentRouter = router({
  getPendingHITL: protectedProcedure
    .input(getPendingHITLSchema)
    .query(async ({ ctx }) => {
      const pendingAction = await ctx.db.query.hitlActions.findFirst({
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
      const row = await ctx.db.query.hitlActions.findFirst({
        where: eq(hitlActions.id, input.actionId),
      });

      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'HITL action not found' });
      }

      if (row.userId !== ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authorized to resolve this action' });
      }

      const transition = resolveHitlTransition({
        currentStatus: row.status,
        decision: input.decision,
        expiresAt: new Date(row.expires_at),
      });

      if (row.status !== 'pending') {
        throw new TRPCError({ code: 'CONFLICT', message: 'HITL action already resolved or expired' });
      }

      if (transition.reason === 'expired') {
        await ctx.db.update(hitlActions)
          .set({ status: 'expired', resolved_at: new Date() })
          .where(eq(hitlActions.id, input.actionId));
        throw new TRPCError({ code: 'CONFLICT', message: 'HITL action has expired' });
      }

      if (input.decision === 'approved') {
        await executeApprovedHitlAction(ctx.userId!, input.actionId, { db: ctx.db, redis: ctx.redis });
      }

      await ctx.db.update(hitlActions)
        .set({ status: transition.nextStatus, resolved_at: new Date() })
        .where(eq(hitlActions.id, input.actionId));

      // Publish to Redis to resume the agent interceptor
      await ctx.redis.publish(`hitl:response:${input.actionId}`, input.decision);
      await ctx.redis.del(`hitl:pending:${input.actionId}`);
      if (input.decision === 'rejected') {
        await ctx.redis.del(`hitl:private:${input.actionId}`);
      }

      // Audit Log
      await ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'hitl_resolved',
        details: sanitisePayload({ actionType: row.action_type, decision: input.decision }),
      }).catch(() => undefined);

      return { resolved: true, decision: input.decision };
    }),

  clearSessionHistory: protectedProcedure
    .input(clearAgentSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.agentSessions.findFirst({
        where: eq(agentSessions.id, input.sessionId),
      });

      if (!session) {
        return { cleared: true };
      }

      if (session.userId !== ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authorized to clear this session' });
      }

      await ctx.db.delete(agentSessions).where(eq(agentSessions.id, input.sessionId));
      await ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'settings_changed',
        details: sanitisePayload({ type: 'agent_memory_cleared', sessionId: input.sessionId }),
      }).catch(() => undefined);

      return { cleared: true };
    }),

  replaceSessionHistory: protectedProcedure
    .input(replaceAgentSessionHistorySchema)
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.agentSessions.findFirst({
        where: eq(agentSessions.id, input.sessionId),
      });

      if (session && session.userId !== ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authorized to edit this session' });
      }

      if (!session) {
        await ctx.db.insert(agentSessions).values({
          id: input.sessionId,
          userId: ctx.userId!,
          history: input.history,
        });
      } else {
        await ctx.db.update(agentSessions)
          .set({ history: input.history, updated_at: new Date() })
          .where(eq(agentSessions.id, input.sessionId));
      }

      await ctx.db.insert(auditLogs).values({
        userId: ctx.userId!,
        action: 'settings_changed',
        details: sanitisePayload({ type: 'agent_memory_updated', sessionId: input.sessionId, itemCount: input.history.length }),
      }).catch(() => undefined);

      return { updated: true };
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
          history: input.history,
          allowMemory: input.allowMemory,
        }),
      });

      // Using the exact pattern requested by the user, though usually TRPC v11 uses async generator for streams.
      return new Response(upstream.body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }),
});
