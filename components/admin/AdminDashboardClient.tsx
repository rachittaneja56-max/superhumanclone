"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";

export function AdminDashboardClient({ initialDashboard }: { initialDashboard: any }) {
  const utils = trpc.useUtils();
  const { data: dashboard = initialDashboard } = trpc.admin.getDashboard.useQuery({ limit: 25 }, {
    initialData: initialDashboard,
    staleTime: 30000,
  });

  const changePlan = trpc.admin.changeUserPlan.useMutation({ onSuccess: refresh, onError: showError });
  const flagUser = trpc.admin.flagUser.useMutation({ onSuccess: refresh, onError: showError });
  const setAiAccess = trpc.admin.setUserAiAccess.useMutation({ onSuccess: refresh, onError: showError });
  const resetUsage = trpc.admin.resetUsageCounter.useMutation({ onSuccess: refresh, onError: showError });
  const promoteUser = trpc.admin.promoteUserToAdminByEmail.useMutation({ onSuccess: refresh, onError: showError });
  const demoteUser = trpc.admin.demoteUserToUserByEmail.useMutation({ onSuccess: refresh, onError: showError });
  const [roleEmail, setRoleEmail] = useState("");
  const isSuperadmin = Boolean(dashboard.currentAdmin?.isSuperadmin);

  async function refresh() {
    toast.success("Admin action saved");
    await utils.admin.getDashboard.invalidate();
    setRoleEmail("");
  }

  function showError(error: { message?: string }) {
    toast.error(error.message || "Admin action failed");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-y-auto px-6 py-6">
      <div className="mb-6 border-b border-border pb-4">
        <h1 className="font-display text-2xl font-semibold text-foreground">Admin</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Usage, prompt versions, health checks, and safe user controls.
        </p>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <StatCard label="AI calls this month" value={String(dashboard.systemHealth.redisUsageSummary.aiCallsThisMonth)} />
        <StatCard label="Email triage" value={String(dashboard.systemHealth.redisUsageSummary.triageThisMonth)} />
        <StatCard label="HITL approved" value={String(dashboard.hitlStats.approved)} />
        <StatCard label="DB size" value={dashboard.systemHealth.dbSize} />
      </div>

      {isSuperadmin ? (
        <section className="mb-6 rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-foreground">Role management</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Promote or demote existing users by email. Only the fixed superadmin can manage roles.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="email"
              value={roleEmail}
              onChange={(event) => setRoleEmail(event.target.value)}
              placeholder="user@example.com"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!roleEmail || promoteUser.isPending}
                onClick={() => promoteUser.mutate({ email: roleEmail })}
              >
                Promote to admin
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!roleEmail || demoteUser.isPending}
                onClick={() => demoteUser.mutate({ email: roleEmail })}
              >
                Demote to user
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mb-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Users</h2>
            <div className="text-xs text-foreground-subtle">{dashboard.users.length} shown</div>
          </div>
          <div className="space-y-3">
            {dashboard.users.map((user: any) => (
              <div key={user.id} className="rounded-xl border border-border bg-background/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
                    <div className="truncate text-xs text-foreground-muted">{user.email}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-foreground-subtle">
                      <Tag>{user.plan}</Tag>
                      <Tag>{user.role}</Tag>
                      {user.isAdmin && user.role === "user" ? <Tag>legacy admin</Tag> : null}
                      {user.isFlagged ? <Tag>flagged</Tag> : null}
                      {user.aiDisabled ? <Tag>ai off</Tag> : null}
                    </div>
                  </div>
                  <div className="text-right text-xs text-foreground-muted">
                    <div>AI {user.aiUsage}</div>
                    <div>Triage {user.triageUsage}</div>
                    <div>HITL {user.hitlApproved}/{user.hitlRejected}</div>
                    <div>{user.lastActive ? new Date(user.lastActive).toLocaleString() : "No activity"}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => changePlan.mutate({ userId: user.id, plan: user.plan === "free" ? "pro" : "free" })}>
                    {user.plan === "free" ? "Upgrade" : "Set Free"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => flagUser.mutate({ userId: user.id, flagged: !user.isFlagged })}>
                    {user.isFlagged ? "Unflag" : "Flag"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAiAccess.mutate({ userId: user.id, enabled: user.aiDisabled })}>
                    {user.aiDisabled ? "Enable AI" : "Disable AI"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resetUsage.mutate({ userId: user.id, kind: "ai" })}>
                    Reset AI usage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-lg font-semibold text-foreground">Prompt versions</h2>
            <div className="space-y-2 text-sm text-foreground-muted">
              {dashboard.promptVersions.map((prompt: any) => (
                <div key={prompt.key} className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <div className="font-medium text-foreground">{prompt.key}</div>
                  <div>{prompt.purpose}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-lg font-semibold text-foreground">Provider health</h2>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-foreground-muted">
              {JSON.stringify(dashboard.systemHealth.providerHealth, null, 2)}
            </pre>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Sanitized audit log</h2>
        <div className="space-y-3 text-sm">
          {dashboard.auditLogs.map((log: any) => (
            <div key={log.id} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-foreground">{log.action}</div>
                <div className="text-xs text-foreground-muted">{new Date(log.createdAt).toLocaleString()}</div>
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-foreground-muted">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-2 py-1">{children}</span>;
}
