"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Mail, Calendar, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
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

  const canContinue = state.gmailConnected;
  const allConnected = state.gmailConnected && state.calendarConnected;

  const statusText = useMemo(() => {
    if (allConnected) return "All integrations active. You are ready to proceed.";
    if (state.gmailConnected) return "Gmail connected. Calendar is optional but recommended.";
    return "Please connect Gmail to continue.";
  }, [allConnected, state.gmailConnected]);

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

  const handleConnect = (url: string, integration: "gmail" | "calendar") => {
    setPending(integration);
    window.location.assign(url);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 font-sans">
      <div className="mb-10 text-center">
        <h1 className="mb-4 text-4xl font-heading font-bold tracking-tight text-foreground md:text-5xl">
          Welcome, <span className="text-accent">{firstName}</span>
        </h1>
        <p className="mx-auto max-w-lg text-base text-muted-foreground md:text-lg">
          Let&apos;s connect your workspace accounts to bootstrap your integrations and prepare your AI workflows.
        </p>
      </div>

      <div className="mb-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-tag-red">
            <Mail className="h-6 w-6" />
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-tag-blue">
            <Calendar className="h-6 w-6" />
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-heading font-bold text-foreground">Google Workspace</h2>
          {allConnected && (
            <span className="rounded-full bg-tag-green/10 px-2.5 py-1 text-xs font-medium text-tag-green">
              Connected
            </span>
          )}
        </div>

        <p className="mb-8 text-[15px] leading-relaxed text-muted-foreground">
          Connect your Google Account to authorize Aethra to sync your emails, drafts, and calendar events. This enables your AI assistant to draft emails and schedule meetings.
        </p>

        <div className="flex flex-col justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
            <IntegrationChip
              label="Gmail connected"
              connected={state.gmailConnected}
              pending={pending === "gmail"}
              onConnect={() => handleConnect(gmailConnectUrl, "gmail")}
              onDisconnect={() => void handleDisconnect("gmail")}
            />
            <IntegrationChip
              label="Calendar connected"
              connected={state.calendarConnected}
              pending={pending === "calendar"}
              onConnect={() => handleConnect(calendarConnectUrl, "calendar")}
              onDisconnect={() => void handleDisconnect("calendar")}
            />
          </div>

          <form action={continueToDashboard} className="w-full sm:w-auto">
            <button
              type="submit"
              disabled={!canContinue}
              className="inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-accent-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Continue to Dashboard
            </button>
          </form>
        </div>
      </div>

      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-accent" />
          <div>
            <h3 className="mb-1 text-base font-semibold text-foreground">Onboarding Status</h3>
            <p className="text-sm text-muted-foreground">{statusText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationChip({
  label,
  connected,
  pending,
  onConnect,
  onDisconnect,
}: {
  label: string;
  connected: boolean;
  pending: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return connected ? (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-tag-green">
        <CheckCircle2 className="h-5 w-5" />
        <span>{label}</span>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-destructive/20 bg-background px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Disconnect
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={onConnect}
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label.includes("Gmail") ? "Connect Gmail" : "Connect Calendar"}
    </button>
  );
}
