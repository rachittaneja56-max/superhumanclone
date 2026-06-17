import "server-only";

import { eq } from "drizzle-orm";

import { resolveAdminAccess } from "@/server/admin/access-utils";
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

  let user:
    | {
        plan: "free" | "pro" | "team";
        aiDisabled: boolean;
        isFlagged: boolean;
        email: string;
        role?: "user" | "admin" | "superadmin" | null;
        isAdmin: boolean;
      }
    | undefined;

  try {
    user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        plan: true,
        aiDisabled: true,
        isFlagged: true,
        email: true,
        role: true,
        isAdmin: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes(`column "role" does not exist`)) {
      throw error;
    }

    user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        plan: true,
        aiDisabled: true,
        isFlagged: true,
        email: true,
        isAdmin: true,
      },
    });
  }

  const plan = (user?.plan === "pro" || user?.plan === "team" ? user.plan : "free") as "free" | "pro" | "team";
  const config = getPlanConfig(plan);

  return {
    plan,
    monthlyLimit: config.aiMonthlyLimit,
    aiDisabled: user?.aiDisabled ?? false,
    isFlagged: user?.isFlagged ?? false,
    isAdmin: resolveAdminAccess({
      email: user?.email,
      role: user?.role,
      isAdmin: user?.isAdmin,
    }),
  };
}
