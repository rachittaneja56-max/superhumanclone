import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";
import {
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  Keyboard,
  LockKeyhole,
  Mic,
  MessageSquareReply,
  MoveRight,
  PanelTop,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";

export const metadata = {
  title: "Aethra - Email and calendar, finally on your terms",
  description: "Privacy-first, agent-powered email and calendar workspace built on Corsair.",
};

type Session = Awaited<ReturnType<typeof getSession>>;

const REAL_FEATURES = [
  {
    title: "Command palette",
    body: "Quickly jump to mail, calendar, and actions from one keyboard-first launcher.",
    icon: Search,
  },
  {
    title: "Voice input",
    body: "Hold to speak in inbox, compose, and agent flows with live preview support.",
    icon: Mic,
  },
  {
    title: "Unified timeline",
    body: "Mail and calendar events sit on the same axis in the calendar timeline view.",
    icon: PanelTop,
  },
  {
    title: "Auto-reply panel",
    body: "Thread replies can be drafted in place from the existing auto-reply workflow.",
    icon: MessageSquareReply,
  },
  {
    title: "Meeting prep brief",
    body: "The calendar flow already builds a prep brief from allowed email context.",
    icon: FileText,
  },
];

export default async function MarketingPage() {
  const session = (await getSession()) as Session;
  const userId = session.userId;
  const ctaHref = userId ? "/inbox" : "/login?callbackUrl=/inbox";

  return (
    <div className="bg-dot-grid bg-background text-foreground dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_26%),linear-gradient(180deg,rgba(10,10,10,1),rgba(13,13,13,1))] dark:text-foreground">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.10),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(0,0,0,0.04),transparent_18%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.18),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.06),transparent_18%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-6 pb-16 pt-20 lg:px-8 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="max-w-2xl">
              <h1 className="mt-6 max-w-3xl text-5xl font-display font-semibold tracking-tight text-balance text-foreground sm:text-6xl lg:text-7xl dark:text-foreground">
                Run email, calendar, and approvals from one premium AI workspace.
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-foreground-muted sm:text-xl">
                Aethra triages mail, prepares summaries, drafts replies, schedules meetings, and waits for your approval before any write action leaves the queue.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={ctaHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground shadow-[0_12px_30px_rgba(245,158,11,0.18)] transition-transform hover:scale-[1.01]"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-raised dark:bg-surface/80"
                >
                  View demo
                  <MoveRight className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                {[
                  "Secure Google Workspace connection",
                  "Privacy-safe AI context",
                  "Approval-first actions",
                ].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-xs font-medium text-foreground-muted backdrop-blur dark:bg-surface/70"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div id="demo" className="relative">
              <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.16),transparent_55%)] blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(249,247,244,0.98))] shadow-[0_24px_80px_rgba(38,28,14,0.12)] dark:bg-[linear-gradient(180deg,rgba(20,20,20,0.96),rgba(12,12,12,0.98))] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground-subtle">Dashboard preview</div>
                    <div className="mt-1 text-sm text-foreground-muted">Upper dashboard frame with inbox, digest, and approval flow</div>
                  </div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Sync live
                  </span>
                </div>

                <div className="p-4 sm:p-5">
                  <MockDashboardSnapshot />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <SectionHeading
          eyebrow="Feature storytelling"
          title="The product does the work, but the page should explain the result."
          description=""
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              title: "Morning Digest",
              body: "What needs attention today, in one compact brief.",
              icon: Clock3,
            },
            {
              title: "Thread TL;DR",
              body: "See the summary before opening the thread.",
              icon: Sparkles,
            },
            {
              title: "Auto-reply drafts",
              body: "Direct, warm, and boundary-setting replies are already built in.",
              icon: MessageSquareReply,
            },
            {
              title: "Keyboard shortcuts",
              body: "Move fast without clicking everywhere.",
              icon: Keyboard,
            },
            {
              title: "Workspace context",
              body: "Ask Aethra using the current page or thread context you attached.",
              icon: BrainCircuit,
            },
            {
              title: "Human-in-the-Loop",
              body: "Approvals sit in front of send and create actions.",
              icon: Shield,
            },
            {
              title: "Privacy-safe AI",
              body: "Privacy Gate, blocked domains, and approval-first writes keep control in your hands.",
              icon: LockKeyhole,
            },
            {
              title: "Meeting prep + scheduling",
              body: "Smart fill, prep briefs, and Meet-friendly scheduling when the workflow supports it.",
              icon: CalendarDays,
            },
            {
              title: "Search / command workflow",
              body: "Find mail, launch actions, and jump to work from one control surface.",
              icon: Search,
            },
            ...REAL_FEATURES,
          ].map(({ title, body, icon: Icon }) => (
            <FeatureCard key={title} title={title} body={body} icon={<Icon className="h-4 w-4" />} />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <div className="grid gap-6 rounded-[2rem] border border-border bg-[linear-gradient(145deg,rgba(255,252,247,0.98),rgba(249,246,239,0.98))] p-6 shadow-[0_18px_50px_rgba(38,28,14,0.06)] lg:grid-cols-[0.9fr_1.1fr] lg:p-8 dark:bg-[linear-gradient(145deg,rgba(20,20,20,0.96),rgba(14,14,14,0.98))] dark:shadow-none">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground-muted backdrop-blur dark:bg-background/50">
              Live workflow demo
            </div>
            <h2 className="mt-4 text-3xl font-display font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
              Natural language in, tool activity visible, approval card out.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-foreground-muted">
              The landing page should feel like the product is already operating, not just promising future automation.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { label: "You", body: "Summarize inbox and draft a reply for the meeting thread." },
              { label: "Aethra", body: "Thread TL;DR and reply draft are ready. Summary uses the active thread context." },
              { label: "Tools", body: "Search, summary generation, and draft shaping run in sequence." },
              { label: "Approval required", body: "The send action becomes a HITL card before anything leaves the queue." },
            ].map((line, index) => (
              <div key={`${line.label}-${index}`} className="flex gap-3 rounded-2xl border border-border bg-background/90 p-4 shadow-[0_8px_24px_rgba(38,28,14,0.04)] dark:bg-surface/70 dark:shadow-none">
                <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-accent/15" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">{line.label}</div>
                  <div className="mt-1 text-sm leading-6 text-foreground-muted">{line.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <SectionHeading
          eyebrow="Pricing"
          title="Clear tiers for individual use, heavy workflows, and shared workspaces."
          description="No billing clutter. Just the plan differences you asked to emphasize."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <PricingCard
            name="Free"
            price="$0"
            summary="Core inbox, calendar, and limited AI"
            features={[
              "50 AI calls / month",
              "Core Gmail + Calendar",
              "Basic agent access",
            ]}
            ctaLabel="Get started"
            href={ctaHref}
            muted
          />
          <PricingCard
            name="Pro"
            price={undefined}
            summary="Heavy AI usage and premium workflows"
            features={[
              "Unlimited AI calls",
              "Meeting prep + smart scheduling",
              "Priority workflows",
            ]}
            ctaLabel="Contact us"
            href="mailto:hello@aethra.ai"
            featured
          />
          <PricingCard
            name="Team"
            price="Contact us"
            summary="Shared workspaces and future admin controls"
            features={[
              "Unlimited AI calls",
              "Admin-ready workspace",
              "Future shared inbox support",
            ]}
            ctaLabel="Contact us"
            href="mailto:hello@aethra.ai"
            muted
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.10),transparent_26%),linear-gradient(180deg,rgba(255,252,247,0.98),rgba(249,246,239,0.98))] px-6 py-10 shadow-[0_18px_50px_rgba(38,28,14,0.06)] sm:px-10 sm:py-12 dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),transparent_26%),linear-gradient(180deg,rgba(18,18,18,0.98),rgba(12,12,12,0.98))] dark:shadow-none">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground-muted backdrop-blur dark:bg-background/60">
                <LockKeyhole className="h-3.5 w-3.5 text-accent" />
                Privacy and approvals stay first
              </div>
              <h2 className="mt-4 text-3xl font-display font-semibold tracking-tight text-balance sm:text-4xl">
                Aethra keeps the workspace premium without pretending to be magic.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground-muted">
                Secure Google Workspace connection, privacy-safe AI, approval-first actions, and no destructive autonomous writes by default.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground transition-transform hover:scale-[1.01]"
              >
                Connect your workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface/80 px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-raised"
              >
                Try demo
              </a>
            </div>
          </div>
        </div>
      </section>

      {!userId && (
        <section className="mx-auto w-full max-w-4xl px-6 pb-24 lg:px-8">
          <div className="rounded-[2rem] border border-border bg-surface/80 p-8 text-center shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            <h2 className="text-3xl font-display font-semibold tracking-tight text-foreground">Try Aethra with your workspace context.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-foreground-muted">
              Connect Gmail and Calendar, then let Aethra surface summaries, drafts, scheduling, and approvals in one place.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-6 py-3.5 text-sm font-semibold text-foreground"
              >
                View demo
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground-subtle">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-display font-bold tracking-tight text-balance text-foreground sm:text-4xl">{title}</h2>
      {description ? <p className="mt-3 text-sm leading-7 text-foreground-muted sm:text-base">{description}</p> : null}
    </div>
  );
}

function FeatureCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-background/90 p-5 shadow-[0_10px_30px_rgba(38,28,14,0.04)] dark:bg-background/80">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">{icon}</div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-foreground-muted">{body}</p>
    </div>
  );
}

function MockDashboardSnapshot() {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,247,244,0.98))] shadow-[0_16px_40px_rgba(38,28,14,0.08)] dark:bg-[linear-gradient(180deg,rgba(24,24,24,0.95),rgba(15,15,15,0.98))] dark:shadow-none">
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground-subtle">Dashboard</div>
          <div className="mt-1 text-sm text-foreground-muted">Upper frame</div>
        </div>
        <div className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground-muted">
          4 urgent items
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-background/90 p-3 dark:bg-background/80">
          <div className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">Unread</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">12</div>
          <div className="mt-1 text-xs text-foreground-muted">3 high priority</div>
        </div>
        <div className="rounded-2xl border border-border bg-background/90 p-3 dark:bg-background/80">
          <div className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">Digest</div>
          <div className="mt-2 text-sm font-medium text-foreground">Morning brief ready</div>
          <div className="mt-1 text-xs text-foreground-muted">Meetings and replies surfaced</div>
        </div>
        <div className="rounded-2xl border border-border bg-background/90 p-3 dark:bg-background/80">
          <div className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">Approvals</div>
          <div className="mt-2 text-sm font-medium text-foreground">1 pending HITL</div>
          <div className="mt-1 text-xs text-foreground-muted">Ready for review</div>
        </div>
      </div>

      <div className="mx-4 mb-4 rounded-[1.5rem] border border-border bg-surface/80 p-4 dark:bg-surface/70">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Inbox snapshot</div>
          <div className="text-xs text-foreground-muted">Priority + TL;DR</div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="rounded-2xl border border-border bg-background/90 p-3 dark:bg-background/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">Product team</div>
                <div className="mt-1 text-sm text-foreground-muted">Confirming the 7:00 PM meet</div>
              </div>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                Urgent
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background/90 p-3 dark:bg-background/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">Customer follow-up</div>
                <div className="mt-1 text-sm text-foreground-muted">TL;DR ready before open</div>
              </div>
              <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle">
                Medium
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-3 bg-gradient-to-r from-transparent via-border/80 to-transparent" />
    </div>
  );
}

