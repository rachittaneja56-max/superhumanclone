import "server-only";

export type HitlStatus = "pending" | "approved" | "rejected" | "expired";

export function resolveHitlTransition(params: {
  currentStatus: HitlStatus;
  decision?: "approved" | "rejected";
  expiresAt: Date;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (params.currentStatus !== "pending") {
    return { ok: false as const, nextStatus: params.currentStatus, reason: "already_resolved" as const };
  }

  if (params.expiresAt.getTime() <= now.getTime()) {
    return { ok: false as const, nextStatus: "expired" as const, reason: "expired" as const };
  }

  if (!params.decision) {
    return { ok: false as const, nextStatus: "pending" as const, reason: "missing_decision" as const };
  }

  return { ok: true as const, nextStatus: params.decision, reason: null };
}
