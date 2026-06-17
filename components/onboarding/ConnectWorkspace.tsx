"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Calendar, Loader2, Mail, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useFormStatus } from "react-dom";

import { continueToDashboard, disconnectCalendar, disconnectGmail } from "@/app/onboarding/connect/actions";

type IntegrationState = {
  gmailConnected: boolean;
  calendarConnected: boolean;
};

export function ConnectWorkspace({
  firstName,
  gmailConnectUrl,
  calendarConnectUrl,
  initialGmailConnected,
  initialCalendarConnected,
}: {
  firstName: string;
  gmailConnectUrl: string;
  calendarConnectUrl: string;
  initialGmailConnected: boolean;
  initialCalendarConnected: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<IntegrationState>({
    gmailConnected: initialGmailConnected,
    calendarConnected: initialCalendarConnected,
  });
  const [pending, setPending] = useState<"gmail" | "calendar" | null>(null);

  const allConnected = state.gmailConnected && state.calendarConnected;
  const canContinue = allConnected;

  const statusText = useMemo(() => {
    if (allConnected) return "Gmail and Calendar are connected. You can continue to the dashboard.";
    if (state.gmailConnected || state.calendarConnected) return "One connection is ready. Finish the second one to continue.";
    return "Connect Gmail and Calendar to finish setup.";
  }, [allConnected, state.calendarConnected, state.gmailConnected]);

  const handleConnect = (url: string, integration: "gmail" | "calendar") => {
    setPending(integration);
    window.location.assign(url);
  };

  const handleDisconnect = async (integration: "gmail" | "calendar") => {
    const confirmText = integration === "gmail" ? "Disconnect Gmail?" : "Disconnect Calendar?";
    if (!window.confirm(confirmText)) return;

    const snapshot = state;
    setPending(integration);
    setState((current) => ({
      gmailConnected: integration === "gmail" ? false : current.gmailConnected,
      calendarConnected: integration === "calendar" ? false : current.calendarConnected,
    }));

    try {
      if (integration === "gmail") {
        await disconnectGmail();
      } else {
        await disconnectCalendar();
      }

      toast.success(`${integration === "gmail" ? "Gmail" : "Calendar"} disconnected.`);
      router.refresh();
    } catch {
      setState(snapshot);
      toast.error(`Could not disconnect ${integration === "gmail" ? "Gmail" : "Calendar"}.`);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10 font-sans">
      <div className="mb-10 text-center">
        <h1 className="mb-4 text-4xl font-heading font-bold tracking-tight text-foreground md:text-5xl">
          Welcome, <span className="text-accent">{firstName}</span>
        </h1>
        <p className="mx-auto max-w-lg text-base text-muted-foreground md:text-lg">
          Let&apos;s connect Gmail and Calendar so Aethra can sync your inbox, schedule meetings, and unlock the workspace.
        </p>
      </div>

      <div className="w-full max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Mail className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Calendar className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="ml-auto rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground-muted">
            Secure setup
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-heading font-bold text-foreground">Google Workspace</h2>
          <span
            className={
              allConnected
                ? "rounded-full bg-tag-green/10 px-2.5 py-1 text-xs font-medium text-tag-green"
                : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400"
            }
          >
            {allConnected ? "Connected" : "Setup required"}
          </span>
        </div>

        <p className="mb-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Connect Gmail and Google Calendar in one place. Gmail powers inbox sync, and Calendar unlocks scheduling and meeting links.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <ServiceCard
            label="Gmail"
            description="Inbox sync, sends, replies, and thread actions."
            connected={state.gmailConnected}
            pending={pending === "gmail"}
            onConnect={() => handleConnect(gmailConnectUrl, "gmail")}
            onDisconnect={() => void handleDisconnect("gmail")}
          />
          <ServiceCard
            label="Calendar"
            description="Meetings, availability, and Google Meet links."
            connected={state.calendarConnected}
            pending={pending === "calendar"}
            onConnect={() => handleConnect(calendarConnectUrl, "calendar")}
            onDisconnect={() => void handleDisconnect("calendar")}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-accent" />
            <div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">Setup status</h3>
              <p className="text-sm leading-6 text-muted-foreground">{statusText}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground-muted">
            {canContinue ? "Everything is ready." : "Both services are required before you can continue."}
          </p>
          <form action={continueToDashboard} className="w-full sm:w-auto">
            <ContinueButton disabled={!canContinue} />
          </form>
        </div>
      </div>
    </div>
  );
}

function ContinueButton({ disabled }: { disabled: boolean }) {
  const { pending: formPending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || formPending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-accent-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      style={{ backgroundColor: "var(--accent)" }}
    >
      {formPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {formPending ? "Continuing…" : "Continue to Dashboard"}
    </button>
  );
}

function ServiceCard({
  label,
  description,
  connected,
  pending,
  onConnect,
  onDisconnect,
}: {
  label: string;
  description: string;
  connected: boolean;
  pending: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <span
              className={
                connected
                  ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
                  : "rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400"
              }
            >
              {connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">{description}</p>
        </div>
      </div>

      <div className="mt-4">
        {connected ? (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-background px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {label === "Gmail" ? "Connect Gmail" : "Connect Calendar"}
          </button>
        )}
      </div>
    </div>
  );
}
