import { getSession } from "@/lib/auth";
import { serverTrpc } from "@/lib/trpc/server";
import { format } from "date-fns";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const ACTION_LABELS: Record<string, string> = {
  email_sent: "Email sent",
  email_archived: "Email archived",
  email_deleted: "Email deleted",
  email_restored: "Email restored",
  calendar_created: "Calendar event created",
  agent_action_approved: "Agent action approved",
  agent_action_rejected: "Agent action rejected",
  settings_changed: "Settings changed",
  hitl_created: "Approval card created",
  hitl_resolved: "Approval resolved",
  memory_cleared: "Memory cleared",
  trash_emptied: "Trash emptied",
};

export default async function AuditPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  let logs: any[] = [];
  let loadError: string | null = null;

  try {
    const trpc = await serverTrpc();
    logs = await trpc.audit.getAuditLog({ limit: 50 });
  } catch {
    loadError = "We could not load your activity log right now.";
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 items-center gap-3 border-b border-border px-6">
        <Link href="/settings" className="text-foreground-subtle transition-colors hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-lg font-semibold">Activity Log</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loadError ? (
          <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-border bg-surface p-5 text-sm text-foreground-muted">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium text-foreground">Activity log unavailable</p>
                <p className="mt-1 leading-6">{loadError}</p>
              </div>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <p className="pt-8 text-center text-sm text-foreground-subtle">No activity yet</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any) => (
              <div key={log.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{ACTION_LABELS[log.action] ?? log.action}</div>
                    {log.details ? (
                      <div className="mt-1 text-xs leading-5 text-foreground-muted">{summarizeDetails(log.details)}</div>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-foreground-subtle">
                    {format(new Date(log.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function summarizeDetails(details: unknown) {
  if (!details || typeof details !== "object") return "Recorded activity.";

  const value = details as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof value.key === "string") {
    parts.push(`Setting: ${value.key.replace(/([A-Z])/g, " $1").toLowerCase()}`);
  }
  if (typeof value.value === "boolean") {
    parts.push(value.value ? "Enabled" : "Disabled");
  }
  if (typeof value.actionType === "string") {
    parts.push(`Action: ${value.actionType.replaceAll("_", " ")}`);
  }
  if (typeof value.decision === "string") {
    parts.push(`Decision: ${value.decision}`);
  }
  if (typeof value.type === "string") {
    parts.push(value.type.replaceAll("_", " "));
  }

  return parts.length > 0 ? parts.join(" | ") : "Recorded activity.";
}
