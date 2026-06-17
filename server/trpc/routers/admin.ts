import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";

import { getUserAdminState } from "@/server/admin/access";
import { FIXED_SUPERADMIN_EMAIL, normalizeEmail, resolveAdminAccess, resolveUserRole } from "@/server/admin/access-utils";
import { ADMIN_ACCESS_ID, ADMIN_ACCESS_PASSWORD } from "@/server/admin/credentials";
import { getPlanConfig, PLAN_CONFIGS } from "@/server/billing/plans";
import { getUsage, resetUsage } from "@/server/billing/usage";
import { prompts } from "@/server/ai/prompts";
import { sanitisePayload } from "@/lib/sanitise-payload";
import { getSession, setAdminUnlocked } from "@/lib/auth";
import { auditLogs, agentSessions, hitlActions, users } from "@/server/db/schema";
import { getUsersColumnPresence } from "@/server/db/users-compat";
import {
  changeUserPlanSchema,
  demoteUserToUserByEmailSchema,
  flagUserSchema,
  getAdminDashboardSchema,
  promoteUserToAdminByEmailSchema,
  resetUsageCounterSchema,
  unlockAdminDashboardSchema,
  setUserAiAccessSchema,
} from "@/lib/schemas";
import { createRateLimitMiddleware, protectedProcedure, router } from "../trpc";

async function requireAdmin(userId: string) {
  const state = await getUserAdminState(userId);
  if (!state.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return state;
}

async function requireSuperadmin(userId: string) {
  const state = await requireAdmin(userId);
  if (!state.isSuperadmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required" });
  }
  return state;
}

async function requireAdminUnlock() {
  const session = await getSession();
  if (!session.adminUnlocked) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin unlock required" });
  }
}

async function logRoleAudit(ctx: { db: any; userId: string }, details: {
  actingUserId: string;
  targetUserId: string;
  targetEmail: string;
  fromRole: string;
  toRole: string;
}, action: "admin_promoted" | "admin_demoted") {
  try {
    await ctx.db.insert(auditLogs).values({
      userId: ctx.userId,
      action,
      details: sanitisePayload(details),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("invalid input value for enum")) {
      throw error;
    }

    await ctx.db.insert(auditLogs).values({
      userId: ctx.userId,
      action: "settings_changed",
      details: sanitisePayload({
        ...details,
        auditAction: action,
      }),
    });
  }
}

async function getSafeUserLookupColumns() {
  const columns = await getUsersColumnPresence();
  return {
    id: true,
    email: true,
    ...(columns.hasRole ? { role: true } : {}),
    ...(columns.hasIsAdmin ? { isAdmin: true } : {}),
  } as const;
}

async function getSafeAdminDashboardColumns() {
  const columns = await getUsersColumnPresence();
  return {
    id: true,
    name: true,
    email: true,
    ...(columns.hasRole ? { role: true } : {}),
    ...(columns.hasPlan ? { plan: true } : {}),
    ...(columns.hasIsAdmin ? { isAdmin: true } : {}),
    ...(columns.hasIsFlagged ? { isFlagged: true } : {}),
    ...(columns.hasAiDisabled ? { aiDisabled: true } : {}),
    createdAt: true,
  } as const;
}

async function updateUserAccessColumns(ctx: { db: any }, userId: string, role: "user" | "admin" | "superadmin") {
  const columns = await getUsersColumnPresence();
  const setValues: Record<string, unknown> = {};

  if (columns.hasRole) {
    setValues.role = role;
  }
  if (columns.hasIsAdmin) {
    setValues.isAdmin = role !== "user";
  }

  if (Object.keys(setValues).length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Role columns are not migrated yet",
    });
  }

  await ctx.db.update(users).set(setValues).where(eq(users.id, userId));
}

