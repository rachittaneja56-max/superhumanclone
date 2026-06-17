"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Mail, MessageSquareText, Sparkles, Users } from "lucide-react";

export function MeetingPrepBriefDialog({
  open,
  onClose,
  eventId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string | null;
  title: string;
}) {
  const briefMutation = trpc.calendar.generatePrepBrief.useMutation();

  useEffect(() => {
    if (!open || !eventId) return;
    briefMutation.mutate(
      { eventId },
      {
        onError: () => toast.error("Could not generate a prep brief."),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId]);

  const brief = briefMutation.data;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            Prep brief
          </DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        {briefMutation.isPending ? (
          <div className="flex items-center justify-center py-12 text-sm text-foreground-muted">
            Building a safe brief from allowed email context...
          </div>
        ) : brief ? (
          <div className="grid gap-4">
            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Summary</div>
              <p className="mt-2 text-sm leading-6 text-foreground">{brief.summary}</p>
            </section>

            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
                <Users className="h-4 w-4" />
                Who is attending
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {brief.attendees.length ? brief.attendees.join(", ") : "No attendee list available."}
              </p>
            </section>

            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
                <Mail className="h-4 w-4" />
                Recent relevant emails
              </div>
              <div className="mt-3 space-y-3">
                {brief.recentEmails.length ? (
                  brief.recentEmails.map((email, index) => (
                    <div key={`${email.receivedAt}-${index}`} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-foreground-muted">
                        <span className="font-medium text-foreground">{email.sender}</span>
                        <span>{new Date(email.receivedAt).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-sm font-medium text-foreground">{email.subject}</div>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground-muted">{email.snippet}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-foreground-muted">No safe matching emails found.</p>
                )}
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Open questions</div>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground-muted">
                  {brief.openQuestions.length ? brief.openQuestions.map((item, index) => <li key={index}>• {item}</li>) : <li>Nothing flagged yet.</li>}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
                  <MessageSquareText className="h-4 w-4" />
                  Talking points
                </div>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground-muted">
                  {brief.talkingPoints.length ? brief.talkingPoints.map((item, index) => <li key={index}>• {item}</li>) : <li>Nothing suggested yet.</li>}
                </ul>
              </div>
            </section>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-foreground-muted">Open a meeting brief to review the context.</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
