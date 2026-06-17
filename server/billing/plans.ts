import "server-only";

export type BillingMode = "dummy" | "razorpay";
export type UserPlan = "free" | "pro" | "team";

export type PlanConfig = {
  id: UserPlan;
  label: string;
  description: string;
  aiMonthlyLimit: number | null;
  triageMonthlyLimit: number | null;
  features: string[];
};

export const PLAN_CONFIGS: Record<UserPlan, PlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    description: "Core inbox, calendar, and limited AI.",
    aiMonthlyLimit: 20,
    triageMonthlyLimit: 100,
    features: ["20 AI calls / month", "Core Gmail + Calendar", "Basic agent access"],
  },
  pro: {
    id: "pro",
    label: "Pro",
    description: "Heavy AI usage and premium workflows.",
    aiMonthlyLimit: null,
    triageMonthlyLimit: null,
    features: ["Unlimited AI calls", "Meeting prep + smart scheduling", "Priority workflows"],
  },
  team: {
    id: "team",
    label: "Team",
    description: "Shared workspaces and future admin controls.",
    aiMonthlyLimit: null,
    triageMonthlyLimit: null,
    features: ["Unlimited AI calls", "Admin-ready workspace", "Future shared inbox support"],
  },
};

export function getBillingMode(): BillingMode {
  return process.env.BILLING_MODE === "razorpay" ? "razorpay" : "dummy";
}

export function isRazorpayConfigured() {
  return (
    getBillingMode() === "razorpay" &&
    Boolean(process.env.RAZORPAY_KEY_ID?.trim()) &&
    Boolean(process.env.RAZORPAY_KEY_SECRET?.trim()) &&
    Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim())
  );
}

export function getPlanConfig(plan: string | null | undefined): PlanConfig {
  if (plan === "pro" || plan === "team") {
    return PLAN_CONFIGS[plan];
  }
  return PLAN_CONFIGS.free;
}