function PricingCard({
  name,
  price,
  summary,
  features,
  ctaLabel,
  href,
  featured = false,
  muted = false,
}: {
  name: string;
  price?: string;
  summary: string;
  features: string[];
  ctaLabel: string;
  href: string;
  featured?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "flex h-full flex-col rounded-[1.75rem] border p-6",
        featured
          ? "border-accent/30 bg-[linear-gradient(180deg,rgba(255,248,235,0.98),rgba(255,242,217,0.98))] shadow-[0_18px_50px_rgba(245,158,11,0.10)] dark:bg-[linear-gradient(180deg,rgba(35,25,10,0.96),rgba(18,14,8,0.98))] dark:shadow-[0_18px_50px_rgba(245,158,11,0.08)]"
          : "border-border bg-surface/80",
      ].join(" ")}
    >
      <div className={featured ? "flex flex-col gap-3" : "flex items-baseline justify-between gap-4"}>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-foreground">{name}</div>
          <div className="mt-1 text-sm text-foreground-muted">{summary}</div>
        </div>
        {price ? <div className="shrink-0 text-xl font-semibold text-foreground">{price}</div> : null}
      </div>
      <div className="mt-6 space-y-3">
        {features.map((feature) => (
          <div key={feature} className="flex items-start gap-2 text-sm text-foreground-muted">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Link
          href={href}
          className={[
            "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-colors",
            featured
              ? "bg-accent text-accent-foreground hover:bg-accent/90"
              : muted
                ? "border border-border bg-background text-foreground hover:bg-surface-raised"
                : "bg-accent text-accent-foreground",
          ].join(" ")}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
