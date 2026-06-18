"use client";

import { useEffect, useState } from "react";
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
  const utils = trpc.useUtils();
  const { data: settings = initialSettings } = trpc.settings.getUserSettings.useQuery(
    {},
    {
      initialData: initialSettings,
      staleTime: 60_000,
    }
  );
  const [optimisticSettings, setOptimisticSettings] = useState<SettingsModel | null>(null);
  const [pendingKey, setPendingKey] = useState<keyof SettingsModel | null>(null);
  const resolvedSettings = optimisticSettings ?? settings ?? initialSettings;

  useEffect(() => {
    if (!optimisticSettings) return;
    const next = settings ?? initialSettings;
    if (
      next.aiEnabled === optimisticSettings.aiEnabled &&
      next.morningDigestEnabled === optimisticSettings.morningDigestEnabled &&
      next.draftSuggestionsEnabled === optimisticSettings.draftSuggestionsEnabled &&
      next.autoTagEnabled === optimisticSettings.autoTagEnabled
    ) {
      setOptimisticSettings(null);
      setPendingKey(null);
    }
  }, [initialSettings, optimisticSettings, settings]);

  const updateMutation = trpc.settings.updateSetting.useMutation();

  const toggle = (key: "aiEnabled" | "morningDigestEnabled" | "draftSuggestionsEnabled" | "autoTagEnabled", value: boolean) => {
    const previous = resolvedSettings;
    setOptimisticSettings({ ...previous, [key]: value });
    setPendingKey(key);

    updateMutation.mutate(
      { key, value },
      {
        onSuccess: async () => {
          toast.success("Settings saved");
          await utils.settings.getUserSettings.invalidate();
          setOptimisticSettings(null);
          setPendingKey(null);
        },
        onError: () => {
          setOptimisticSettings(null);
          setPendingKey(null);
          toast.error("Failed to save");
        },
      }
    );
  };

  const aiRows = [
    {
      key: "aiEnabled" as const,
      label: "Enable AI",
      description: "Turns on AI features across mail, calendar, and agent workflows.",
      value: resolvedSettings?.aiEnabled ?? false,
    },
    {
      key: "morningDigestEnabled" as const,
      label: "Enable Morning Digest",
      description: "Shows the morning digest card when you ask for it.",
      value: resolvedSettings?.morningDigestEnabled ?? false,
    },
    {
      key: "draftSuggestionsEnabled" as const,
      label: "Enable Reply Suggestions",
      description: "Generates Direct, Warm, and Boundary-setting reply drafts.",
      value: resolvedSettings?.draftSuggestionsEnabled ?? false,
    },
    {
      key: "autoTagEnabled" as const,
      label: "Enable Auto-tagging",
      description: "Categorizes mail after it lands.",
      value: resolvedSettings?.autoTagEnabled ?? false,
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
              resolvedSettings?.aiEnabled ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-background text-foreground-muted"
            )}
          >
            {resolvedSettings?.aiEnabled ? "AI on" : "AI off"}
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
              onCheckedChange={(value) => toggle(row.key, value === true)}
              disabled={updateMutation.isPending || (row.key !== "aiEnabled" && !resolvedSettings?.aiEnabled)}
              aria-busy={updateMutation.isPending && pendingKey === row.key}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
