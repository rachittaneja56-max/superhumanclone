"use client";

import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Archive, Calendar, Forward, MailCheck, MailOpen, Reply, ReplyAll, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EmailThreadClientItem } from "@/lib/email-client";
import { SmartSchedulerModal } from "@/components/calendar/SmartSchedulerModal";

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
  const markUnread = trpc.email.markUnread.useMutation({
    onSuccess: () => toast.success("Marked unread"),
    onError: () => toast.error("Failed to update read state"),
  });
  const archiveMutation = trpc.email.archiveEmail.useMutation({
    onSuccess: () => toast.success("Archived"),
    onError: () => toast.error("Failed to archive"),
  });
  const deleteMutation = trpc.email.deleteEmail.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.email.getThread.invalidate({ threadId }),
        utils.email.getMailboxThreads.invalidate(),
        utils.email.getUnreadCounts.invalidate(),
      ]).catch(() => null);
      onDeleted?.();
      toast.success("Moved to trash");
    },
    onError: () => toast.error("Failed to delete"),
  });
  const restoreMutation = trpc.email.restoreEmail.useMutation({
    onSuccess: () => toast.success("Restored from trash"),
    onError: () => toast.error("Failed to restore"),
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const typedThread = (thread as EmailThreadClientItem[] | undefined) ?? [];
  const firstEmailId = typedThread[0]?.id;

  useEffect(() => {
    if (!typedThread.length) return;
    const unread = typedThread.filter((email) => !email.isRead);
    if (unread.length > 0) {
      markRead.mutate({ emailIds: unread.map((email) => email.id).slice(0, 50) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEmailId]);

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

  const subject = typedThread[0]?.subject || "(No Subject)";
  const showTldr = typedThread[0]?.tldr && !typedThread[0]?.aiTriageSkipped;
  const primaryEmailId = typedThread[0]?.threadId || typedThread[0]?.id || "";
  const latest = typedThread[typedThread.length - 1];
  const unreadIds = typedThread.filter((email) => !email.isRead).map((email) => email.id);
  const hasUnread = unreadIds.length > 0;
  const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const forwardSubject = subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`;
  const handleReplyCompose = (mode: "reply" | "replyAll" | "forward") => {
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
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface font-sans">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="max-w-[40rem] truncate font-display text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-[1.75rem]">
            {subject}
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            {typedThread.length} message{typedThread.length === 1 ? "" : "s"} in this thread
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <ActionButton onClick={() => handleReplyCompose("reply")} icon={<Reply className="h-4 w-4" />} label="Reply" />
          <ActionButton onClick={() => handleReplyCompose("replyAll")} icon={<ReplyAll className="h-4 w-4" />} label="Reply all" />
          <ActionButton onClick={() => handleReplyCompose("forward")} icon={<Forward className="h-4 w-4" />} label="Forward" />
          <ActionButton onClick={() => setScheduleOpen(true)} icon={<Calendar className="h-4 w-4" />} label="Schedule this" />
          {mailbox === "trash" ? (
            <ActionButton
              onClick={() => restoreMutation.mutate({ emailId: primaryEmailId })}
              icon={<RotateCcw className="h-4 w-4" />}
              label="Restore"
            />
          ) : (
            <>
              <ActionButton
                onClick={() =>
                  hasUnread
                    ? markRead.mutate({ emailIds: unreadIds.slice(0, 50) })
                    : markUnread.mutate({ emailIds: [latest.id] })
                }
                icon={hasUnread ? <MailCheck className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                label={hasUnread ? "Mark read" : "Mark unread"}
              />
              <ActionButton onClick={() => archiveMutation.mutate({ emailId: primaryEmailId })} icon={<Archive className="h-4 w-4" />} label="Archive" />
              <ActionButton
                onClick={() => deleteMutation.mutate({ emailId: primaryEmailId })}
                icon={<Trash2 className="h-4 w-4" />}
                label="Trash"
                destructive
              />
            </>
          )}
        </div>

        {showTldr && (
          <div
            className="mt-5 rounded-xl p-4 text-sm leading-6 text-[var(--text)]"
            style={{
              backgroundColor: "var(--accent-subtle)",
              borderLeft: "3px solid var(--accent)",
            }}
          >
            <strong>TL;DR:</strong> {typedThread[0]?.tldr}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {typedThread.map((email, index) => (
            <EmailMessageCard key={email.id} email={email} showRecipientSummary={index === 0} />
          ))}
        </div>
      </div>

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
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="h-7 w-2/3 animate-pulse rounded bg-surface-overlay" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-surface-overlay" />
      </div>
      <div className="flex-1 space-y-4 p-4 sm:p-5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-surface p-5">
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-overlay" />
            <div className="mt-4 h-24 animate-pulse rounded bg-surface-overlay" />
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
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
        destructive
          ? "border-border bg-background text-red-500 hover:bg-red-500/10"
          : "border-border bg-background text-foreground hover:bg-surface-raised",
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
      className="overflow-hidden rounded-2xl border p-6 shadow-sm"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        borderLeft: !email.isRead ? "2px solid var(--accent)" : "1px solid var(--border)",
      }}
    >
      <div className="mb-5 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-[var(--text)]">{email.senderName}</div>
            <div className="mt-1 text-xs text-foreground-subtle">{createdLabel}</div>
            {showRecipientSummary && (
              <div className="mt-2 text-xs text-foreground-subtle">{email.recipientSummary}</div>
            )}
          </div>
        </div>
      </div>

      {email.bodyHtml ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <iframe
            srcDoc={email.bodyHtml}
            sandbox=""
            referrerPolicy="no-referrer"
            title={`Email from ${email.senderName}`}
            className="block w-full border-0"
            style={{ height: "min(72vh, 50rem)" }}
          />
        </div>
      ) : (
        <div className="space-y-4 text-[15px] leading-7 text-[var(--text)]">
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
