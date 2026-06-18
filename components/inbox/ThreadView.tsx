"use client";

import React, { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Calendar, Forward, MailOpen, Reply, ReplyAll, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { EmailThreadClientItem } from "@/lib/email-client";
import { SmartSchedulerModal } from "@/components/calendar/SmartSchedulerModal";
import { AutoReplyPanel } from "@/components/inbox/AutoReplyPanel";

const EMPTY_THREAD: EmailThreadClientItem[] = [];

export function ThreadView({
  threadId,
  compact = false,
  mailbox = "inbox",
  onReplyCompose,
  onDeleted,
}: {
  threadId: string;
  compact?: boolean;
  mailbox?: "inbox" | "drafts" | "sent" | "spam" | "trash";
  onReplyCompose?: (draft: {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body?: string;
    threadId?: string;
  }) => void;
  onDeleted?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: thread, isLoading, isError } = trpc.email.getThread.useQuery({ threadId });
  const markRead = trpc.email.markRead.useMutation();
  const restoreMutation = trpc.email.restoreEmail.useMutation({
    onSuccess: () => toast.success("Restored from trash"),
    onError: () => toast.error("Failed to restore"),
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const typedThread = (thread as EmailThreadClientItem[] | undefined) ?? EMPTY_THREAD;
  const firstEmailId = typedThread[0]?.id;

  useEffect(() => {
    if (!typedThread.length) return;
    const unread = typedThread.filter((email) => !email.isRead);
    if (unread.length > 0) {
      markRead.mutate({ emailIds: unread.map((email) => email.id).slice(0, 50) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEmailId]);


  const subject = typedThread[0]?.subject || "(No Subject)";
  const showTldr = typedThread[0]?.tldr && !typedThread[0]?.aiTriageSkipped;
  const primaryEmailId = typedThread[0]?.threadId || typedThread[0]?.id || "";
  const latest = typedThread[typedThread.length - 1];
  const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const forwardSubject = subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`;
  const handleReplyCompose = useCallback((mode: "reply" | "replyAll" | "forward") => {
    if (!onReplyCompose) {
      toast.error("Compose is unavailable right now.");
      return;
    }

    onReplyCompose(
      mode === "forward"
        ? {
            subject: forwardSubject,
            body: `\n\n--- Forwarded message ---\nFrom: ${latest?.senderName || latest?.senderAddress || ""}\nDate: ${latest?.createdAt ? new Date(latest.createdAt).toLocaleString() : ""}\nSubject: ${subject}\n`,
            threadId,
          }
        : {
            to:
              mode === "replyAll"
                ? Array.from(
                    new Set(
                      typedThread
                        .flatMap((email) => [email.senderAddress, email.recipientAddress])
                        .filter(Boolean) as string[]
                    )
                  ).join(", ")
                : latest?.senderAddress || "",
            subject: replySubject,
            body: `\n\nOn ${latest?.createdAt ? new Date(latest.createdAt).toLocaleString() : "a previous date"}, ${latest?.senderName || latest?.senderAddress || "someone"} wrote:\n`,
            threadId,
        }
    );
  }, [forwardSubject, latest, onReplyCompose, replySubject, subject, threadId, typedThread]);

  useEffect(() => {
    const onReply = () => handleReplyCompose("reply");
    const onReplyAll = () => handleReplyCompose("replyAll");
    const onForward = () => handleReplyCompose("forward");

    window.addEventListener("aethra:thread-reply", onReply);
    window.addEventListener("aethra:thread-reply-all", onReplyAll);
    window.addEventListener("aethra:thread-forward", onForward);

    return () => {
      window.removeEventListener("aethra:thread-reply", onReply);
      window.removeEventListener("aethra:thread-reply-all", onReplyAll);
      window.removeEventListener("aethra:thread-forward", onForward);
    };
  }, [handleReplyCompose]);

  if (isLoading) {
    return <ThreadLoading compact={compact} />;
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-foreground-muted">
        Could not load this thread right now.
      </div>
    );
  }

  if (!typedThread.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-foreground-muted">
        No emails found in this thread.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background font-sans">
      <div className="shrink-0 border-b border-border bg-[rgba(255,255,255,0.86)] px-4 py-4 backdrop-blur dark:bg-surface/95 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="max-w-[42rem] truncate font-display text-xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              {subject}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
              <span className="font-medium text-foreground-subtle">
                {typedThread.length} message{typedThread.length === 1 ? "" : "s"}
              </span>
              <span aria-hidden="true">•</span>
              <span className="truncate">
                From {typedThread[0]?.senderName || typedThread[0]?.senderAddress || "Unknown sender"}
              </span>
              {showTldr ? (
                <>
                  <span aria-hidden="true">•</span>
                  <span className="truncate">
                    Updated {latest?.createdAt ? formatDateLabel(latest.createdAt) : "just now"}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 lg:justify-end">
            <ActionButton onClick={() => handleReplyCompose("reply")} icon={<Reply className="h-4 w-4" />} label="Reply" />
            <ActionButton onClick={() => handleReplyCompose("replyAll")} icon={<ReplyAll className="h-4 w-4" />} label="Reply all" />
            <ActionButton onClick={() => handleReplyCompose("forward")} icon={<Forward className="h-4 w-4" />} label="Forward" />
            <ActionButton onClick={() => setScheduleOpen(true)} icon={<Calendar className="h-4 w-4" />} label="Schedule" />
            {mailbox === "trash" ? (
              <ActionButton
                onClick={() => restoreMutation.mutate({ emailId: primaryEmailId })}
                icon={<RotateCcw className="h-4 w-4" />}
                label="Restore"
              />
            ) : null}
          </div>
        </div>

        {showTldr && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-background/80 px-4 py-3 text-sm leading-6 text-foreground-muted shadow-sm dark:bg-surface/70">
            <span className="inline-flex shrink-0 items-center rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              TL;DR
            </span>
            <p className="min-w-0">
              {typedThread[0]?.tldr}
            </p>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:gap-4">
          {typedThread.map((email, index) => (
            <EmailMessageCard key={email.id} email={email} showRecipientSummary={index === 0} />
          ))}
        </div>
      </div>

      {mailbox === "inbox" && firstEmailId && onReplyCompose ? (
        <AutoReplyPanel
          emailId={firstEmailId}
          onSelect={(text) =>
            onReplyCompose({
              to: latest?.senderAddress || "",
              subject: replySubject,
              body: text,
              threadId,
            })
          }
        />
      ) : null}

      <SmartSchedulerModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        threadId={threadId}
      />
    </div>
  );
}

export function ThreadEmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <MailOpen className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold text-foreground">Select a conversation</div>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          Open a thread to read the conversation, review safe recipients, and use reply actions here.
        </p>
      </div>
    </div>
  );
}

function ThreadLoading({ compact }: { compact: boolean }) {
  return (
    <div className={compact ? "flex h-full flex-col" : "flex h-full flex-col"}>
      <div className="border-b border-border bg-[rgba(255,255,255,0.86)] px-4 py-4 sm:px-6 dark:bg-surface/95">
        <div className="h-6 w-1/2 animate-pulse rounded bg-surface-overlay" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-surface-overlay" />
      </div>
      <div className="flex-1 space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[1.5rem] border border-border bg-background p-5 shadow-[0_8px_24px_rgba(38,28,14,0.04)] dark:bg-surface">
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-overlay" />
            <div className="mt-4 h-20 animate-pulse rounded bg-surface-overlay" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  destructive = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        destructive
          ? "border-border bg-background text-red-600 hover:bg-red-500/10 dark:text-red-400"
          : "border-border bg-background/90 text-foreground hover:bg-surface-raised dark:bg-background/70",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function EmailMessageCard({
  email,
  showRecipientSummary,
}: {
  email: EmailThreadClientItem;
  showRecipientSummary: boolean;
}) {
  const createdLabel = formatDateLabel(email.createdAt);

  return (
    <div
      className="overflow-hidden rounded-[1.5rem] border bg-background p-4 shadow-[0_8px_24px_rgba(38,28,14,0.04)] sm:p-5 dark:bg-surface"
      style={{
        borderColor: "var(--border)",
        borderLeft: !email.isRead ? "2px solid var(--accent)" : "1px solid var(--border)",
      }}
    >
      <div className="mb-4 border-b pb-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground sm:text-base">{email.senderName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-subtle">
              <span>{createdLabel}</span>
              {showRecipientSummary ? (
                <>
                  <span aria-hidden="true">•</span>
                  <span className="truncate">{email.recipientSummary}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {email.bodyHtml ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <iframe
            srcDoc={email.bodyHtml}
            sandbox=""
            referrerPolicy="no-referrer"
            title={`Email from ${email.senderName}`}
            className="block min-h-[32rem] w-full border-0"
            style={{ height: "min(88vh, 60rem)" }}
          />
        </div>
      ) : (
        <div className="space-y-4 text-[15px] leading-7 text-foreground sm:text-[16px]">
          {renderReadableText(email.bodyText || email.snippet || "No content available.")}
        </div>
      )}
    </div>
  );
}

function formatDateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown date";
}

function renderReadableText(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph, index) => (
      <p key={index} className="whitespace-pre-wrap break-words">
        {paragraph}
      </p>
    ));
}


