"use client";

import { useMemo } from "react";
import { PencilLine, ShieldAlert, Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc/client";

const VARIANT_LABELS = ["Direct", "Warm", "Boundary-setting"] as const;

export function AutoReplyPanel({ emailId, onSelect }: { emailId: string; onSelect: (text: string) => void }) {
  const { data: settings } = trpc.settings.getUserSettings.useQuery({}, { staleTime: 60_000 });
  const allowSuggestions = Boolean(settings?.aiEnabled && settings?.draftSuggestionsEnabled && settings?.privacyConfigured);

  const { data: replies = [] } = trpc.email.getAutoReplies.useQuery(
    { emailId },
    {
      enabled: allowSuggestions,
      staleTime: Infinity,
      retry: 1,
    }
  );

  const content = useMemo(() => {
    if (!allowSuggestions) {
      return (
        <UnavailableState
          title="Reply suggestions unavailable"
          body="Turn on AI, Reply Suggestions, and Privacy Gate to use editable reply drafts."
        />
      );
    }

    if (!replies.length) {
      return (
        <UnavailableState
          title="Generating suggestions..."
          body="Aethra is preparing three reply drafts for this thread."
          pulse
        />
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Reply Suggestions</h3>
            <p className="mt-1 text-xs text-foreground-muted">Pick a draft to edit before sending.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground-muted shadow-sm">
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            Editable drafts
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-3">
          {replies.slice(0, 3).map((reply, index) => (
            <button
              key={reply.id}
              type="button"
              onClick={() => onSelect(reply.reply_text)}
              className="group flex min-h-[7.5rem] flex-col rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:border-accent/30 hover:bg-accent/5"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <div className="text-sm font-medium text-foreground">{VARIANT_LABELS[index] ?? "Reply"}</div>
              </div>
              <p className="mt-2 line-clamp-4 text-xs leading-5 text-foreground-muted">{reply.reply_text}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }, [allowSuggestions, onSelect, replies]);

  return <div className="border-t border-border bg-background/80 px-4 py-3 sm:px-6">{content}</div>;
}

function UnavailableState({ title, body, pulse = false }: { title: string; body: string; pulse?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm shadow-sm ${pulse ? "animate-pulse" : ""}`}>
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 text-xs leading-5 text-foreground-muted">{body}</div>
      </div>
    </div>
  );
}
