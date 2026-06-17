import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { getBillingMode, getPlanConfig, isRazorpayConfigured, PLAN_CONFIGS } from "@/server/billing/plans";
import { getUsage } from "@/server/billing/usage";
import { users } from "@/server/db/schema";
import { getBillingOverviewSchema, simulatePlanChangeSchema } from "@/lib/schemas";
import { protectedProcedure, router } from "../trpc";

export const billingRouter = router({
  getOverview: protectedProcedure
    .input(getBillingOverviewSchema)
    .query(async ({ ctx }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId!),
        columns: {
          id: true,
          plan: true,
          aiDisabled: true,
          isFlagged: true,
        },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const planConfig = getPlanConfig(user.plan);
      const [aiUsage, triageUsage] = await Promise.all([
        getUsage(ctx.redis, ctx.userId!, "ai"),
        getUsage(ctx.redis, ctx.userId!, "email-triage"),
      ]);

      return {
        mode: getBillingMode(),
        razorpayReady: isRazorpayConfigured(),
        currentPlan: planConfig.id,
        aiDisabled: user.aiDisabled,
        isFlagged: user.isFlagged,
        usage: {
          ai: aiUsage,
          triage: triageUsage,
        },
        limits: {
          ai: planConfig.aiMonthlyLimit,
          triage: planConfig.triageMonthlyLimit,
        },
        plans: Object.values(PLAN_CONFIGS),
        upgradeMessage:
          planConfig.aiMonthlyLimit !== null && aiUsage >= planConfig.aiMonthlyLimit
            ? "You’ve reached the monthly AI limit for Free. Upgrade to Pro for more AI usage."
            : null,
      };
    }),

  simulatePlanChange: protectedProcedure
    .input(simulatePlanChangeSchema)
    .mutation(async ({ ctx, input }) => {
      if (getBillingMode() !== "dummy") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Billing simulation is only available in dummy mode.",
        });
      }

      await ctx.db
        .update(users)
        .set({ plan: input.plan })
        .where(eq(users.id, ctx.userId!));

      return {
        updated: true,
        plan: input.plan,
      };
    }),
});
