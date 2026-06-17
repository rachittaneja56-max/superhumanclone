import Link from "next/link";
import { format, formatDistanceToNow, isSameDay, endOfWeek } from "date-fns";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Landmark,
  Inbox,
  Mail,
  MessageSquareReply,
  Newspaper,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { serverTrpc } from "@/lib/trpc/server";

type BillingOverview = {
  currentPlan?: "free" | "pro" | "team";
  aiDisabled?: boolean;
  usage?: { ai: number; triage: number };
  limits?: { ai: number | null; triage: number | null };
};

type DashboardSettings = {
  gmailConnected: boolean;
  calendarConnected: boolean;
  privacyConfigured: boolean;
  aiEnabled: boolean;
  morningDigestEnabled: boolean;
} | null;

type ConnectionState = {
  gmailConnected: boolean;
  calendarConnected: boolean;
};

type InboxThread = {
  id: string;
  threadId: string;
  senderName: string;
  subject: string;
  snippet: string;
  isRead: boolean;
  aiTriageSkipped?: boolean;
  tldr?: string | null;
  receivedAt: string | null;
  badges: string[];
};

type CalendarEvent = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string | null;
  attendeesSummary?: string | null;
  meetLink?: string | null;
  is_all_day: boolean;
};

type AuditLog = {
  id: string;
  action: string;
  createdAt: Date | string;
  details: Record<string, unknown> | unknown;
};

type MorningDigest = {
  digest: string;
  emailCount: number;
  eventCount: number;
} | null;

type SummaryCardProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "good" | "warn" | "muted";
};

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export function DashboardShell({
  settings,
  connectionState,
}: {
  settings: DashboardSettings;
  connectionState: ConnectionState;
}) {
  const gmailConnected = connectionState.gmailConnected;
  const calendarConnected = connectionState.calendarConnected;
  const privacyReady = Boolean(settings?.privacyConfigured);
  const aiEnabled = Boolean(settings?.aiEnabled);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(244,238,229,0.96))] p-6 shadow-[0_24px_60px_rgba(38,28,14,0.08)] sm:p-8 dark:bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.14),transparent_35%),linear-gradient(180deg,rgba(22,22,22,0.96),rgba(12,12,12,0.98))] dark:shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-foreground-subtle">
            <Sparkles className="h-4 w-4 text-accent" />
            Command center
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Good morning. Here&apos;s the state of your workspace.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-muted sm:text-base">
            Aethra keeps email, calendar, and approvals in one executive summary so you can act fast without reading a wall of text.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <StatusCard
              label="Gmail"
              value={gmailConnected ? "Connected" : "Disconnected"}
              tone={gmailConnected ? "good" : "warn"}
            />
            <StatusCard
              label="Calendar"
              value={calendarConnected ? "Connected" : "Disconnected"}
              tone={calendarConnected ? "good" : "warn"}
            />
            <StatusCard
              label="Privacy Gate"
              value={privacyReady ? "Configured" : "Needs setup"}
              tone={privacyReady ? "good" : "warn"}
            />
            <StatusCard
              label="AI"
              value={aiEnabled ? "Enabled" : "Disabled"}
              tone={aiEnabled ? "good" : "warn"}
            />
          </div>
        </div>

        <div className="flex h-full flex-col justify-between gap-4 rounded-[1.5rem] border border-border bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:bg-background/60 dark:shadow-none">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-subtle">
              Quick actions
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/inbox?compose=true"
                className="inline-flex h-9 items-center justify-between rounded-lg border border-transparent bg-primary px-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
              >
                New message
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/agent"
                className="inline-flex h-9 items-center justify-between rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-all hover:bg-muted"
              >
                Ask agent
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-[rgba(255,255,255,0.72)] p-4 dark:bg-background/60">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-accent" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Fast load mode</h3>
                <p className="mt-1 text-sm leading-6 text-foreground-muted">
                  The dashboard shell loads first. Inbox, calendar, digest, and audit cards fill in right after.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export async function DashboardData({
  settings,
  connectionState,
}: {
  settings: DashboardSettings;
  connectionState: ConnectionState;
}) {
  const trpc = await serverTrpc();
  const today = new Date();
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const digestEnabled = Boolean(settings?.morningDigestEnabled && settings.aiEnabled && settings.privacyConfigured);

  const [
    billing,
    unreadCounts,
    inboxThreads,
    auditLogs,
    calendarEvents,
    digest,
  ] = await Promise.all([
    safe(trpc.billing.getOverview({}), null),
    safe(trpc.email.getUnreadCounts({}), null),
    safe(trpc.email.getMailboxThreads({ folder: "inbox", limit: 12, offset: 0, query: "" }), { items: [], nextPageToken: null }),
    safe(trpc.audit.getAuditLog({ limit: 8 }), []),
    safe(trpc.calendar.getEvents({ startDate: today, endDate: weekEnd }), []),
    digestEnabled ? safe(trpc.email.getMorningDigest({}), null) : Promise.resolve(null),
  ]);

  const normalizedCalendarEvents = (calendarEvents ?? []).map((event: any) => ({
    ...event,
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
  })) as CalendarEvent[];

  const normalizedAuditLogs = (auditLogs ?? []).map((log: any) => ({
    id: log.id,
    action: log.action,
    createdAt: log.createdAt ?? log.created_at,
    details: log.details,
  })) as AuditLog[];

  const inboxItems = inboxThreads.items ?? [];
  const aiEnabled = Boolean(settings?.aiEnabled) && !(billing?.aiDisabled ?? false);
  const privacyReady = Boolean(settings?.privacyConfigured);
  const gmailConnected = connectionState.gmailConnected;
  const calendarConnected = connectionState.calendarConnected;
  const urgentThreads = inboxItems.filter((thread: InboxThread) => hasBadge(thread, "Urgent") || isUrgentThread(thread));
  const replyThreads = inboxItems.filter((thread: InboxThread) => hasBadge(thread, "Needs reply")).slice(0, 4);
  const financeThreads = inboxItems.filter((thread: InboxThread) => hasBadge(thread, "Finance")).slice(0, 4);
  const calendarThreads = inboxItems.filter((thread: InboxThread) => hasBadge(thread, "Calendar")).slice(0, 4);
  const workThreads = inboxItems.filter((thread: InboxThread) => hasBadge(thread, "Work")).slice(0, 4);
  const updatesThreads = inboxItems.filter((thread: InboxThread) => hasBadge(thread, "Updates")).slice(0, 4);
  const followUpThreads = inboxItems.filter((thread: InboxThread) => hasBadge(thread, "Follow-up")).slice(0, 4);
  const priorityThreads = [...urgentThreads, ...replyThreads, ...financeThreads, ...calendarThreads, ...workThreads]
    .filter((thread: InboxThread, index: number, items: InboxThread[]) => items.findIndex((candidate) => candidate.id === thread.id) === index)
    .slice(0, 4);
  const todayEvents = normalizedCalendarEvents.filter((event) => isSameDay(event.startTime, today));
  const nextEvent = [...normalizedCalendarEvents]
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .find((event) => event.endTime >= today) ?? null;
  const inboxUnread = unreadCounts?.inbox ?? replyThreads.length;
  const archivedNoise = (unreadCounts?.spam ?? 0) + (unreadCounts?.trash ?? 0);
  const fyiThreads = inboxItems.filter((thread: InboxThread) => !hasBadge(thread, "Needs reply") && thread.isRead).slice(0, 3);
  const recentActions = normalizedAuditLogs.slice(0, 4);
  const aiUsage = billing?.usage?.ai ?? null;
  const plan = billing?.currentPlan ?? null;
  const intelligenceBuckets = [
    { label: "Urgent", value: urgentThreads.length, icon: Mail },
    { label: "Needs reply", value: replyThreads.length, icon: MessageSquareReply },
    { label: "Finance / banking", value: financeThreads.length, icon: Landmark },
    { label: "Work / hiring", value: workThreads.length, icon: BriefcaseBusiness },
    { label: "Calendar-related", value: calendarThreads.length, icon: CalendarDays },
    { label: "Follow-up", value: followUpThreads.length, icon: Sparkles },
    { label: "Social / updates", value: updatesThreads.length, icon: Newspaper },
    { label: "Archived noise", value: archivedNoise, icon: Inbox },
  ].filter((bucket) => bucket.value > 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Communication"
          value={gmailConnected && calendarConnected ? "Live" : gmailConnected || calendarConnected ? "Partial" : "Offline"}
          helper={`${gmailConnected ? "Gmail connected" : "Gmail disconnected"} · ${calendarConnected ? "Calendar connected" : "Calendar disconnected"}`}
          tone={gmailConnected && calendarConnected ? "good" : "warn"}
        />
        <SummaryCard
          label="Needs reply"
          value={String(replyThreads.length)}
          helper={replyThreads.length > 0 ? "Unread threads with reply signals" : "No immediate replies needed"}
          tone={replyThreads.length > 0 ? "warn" : "good"}
        />
        <SummaryCard
          label="Finance / alerts"
          value={String(financeThreads.length)}
          helper={financeThreads.length > 0 ? "Invoices, billing, and banking messages" : "No finance alerts today"}
          tone={financeThreads.length > 0 ? "warn" : "muted"}
        />
        <SummaryCard
          label="Meetings today"
          value={String(todayEvents.length)}
          helper={nextEvent ? `Next at ${format(nextEvent.startTime, "h:mm a")}` : "No meetings scheduled"}
        />
      </div>

      {digest?.digest ? (
        <div className="mt-5 max-w-3xl rounded-2xl border border-border/80 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground-subtle">
            <Activity className="h-4 w-4 text-accent" />
            Morning digest
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground-muted">
            {digest.digest}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-foreground-subtle">
            <span className="rounded-full border border-border bg-background/60 px-2.5 py-1">
              {digest.emailCount} email{digest.emailCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-border bg-background/60 px-2.5 py-1">
              {digest.eventCount} event{digest.eventCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid items-stretch gap-4 xl:grid-cols-3">
        <PanelCard title="Priority threads" icon={<Mail className="h-4 w-4" />} description="Top items from the inbox right now." className="xl:col-span-1">
          <ThreadList threads={priorityThreads} emptyLabel="No priority threads yet." />
        </PanelCard>

        <PanelCard title="Calendar summary" icon={<CalendarDays className="h-4 w-4" />} description="Meetings today and the next upcoming event." className="xl:col-span-1">
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">Today</div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {todayEvents.length ? `${todayEvents.length} meeting${todayEvents.length === 1 ? "" : "s"}` : "No meetings today"}
              </div>
              <div className="mt-2 text-sm text-foreground-muted">
                {todayEvents.length
                  ? todayEvents
                      .slice(0, 2)
                      .map((event) => `${format(event.startTime, "h:mm a")} · ${event.title}`)
                      .join(" · ")
                  : "Clear schedule so far."}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">Next meeting</div>
              {nextEvent ? (
                <>
                  <div className="mt-2 text-base font-semibold text-foreground">{nextEvent.title}</div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-foreground-muted">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{format(nextEvent.startTime, "EEE, h:mm a")}</span>
                  </div>
                  <div className="mt-1 text-sm text-foreground-subtle">
                    {nextEvent.location || nextEvent.attendeesSummary || "No additional details"}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-foreground-muted">No upcoming meeting in view.</div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">Meeting prep</div>
              <div className="mt-2 text-sm text-foreground-muted">
                {calendarConnected && privacyReady && aiEnabled
                  ? "Prep brief available for allowed attendees."
                  : "Enable calendar, privacy, and AI for meeting prep."}
              </div>
            </div>
          </div>
        </PanelCard>

        <PanelCard title="Trust / privacy" icon={<ShieldCheck className="h-4 w-4" />} description="Connection and AI posture at a glance." className="xl:col-span-1">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <StatusRow label="Gmail" value={gmailConnected ? "Connected" : "Disconnected"} tone={gmailConnected ? "good" : "warn"} />
            <StatusRow label="Calendar" value={calendarConnected ? "Connected" : "Disconnected"} tone={calendarConnected ? "good" : "warn"} />
            <StatusRow label="Privacy Gate" value={privacyReady ? "Configured" : "Needs setup"} tone={privacyReady ? "good" : "warn"} />
            <StatusRow label="AI" value={aiEnabled ? "Enabled" : "Disabled"} tone={aiEnabled ? "good" : "warn"} />
          </div>
        </PanelCard>
      </div>

      <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-3">
        <PanelCard title="Inbox intelligence" icon={<Inbox className="h-4 w-4" />} description="Useful counts without the noise." className="xl:col-span-1">
          <div className="space-y-3">
            {(intelligenceBuckets.length > 0 ? intelligenceBuckets : [
              { label: "FYI", value: fyiThreads.length, icon: Inbox },
              { label: "Archived noise", value: archivedNoise, icon: Inbox },
            ]).map((bucket) => (
              <CountRow key={bucket.label} label={bucket.label} value={String(bucket.value)} />
            ))}
          </div>
        </PanelCard>

        <PanelCard title="Needs reply" icon={<MessageSquareReply className="h-4 w-4" />} description="Unread items that look like they need a response." className="xl:col-span-1">
          <ThreadList
            threads={replyThreads}
            emptyLabel="No reply obligations right now."
            compact
            showSnippet
          />
        </PanelCard>

        <PanelCard title="Finance / important alerts" icon={<Landmark className="h-4 w-4" />} description="Messages tagged as finance, work, or scheduling signals." className="xl:col-span-1">
          <ThreadList
            threads={financeThreads.length > 0 ? financeThreads : calendarThreads.length > 0 ? calendarThreads : workThreads}
            emptyLabel="No finance or important alerts."
            compact
            showSnippet
          />
        </PanelCard>
      </div>

      <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-3">
        <PanelCard title="Calendar-related threads" icon={<CalendarDays className="h-4 w-4" />} description="Inbox items tied to scheduling and meeting coordination." className="xl:col-span-1">
          <ThreadList
            threads={calendarThreads.length > 0 ? calendarThreads : updatesThreads}
            emptyLabel="No calendar-related threads."
            compact
            showSnippet
          />
        </PanelCard>

        <PanelCard title="Recent actions" icon={<Send className="h-4 w-4" />} description="Latest approvals, sends, and mailbox changes." className="xl:col-span-1">
          <ActionList actions={recentActions} emptyLabel="No recent actions." />
        </PanelCard>

        <PanelCard title="Usage" icon={<Sparkles className="h-4 w-4" />} description="Plan and AI usage at a glance." className="xl:col-span-1">
          <div className="grid h-full content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MiniStat label="Plan" value={plan ? plan.toUpperCase() : "Unavailable"} />
            <MiniStat
              label="AI calls this month"
              value={aiUsage === null ? "Unavailable" : String(aiUsage)}
              helper={billing?.limits?.ai === null ? "Unlimited" : billing?.limits?.ai ? `of ${billing.limits.ai}` : undefined}
            />
          </div>
        </PanelCard>
      </div>
    </>
  );
}

export function DashboardDataSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-raised" />
            <div className="mt-3 h-6 w-16 animate-pulse rounded bg-surface-raised" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-surface-raised" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[1.5rem] border border-border bg-surface p-5">
            <div className="h-4 w-36 animate-pulse rounded bg-surface-raised" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-surface-raised" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="h-16 rounded-2xl bg-surface-raised animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelCard({
  title,
  description,
  icon,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("h-full rounded-[1.5rem] border border-border bg-surface p-5 shadow-[0_16px_34px_rgba(28,20,12,0.06)] dark:shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="text-accent">{icon}</span>
            {title}
          </div>
          <p className="mt-1 text-xs leading-5 text-foreground-subtle">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryCard({ label, value, helper, tone = "default" }: SummaryCardProps) {
  const toneClasses = {
    default: "border-border bg-white/80 dark:bg-background/60",
    good: "border-emerald-500/30 bg-emerald-500/10",
    warn: "border-amber-500/30 bg-amber-500/10",
    muted: "border-border bg-[rgba(255,255,255,0.72)] dark:bg-background/50",
  }[tone];

  return (
    <div className={cn("rounded-2xl border p-4", toneClasses)}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">{label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
      {helper ? <div className="mt-1 text-sm leading-5 text-foreground-muted">{helper}</div> : null}
    </div>
  );
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-[rgba(255,255,255,0.72)] px-4 py-3 dark:bg-background">
      <div className="text-sm text-foreground-muted">{label}</div>
      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", tone === "good" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300")}>
        {value}
      </span>
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-[rgba(255,255,255,0.72)] px-4 py-3 dark:bg-background">
      <div className="text-sm text-foreground-muted">{label}</div>
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
          tone === "good" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-[rgba(255,255,255,0.72)] p-4 dark:bg-background/60">
      <div className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">{label}</div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
      {helper ? <div className="mt-1 text-xs text-foreground-muted">{helper}</div> : null}
    </div>
  );
}

function CountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-[rgba(255,255,255,0.72)] px-4 py-3 dark:bg-background">
      <div className="text-sm text-foreground-muted">{label}</div>
      <div className="text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ThreadList({
  threads,
  emptyLabel,
  compact = false,
  showSnippet = false,
}: {
  threads: InboxThread[];
  emptyLabel: string;
  compact?: boolean;
  showSnippet?: boolean;
}) {
  if (threads.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className={cn("space-y-2", compact ? "space-y-2" : "space-y-3")}>
      {threads.map((thread) => (
        <Link
          key={thread.id}
          href={`/inbox/${thread.threadId}`}
          className="block rounded-2xl border border-border bg-[rgba(255,255,255,0.82)] px-4 py-3 transition-colors hover:bg-surface-raised dark:bg-background"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{thread.senderName}</div>
              <div className="mt-1 truncate text-sm text-foreground">{thread.subject}</div>
              {showSnippet ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-foreground-muted">{thread.snippet}</div> : null}
            </div>
            <div className="shrink-0 text-xs text-foreground-subtle">
              {thread.receivedAt ? formatDistanceToNow(new Date(thread.receivedAt), { addSuffix: true }) : "now"}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {thread.badges.slice(0, 3).map((badge) => (
              <span key={badge} className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]", badgeTone(badge))}>
                {badge}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

function ActionList({
  actions,
  emptyLabel,
}: {
  actions: AuditLog[];
  emptyLabel: string;
}) {
  if (actions.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div key={action.id} className="rounded-2xl border border-border bg-background px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{humanizeAction(action.action)}</div>
              <div className="mt-1 text-xs text-foreground-subtle">{formatActionDetails(action.details)}</div>
            </div>
            <div className="shrink-0 text-xs text-foreground-subtle">
              {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-foreground-subtle">
      {label}
    </div>
  );
}

function isUrgentThread(thread: InboxThread) {
  const haystack = `${thread.subject} ${thread.snippet} ${thread.tldr ?? ""}`.toLowerCase();
  return /\b(urgent|asap|action required|needs reply|follow up|important|deadline|today)\b/.test(haystack);
}

function hasBadge(thread: InboxThread, badge: string) {
  return thread.badges.some((item) => item.toLowerCase() === badge.toLowerCase());
}

function badgeTone(badge: string) {
  const normalized = badge.toLowerCase();
  if (normalized === "urgent" || normalized === "needs reply") {
    return "border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (normalized === "finance" || normalized === "work") {
    return "border-blue-300/60 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300";
  }
  if (normalized === "calendar" || normalized === "follow-up") {
    return "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (normalized === "private") {
    return "border-violet-300/60 bg-violet-50 text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300";
  }
  if (normalized === "updates") {
    return "border-stone-300/60 bg-stone-100 text-stone-700 dark:border-border dark:bg-surface dark:text-foreground-subtle";
  }
  return "border-border bg-surface-raised text-foreground-subtle dark:bg-surface dark:text-foreground-subtle";
}

function humanizeAction(action: string) {
  const map: Record<string, string> = {
    email_sent: "Email sent",
    email_archived: "Email archived",
    hitl_created: "Approval requested",
    hitl_resolved: "Approval resolved",
    settings_changed: "Settings changed",
    token_refreshed: "Token refreshed",
    admin_promoted: "Admin promoted",
    admin_demoted: "Admin demoted",
  };

  return map[action] ?? action.replace(/_/g, " ");
}

function formatActionDetails(details: Record<string, unknown> | unknown) {
  if (!details || typeof details !== "object") return "Activity recorded.";
  const record = details as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.actionType === "string") parts.push(record.actionType.replace(/_/g, " "));
  if (typeof record.decision === "string") parts.push(record.decision);
  if (typeof record.executed === "boolean") parts.push(record.executed ? "executed" : "pending");
  if (typeof record.type === "string") parts.push(record.type);
  return parts.length > 0 ? parts.join(" · ") : "Activity recorded.";
}
