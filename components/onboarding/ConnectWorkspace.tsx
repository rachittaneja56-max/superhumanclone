"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Mail, Calendar, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { continueToDashboard, disconnectCalendar, disconnectGmail } from "@/app/onboarding/connect/actions";
import { useFormStatus } from "react-dom";

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

      <div className="mb-8 w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] md:p-8">
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

        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-heading font-bold text-foreground">Google Workspace</h2>
          {allConnected && (
            <span className="rounded-full bg-tag-green/10 px-2.5 py-1 text-xs font-medium text-tag-green">
              Connected
            </span>
          )}
        </div>

        <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Connect Gmail to power inbox sync. Calendar is optional and unlocks meeting scheduling and Google Meet links.
        </p>

        <div className="mb-6 grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-2">
          <StatusRow label="Gmail" active={state.gmailConnected} />
          <StatusRow label="Calendar" active={state.calendarConnected} />
        </div>

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
            <ContinueButton disabled={!canContinue} />
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

function ContinueButton({ disabled }: { disabled: boolean }) {
  const { pending: formPending } = useFormStatus();
  const isPending = formPending;

  return (
    <button
      type="submit"
      disabled={disabled || isPending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-accent-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundColor: "var(--accent)" }}
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {isPending ? "Continuing…" : "Continue to Dashboard"}
    </button>
  );
}

function StatusRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className={active ? "text-sm font-medium text-accent" : "text-sm text-foreground-muted"}>
        {active ? "Connected" : "Not connected"}
      </span>
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
