"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";

type BillingOverview = {
  mode: "dummy";
  currentPlan: "free" | "pro" | "team";
  aiDisabled: boolean;
  isFlagged: boolean;
  usage: { ai: number; triage: number };
  limits: { ai: number | null; triage: number | null };
  plans: Array<{
    id: "free" | "pro" | "team";
    label: string;
    description: string;
    aiMonthlyLimit: number | null;
    triageMonthlyLimit: number | null;
    features: string[];
  }>;
  upgradeMessage: string | null;
};

export function BillingClient({ initialOverview }: { initialOverview: BillingOverview }) {
  const { data: overview = initialOverview } = trpc.billing.getOverview.useQuery({}, {
    initialData: initialOverview,
    staleTime: 30000,
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-y-auto px-6 py-6">
      <div className="mb-6 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Billing</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Manage your plan and keep billing simple.
          </p>
        </div>
      </div>

      {overview.upgradeMessage ? (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {overview.upgradeMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {overview.plans.map((plan) => {
          const active = plan.id === overview.currentPlan;
          return (
            <div
              key={plan.id}
              className={[
                "rounded-2xl border bg-surface p-5 shadow-sm",
                active ? "border-amber-500/50 ring-1 ring-amber-500/20" : "border-border",
              ].join(" ")}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{plan.label}</h2>
                  <p className="mt-1 text-sm text-foreground-muted">{plan.description}</p>
                </div>
                {active ? (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    Current
                  </span>
                ) : null}
              </div>

              <div className="mb-4 text-sm text-foreground-muted">
                AI limit: {plan.aiMonthlyLimit === null ? "Unlimited" : `${plan.aiMonthlyLimit}/month`}
              </div>

              <ul className="mb-5 space-y-2 text-sm text-foreground-muted">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <Button
                className="w-full"
                variant={active ? "outline" : "default"}
                onClick={() => {
                  if (!active) {
                    toast.message("Contact us to change plans.");
                  }
                }}
              >
                {active ? "Current plan" : "Contact us"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
