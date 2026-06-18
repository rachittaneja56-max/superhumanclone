"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { formatMorningDigest } from "@/lib/morning-digest";

export function MorningDigestBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data: settings } = trpc.settings.getUserSettings.useQuery({}, { staleTime: 60_000 });
  const digestQuery = trpc.email.getMorningDigest.useQuery(
    {},
    {
      enabled: false,
      retry: 1,
    }
  );

  if (dismissed || !settings?.morningDigestEnabled) return null;

  const hasDigest = Boolean(digestQuery.data?.digest);
  const digestPresentation = digestQuery.data?.digest ? formatMorningDigest(digestQuery.data.digest, 2) : null;

  return (
    <div className="border-b border-border bg-surface px-4 py-3">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3 shadow-sm">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Morning Digest</p>
              <p className="mt-1 text-xs text-foreground-muted">
                Generate a short snapshot of today&apos;s email and calendar items.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void digestQuery.refetch();
              }}
              disabled={digestQuery.isFetching}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              {digestQuery.isFetching ? "Generating..." : hasDigest ? "Regenerate" : "Generate"}
            </button>
          </div>

          {digestQuery.isFetching ? (
            <p className="mt-3 text-sm text-foreground-muted">Preparing your digest...</p>
          ) : digestPresentation ? (
            <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-surface/60 p-3">
              <p className="text-sm font-medium leading-6 text-foreground">{digestPresentation.headline}</p>
              {digestPresentation.bullets.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-foreground-muted">
                  {digestPresentation.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span className="min-w-0">{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg p-1 text-foreground-subtle hover:bg-surface-raised hover:text-foreground"
          aria-label="Dismiss digest"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