export const adminRouter = router({
  unlockDashboard: protectedProcedure
    .input(unlockAdminDashboardSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);

      if (input.accessId !== ADMIN_ACCESS_ID || input.password !== ADMIN_ACCESS_PASSWORD) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid admin credentials" });
      }

      await setAdminUnlocked(true);
      return { unlocked: true };
    }),

  getDashboard: protectedProcedure
    .input(getAdminDashboardSchema)
    .query(async ({ ctx, input }) => {
      const adminState = await requireAdmin(ctx.userId!);
      await requireAdminUnlock();
      const userRows = await ctx.db.query.users.findMany({
        columns: await getSafeAdminDashboardColumns(),
        orderBy: [desc(users.createdAt)],
        limit: input.limit,
      }) as Array<{
        id: string;
        name: string | null;
        email: string;
        role?: "user" | "admin" | "superadmin" | null;
        plan?: "free" | "pro" | "team";
        isAdmin?: boolean;
        isFlagged?: boolean;
        aiDisabled?: boolean;
        createdAt: Date | null;
      }>;

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
            role: resolveUserRole({ email: user.email, role: user.role, isAdmin: user.isAdmin }),
            plan: getPlanConfig(user.plan).id,
            isAdmin: resolveAdminAccess({ email: user.email, role: user.role, isAdmin: user.isAdmin }),
            isFlagged: user.isFlagged ?? false,
            aiDisabled: user.aiDisabled ?? false,
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
        currentAdmin: {
          role: adminState.role,
          isSuperadmin: adminState.isSuperadmin,
        },
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
      await requireAdminUnlock();
      const columns = await getUsersColumnPresence();
      if (!columns.hasPlan) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Plan column is not migrated yet" });
      }
      await ctx.db.update(users).set({ plan: input.plan }).where(eq(users.id, input.userId));
      return { updated: true };
    }),

  flagUser: protectedProcedure
    .input(flagUserSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);
      await requireAdminUnlock();
      const columns = await getUsersColumnPresence();
      if (!columns.hasIsFlagged) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Flag column is not migrated yet" });
      }
      await ctx.db.update(users).set({ isFlagged: input.flagged }).where(eq(users.id, input.userId));
      return { updated: true };
    }),

  setUserAiAccess: protectedProcedure
    .input(setUserAiAccessSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);
      await requireAdminUnlock();
      const columns = await getUsersColumnPresence();
      if (!columns.hasAiDisabled) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI access column is not migrated yet" });
      }
      await ctx.db.update(users).set({ aiDisabled: !input.enabled }).where(eq(users.id, input.userId));
      return { updated: true };
    }),

  resetUsageCounter: protectedProcedure
    .input(resetUsageCounterSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId!);
      await requireAdminUnlock();
      await resetUsage(ctx.redis, input.userId, input.kind);
      return { reset: true };
    }),

  promoteUserToAdminByEmail: protectedProcedure
    .use(createRateLimitMiddleware("admin-role-promote", 10, 60))
    .input(promoteUserToAdminByEmailSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSuperadmin(ctx.userId!);
      await requireAdminUnlock();

      const targetEmail = normalizeEmail(input.email);
      const targetUser = await ctx.db.query.users.findFirst({
        where: sql`lower(${users.email}) = ${targetEmail}`,
        columns: await getSafeUserLookupColumns(),
      }) as
        | {
            id: string;
            email: string;
            role?: "user" | "admin" | "superadmin" | null;
            isAdmin?: boolean;
          }
        | undefined;

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found for that email" });
      }

      const previousRole = resolveUserRole({
        email: targetUser.email,
        role: targetUser.role,
        isAdmin: targetUser.isAdmin,
      });

      if (previousRole === "superadmin") {
        return { updated: true, role: "superadmin" as const };
      }

      await updateUserAccessColumns(ctx, targetUser.id, "admin");

      await logRoleAudit({
        db: ctx.db,
        userId: ctx.userId!,
      }, {
          actingUserId: ctx.userId!,
          targetUserId: targetUser.id,
          targetEmail: targetUser.email ?? targetEmail,
          fromRole: previousRole,
          toRole: "admin",
      }, "admin_promoted");

      return { updated: true, role: "admin" as const };
    }),

  demoteUserToUserByEmail: protectedProcedure
    .use(createRateLimitMiddleware("admin-role-demote", 10, 60))
    .input(demoteUserToUserByEmailSchema)
    .mutation(async ({ ctx, input }) => {
      await requireSuperadmin(ctx.userId!);
      await requireAdminUnlock();

      const targetEmail = normalizeEmail(input.email);
      if (targetEmail === FIXED_SUPERADMIN_EMAIL) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Fixed superadmin cannot be demoted" });
      }

      const targetUser = await ctx.db.query.users.findFirst({
        where: sql`lower(${users.email}) = ${targetEmail}`,
        columns: await getSafeUserLookupColumns(),
      }) as
        | {
            id: string;
            email: string;
            role?: "user" | "admin" | "superadmin" | null;
            isAdmin?: boolean;
          }
        | undefined;

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found for that email" });
      }

      const previousRole = resolveUserRole({
        email: targetUser.email,
        role: targetUser.role,
        isAdmin: targetUser.isAdmin,
      });

      await updateUserAccessColumns(ctx, targetUser.id, "user");

      await logRoleAudit({
        db: ctx.db,
        userId: ctx.userId!,
      }, {
          actingUserId: ctx.userId!,
          targetUserId: targetUser.id,
          targetEmail: targetUser.email ?? targetEmail,
          fromRole: previousRole,
          toRole: "user",
      }, "admin_demoted");

      return { updated: true, role: "user" as const };
    }),
});
