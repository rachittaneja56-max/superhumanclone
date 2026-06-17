import "server-only";

export function shouldBlockAiUsage(policy: {
  monthlyLimit: number | null;
  aiDisabled: boolean;
  isFlagged: boolean;
  isAdmin: boolean;
}, currentUsage: number) {
  if (policy.aiDisabled || policy.isFlagged) {
    return { blocked: true, reason: "disabled" as const };
  }

  if (policy.isAdmin || policy.monthlyLimit === null) {
    return { blocked: false, reason: null };
  }

  if (currentUsage >= policy.monthlyLimit) {
    return { blocked: true, reason: "limit" as const };
  }

  return { blocked: false, reason: null };
}
