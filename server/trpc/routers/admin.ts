import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, sql } from "drizzle-orm";

import { getUserAdminState } from "@/server/admin/access";
import { getPlanConfig, PLAN_CONFIGS } from "@/server/billing/plans";
import { getUsage, resetUsage } from "@/server/billing/usage";
import { prompts } from "@/server/ai/prompts";
import { sanitisePayload } from "@/lib/sanitise-payload";
import { auditLogs, agentSessions, hitlActions, users } from "@/server/db/schema";
import {
  changeUserPlanSchema,
  flagUserSchema,
  getAdminDashboardSchema,
  resetUsageCounterSchema,
  setUserAiAccessSchema,
} from "@/lib/schemas";
import { protectedProcedure, router } from "../trpc";

async function requireAdmin(userId: string) {
  const { isAdmin } = await getUserAdminState(userId);
  if (!isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

export const adminRouter = router({
  getDashboard: protectedProcedure
    .input(getAdminDashboardSchema)
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);

      const userRows = await ctx.db.query.users.findMany({
        columns: {
          id: true,
          name: true,
          email: true,
          plan: true,
          isAdmin: true,
          isFlagged: true,
          aiDisabled: true,
          createdAt: true,
        },
        orderBy: [desc(users.createdAt)],
        limit: input.limit,
      });

      const now = new Date();
      const providerDate = now.toISOString().slice(0, 10);
      const auditRows = await ctx.db.query.auditLogs.findMany({
        orderBy: [desc(auditLogs.created_at)],
        limit: 25,
      });
      const allHitlRows: Array<{ userId: string; status: "pending" | "approved" | "rejected" | "expired"; created_at: Date }> =
        await ctx.db.query.hitlActions.findMany({
          columns: { userId: true, status: true, created_at: true },
        });
      const providerHealthRows = await Promise.all([
        ctx.redis.get(`key:health:openai:${providerDate}`),
        ctx.redis.get(`key:health:mistral:${providerDate}`),
      ]);
      const dbSizeResult = await ctx.db.execute(sql`select pg_size_pretty(pg_database_size(current_database())) as size`);

      const usersWithMetrics = await Promise.all(
        userRows.map(async (user) => {
          const [aiUsage, triageUsage, lastAgentSession, lastAudit] = await Promise.all([
            getUsage(ctx.redis, user.id, "ai"),
            getUsage(ctx.redis, user.id, "email-triage"),
            ctx.db.query.agentSessions.findFirst({
              where: eq(agentSessions.userId, user.id),
              orderBy: [desc(agentSessions.updated_at)],
              columns: { updated_at: true },
            }),
            ctx.db.query.auditLogs.findFirst({
              where: eq(auditLogs.userId, user.id),
              orderBy: [desc(auditLogs.created_at)],
              columns: { created_at: true },
            }),
          ]);

          const userHitlRows = allHitlRows.filter((row) => row.userId === user.id);
          const approved = userHitlRows.filter((row) => row.status === "approved").length;
          const rejected = userHitlRows.filter((row) => row.status === "rejected").length;

          return {
            id: user.id,
            name: user.name || "Unknown",
            email: user.email,
            plan: getPlanConfig(user.plan).id,
            isAdmin: user.isAdmin,
            isFlagged: user.isFlagged,
            aiDisabled: user.aiDisabled,
            createdAt: user.createdAt,
            aiUsage,
            triageUsage,
            hitlApproved: approved,
            hitlRejected: rejected,
            agentCalls: aiUsage,
            lastActive: lastAgentSession?.updated_at ?? lastAudit?.created_at ?? user.createdAt,
          };
        }),
      );

      const totalAiUsage = usersWithMetrics.reduce((sum, user) => sum + user.aiUsage, 0);
      const totalTriageUsage = usersWithMetrics.reduce((sum, user) => sum + user.triageUsage, 0);
      const recentApprovals = allHitlRows.filter((row: { status: string }) => row.status === "approved").length;
      const recentRejections = allHitlRows.filter((row: { status: string }) => row.status === "rejected").length;

      return {
        users: usersWithMetrics,
        plans: PLAN_CONFIGS,
        systemHealth: {
          dbSize: Array.isArray(dbSizeResult.rows) ? (dbSizeResult.rows[0] as { size?: string } | undefined)?.size ?? "Unavailable" : "Unavailable",
          providerHealth: {
            openai: providerHealthRows[0] ?? null,
            mistral: providerHealthRows[1] ?? null,
          },
          redisUsageSummary: {
            aiCallsThisMonth: totalAiUsage,
            triageThisMonth: totalTriageUsage,
          },
        },
        hitlStats: {
          approved: recentApprovals,
          rejected: recentRejections,
          pending: allHitlRows.filter((row: { status: string }) => row.status === "pending").length,
        },
        promptVersions: Object.values(prompts).map((prompt) => ({
          key: `${prompt.key}_${prompt.version}`,
          purpose: prompt.purpose,
          maxOutputTokens: prompt.maxOutputTokens,
        })),
        auditLogs: auditRows.map((row) => ({
          id: row.id,
          action: row.action,
          createdAt: row.created_at,
          details: sanitisePayload(row.details),
        })),
      };
    }),

  changeUserPlan: protectedProcedure
    .input(changeUserPlanSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);
      await ctx.db.update(users).set({ plan: input.plan }).where(eq(users.id, input.userId));
      return { updated: true };
    }),

  flagUser: protectedProcedure
    .input(flagUserSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);
      await ctx.db.update(users).set({ isFlagged: input.flagged }).where(eq(users.id, input.userId));
      return { updated: true };
    }),

  setUserAiAccess: protectedProcedure
    .input(setUserAiAccessSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);
      await ctx.db.update(users).set({ aiDisabled: !input.enabled }).where(eq(users.id, input.userId));
      return { updated: true };
    }),

  resetUsageCounter: protectedProcedure
    .input(resetUsageCounterSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);
      await resetUsage(ctx.redis, input.userId, input.kind);
      return { reset: true };
    }),
});
