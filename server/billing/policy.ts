import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getPlanConfig } from "./plans";
import { shouldBlockAiUsage } from "./policy-utils";

export type UserBillingPolicy = {
  plan: "free" | "pro" | "team";
  monthlyLimit: number | null;
  aiDisabled: boolean;
  isFlagged: boolean;
  isAdmin: boolean;
};

export { shouldBlockAiUsage } from "./policy-utils";

export async function getUserBillingPolicy(userId?: string): Promise<UserBillingPolicy> {
  if (!userId) {
    return {
      plan: "team",
      monthlyLimit: null,
      aiDisabled: false,
      isFlagged: false,
      isAdmin: true,
    };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      plan: true,
      aiDisabled: true,
      isFlagged: true,
      isAdmin: true,
    },
  });

  const plan = (user?.plan === "pro" || user?.plan === "team" ? user.plan : "free") as "free" | "pro" | "team";
  const config = getPlanConfig(plan);

  return {
    plan,
    monthlyLimit: config.aiMonthlyLimit,
    aiDisabled: user?.aiDisabled ?? false,
    isFlagged: user?.isFlagged ?? false,
    isAdmin: user?.isAdmin ?? false,
  };
}
