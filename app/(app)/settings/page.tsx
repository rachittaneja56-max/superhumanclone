import Link from "next/link";
import { ChevronRight, ShieldCheck, LogOut, CreditCard, Link2, ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/lib/auth";
import { serverTrpc } from "@/lib/trpc/server";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { signOutAction } from "@/app/actions/auth";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const trpc = await serverTrpc();
  const settings = await trpc.settings.getUserSettings({});

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">Settings</h1>
            <p className="mt-1 text-sm text-foreground-muted">Keep AI, privacy, and workspace controls in one place.</p>
          </div>
          <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground-muted">
            Workspace settings
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <SettingsClient initialSettings={settings} />

            <SectionCard
              title="Privacy Gate"
              description="Choose which email domains the AI can access."
              href="/onboarding/privacy?mode=edit"
              icon={<ShieldCheck className="h-4 w-4" />}
            />

            <SectionCard
              title="Activity Log"
              description="Review recent AI actions and approvals."
              href="/settings/audit"
              icon={<ClipboardList className="h-4 w-4" />}
            />

            <SectionCard
              title="Connected Accounts"
              description="Manage Gmail and Calendar connections."
              href="/onboarding/connect"
              icon={<Link2 className="h-4 w-4" />}
            />
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">Billing</h2>
                </div>
                <CreditCard className="h-5 w-5 text-accent" />
              </div>
              <Link
                href="/billing"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-raised"
              >
                Open Billing
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-3xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
              <h2 className="font-display text-lg font-semibold text-foreground">Sign out</h2>
              <p className="mt-1 text-sm text-foreground-muted">End this session on this device.</p>
              <form action={signOutAction} className="mt-4">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-raised"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-3xl border border-border bg-surface px-5 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.12)] hover:bg-surface-raised"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">{icon}</span>
          <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        </div>
        <p className="mt-2 text-sm text-foreground-muted">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-foreground-subtle" />
    </Link>
  );
}
