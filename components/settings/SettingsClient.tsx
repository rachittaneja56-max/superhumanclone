"use client";

import { trpc } from "@/lib/trpc/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SettingsModel = {
  aiEnabled?: boolean;
  morningDigestEnabled?: boolean;
  draftSuggestionsEnabled?: boolean;
  autoTagEnabled?: boolean;
  privacyConfigured?: boolean;
  gmailConnected?: boolean;
  calendarConnected?: boolean;
};

export function SettingsClient({ initialSettings }: { initialSettings: SettingsModel }) {
  const { data: settings = initialSettings } = trpc.settings.getUserSettings.useQuery(
    {},
    {
      initialData: initialSettings,
      staleTime: 60_000,
    }
  );

  const updateMutation = trpc.settings.updateSetting.useMutation({
    onSuccess: () => toast.success("Setting saved"),
    onError: () => toast.error("Failed to save"),
  });

  const toggle = (key: "aiEnabled" | "morningDigestEnabled" | "draftSuggestionsEnabled" | "autoTagEnabled", value: boolean) => {
    updateMutation.mutate({ key, value });
  };

  const aiRows = [
    {
      key: "aiEnabled" as const,
      label: "Enable AI",
      description: "Turns on AI features across mail, calendar, and agent workflows.",
      value: settings?.aiEnabled ?? false,
    },
    {
      key: "morningDigestEnabled" as const,
      label: "Enable Morning Digest",
      description: "Shows the morning digest card when you ask for it.",
      value: settings?.morningDigestEnabled ?? false,
    },
    {
      key: "draftSuggestionsEnabled" as const,
      label: "Enable Reply Suggestions",
      description: "Generates Direct, Warm, and Boundary-setting reply drafts.",
      value: settings?.draftSuggestionsEnabled ?? false,
    },
    {
      key: "autoTagEnabled" as const,
      label: "Enable Auto-tagging",
      description: "Categorizes mail after it lands.",
      value: settings?.autoTagEnabled ?? false,
    },
  ];

  return (
    <section className="rounded-3xl border border-border bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">AI Features</h2>
            <p className="mt-1 text-sm text-foreground-muted">Choose the AI features you want Aethra to use.</p>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium",
              settings?.aiEnabled ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-background text-foreground-muted"
            )}
          >
            {settings?.aiEnabled ? "AI on" : "AI off"}
          </span>
        </div>
      </div>

      <div className="divide-y divide-border">
        {aiRows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <p className="mt-1 text-xs leading-5 text-foreground-muted">{row.description}</p>
            </div>
            <Switch
              checked={row.value}
              onCheckedChange={(value) => toggle(row.key, value)}
              disabled={updateMutation.isPending}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
