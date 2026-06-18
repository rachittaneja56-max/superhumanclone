export type EmailPriority = "low" | "medium" | "high" | "urgent";
export type EmailPriorityTone = "success" | "info" | "warning" | "critical";

export type EmailPriorityPresentation = {
  value: EmailPriority;
  label: string;
  tone: EmailPriorityTone;
  chipClassName: string;
  sortOrder: number;
};

const PRIORITY_LABELS: Record<EmailPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_RANKS: Record<EmailPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

export function normalizeEmailPriority(value: string | null | undefined): EmailPriority | null {
  if (value === "low" || value === "medium" || value === "high" || value === "urgent") {
    return value;
  }
  return null;
}

export function getEmailPriorityLabel(priority: EmailPriority) {
  return PRIORITY_LABELS[priority];
}

export function getEmailPriorityRank(priority: EmailPriority) {
  return PRIORITY_RANKS[priority];
}

export function getEmailPrioritySortOrder(priority: EmailPriority) {
  return getEmailPriorityRank(priority);
}

export function getEmailPriorityTone(priority: EmailPriority): EmailPriorityTone {
  if (priority === "urgent") return "critical";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "success";
}

export function getEmailPriorityChipClasses(priority: EmailPriority) {
  const tone = getEmailPriorityTone(priority);

  if (tone === "critical") {
    return "border-red-300/70 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300";
  }
  if (tone === "warning") {
    return "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (tone === "info") {
    return "border-blue-300/70 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300";
  }
  return "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
}

export function getEmailPriorityPresentation(input: {
  priority?: string | null;
  badges?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  tldr?: string | null;
}) {
  const value = resolveEmailPriority(input);
  return {
    value,
    label: getEmailPriorityLabel(value),
    tone: getEmailPriorityTone(value),
    chipClassName: getEmailPriorityChipClasses(value),
    sortOrder: getEmailPrioritySortOrder(value),
  } satisfies EmailPriorityPresentation;
}

export function inferEmailPriorityFromSignals(input: {
  badges?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  tldr?: string | null;
}) {
  const badges = new Set((input.badges ?? []).map((badge) => badge.toLowerCase()));
  const haystack = `${input.subject ?? ""} ${input.snippet ?? ""} ${input.tldr ?? ""}`.toLowerCase();

  if (badges.has("urgent") || /\b(urgent|asap|action required|deadline|critical|today)\b/.test(haystack)) {
    return "urgent" satisfies EmailPriority;
  }
  if (badges.has("needs reply") || /\b(approve|approval|review|reply|respond|follow up|following up|can you|could you)\b/.test(haystack)) {
    return "high" satisfies EmailPriority;
  }
  if (/\b(invoice|payment|meeting|calendar|schedule|reminder|tomorrow|this week)\b/.test(haystack)) {
    return "medium" satisfies EmailPriority;
  }
  return "low" satisfies EmailPriority;
}

export function resolveEmailPriority(input: {
  priority?: string | null;
  badges?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  tldr?: string | null;
}) {
  return normalizeEmailPriority(input.priority) ?? inferEmailPriorityFromSignals(input);
}

export function compareEmailPriority(a: {
  priority?: string | null;
  badges?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  tldr?: string | null;
  receivedAt?: string | null;
}, b: {
  priority?: string | null;
  badges?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  tldr?: string | null;
  receivedAt?: string | null;
}) {
  const rankDiff = getEmailPriorityRank(resolveEmailPriority(b)) - getEmailPriorityRank(resolveEmailPriority(a));
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const aTime = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
  const bTime = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
  return bTime - aTime;
}

export function compareEmailPriorityBySortOrder(
  a: { priority?: string | null; badges?: string[] | null; subject?: string | null; snippet?: string | null; tldr?: string | null },
  b: { priority?: string | null; badges?: string[] | null; subject?: string | null; snippet?: string | null; tldr?: string | null }
) {
  return getEmailPrioritySortOrder(resolveEmailPriority(b)) - getEmailPrioritySortOrder(resolveEmailPriority(a));
}
