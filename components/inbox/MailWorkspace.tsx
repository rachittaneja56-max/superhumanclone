"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SquarePen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useUndoSend } from "@/hooks/useUndoSend";
import type { EmailListClientItem } from "@/lib/email-client";
import { ThreadEmptyState, ThreadView } from "./ThreadView";

type Folder = "inbox" | "drafts" | "sent" | "spam" | "trash";

const FOLDER_LABELS: Record<Folder, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sent: "Sent",
  spam: "Spam",
  trash: "Trash",
};

export function MailWorkspace({
  initialThreads,
  initialFolder,
  initialComposeOpen,
}: {
  initialThreads: EmailListClientItem[];
  initialFolder: Folder;
  initialComposeOpen: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(initialComposeOpen);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const folder = normalizeFolder(searchParams.get("folder") ?? initialFolder);
  const composeFromUrl = searchParams.get("compose") === "true";
  const selectedThreadFromUrl = searchParams.get("thread");

  const mailboxQuery = trpc.email.getMailboxThreads.useQuery(
    { folder, limit: 50, query },
    {
      initialData: folder === initialFolder && !query ? initialThreads : undefined,
      placeholderData: (prev: EmailListClientItem[] | undefined) => prev,
      refetchOnWindowFocus: false,
    }
  );

  const threads = (mailboxQuery.data ?? initialThreads) as EmailListClientItem[];
  const selected = useMemo(
    () => threads.find((thread) => (thread.threadId || thread.id) === activeThreadId) || null,
    [threads, activeThreadId]
  );
  const sendMutation = trpc.email.sendEmail.useMutation();
  const { startUndoWindow } = useUndoSend();

  useEffect(() => {
    setComposeOpen(composeFromUrl || initialComposeOpen);
  }, [composeFromUrl, initialComposeOpen]);

  useEffect(() => {
    if (!threads.length) {
      setActiveThreadId(null);
      return;
    }

    const threadFromUrl =
      selectedThreadFromUrl && threads.some((thread) => thread.threadId === selectedThreadFromUrl)
        ? selectedThreadFromUrl
        : null;

    setActiveThreadId(threadFromUrl || threads[0].threadId || threads[0].id);
  }, [folder, selectedThreadFromUrl, threads]);

  const replaceSearch = (params: URLSearchParams) => {
    const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(target);
  };

  const closeCompose = () => {
    setComposeOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("compose");
    replaceSearch(params);
  };

  const openThread = (threadId: string) => {
    setActiveThreadId(threadId);
    if (window.matchMedia("(min-width: 1280px)").matches) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("thread", threadId);
      replaceSearch(params);
      return;
    }
    router.push(`/inbox/${threadId}`);
  };

  const handleSend = async (payload: { to: string; subject: string; body: string; threadId?: string }) => {
    try {
      const res = await sendMutation.mutateAsync({
        to: [payload.to],
        subject: payload.subject,
        body: payload.body,
        threadId: payload.threadId,
      });
      startUndoWindow(res.undoToken);
      closeCompose();
      toast.success("Queued for send");
    } catch {
      toast.error("Failed to start send");
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-[var(--background)] text-[var(--text)]">
      <main className="flex min-w-0 flex-1 flex-col border-r border-border">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold sm:text-2xl">{FOLDER_LABELS[folder]}</h1>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {threads.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">
              {folder === "drafts" ? "Saved drafts ready to finish." : "Recent messages in your workspace."}
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto sm:min-w-[20rem] sm:flex-1 sm:max-w-xl">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-foreground-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mail"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
              />
            </div>
            <button
              onClick={() => setComposeOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-accent-foreground sm:hidden"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <SquarePen className="h-4 w-4" />
              Compose
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mailboxQuery.isLoading && threads.length === 0 ? (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-3 sm:px-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="w-full animate-pulse rounded-2xl border border-border bg-surface px-4 py-4">
                  <div className="h-4 w-1/3 rounded bg-surface-overlay" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-surface-overlay" />
                  <div className="mt-3 h-3 w-full rounded bg-surface-overlay" />
                </div>
              ))}
            </div>
          ) : mailboxQuery.isError ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-foreground-muted">
              We couldn&apos;t load this mailbox right now.
            </div>
          ) : threads.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-foreground-muted">
              No mail in this folder yet.
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-3 sm:px-4">
              {threads.map((thread) => {
                const id = thread.threadId || thread.id;
                const active = id === activeThreadId;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      if (folder === "drafts") {
                        setActiveThreadId(id);
                        return;
                      }
                      openThread(id);
                    }}
                    className={[
                      "w-full overflow-hidden rounded-2xl border px-4 py-4 text-left transition-colors",
                      active
                        ? "border-accent/40 bg-accent/8"
                        : "border-border bg-surface hover:bg-surface-overlay",
                    ].join(" ")}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {thread.senderName || "Unknown sender"}
                        </div>
                        <div className="mt-1 truncate text-sm text-foreground">
                          {thread.subject || "(no subject)"}
                        </div>
                        <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-foreground-muted">
                          {thread.snippet || "No preview available."}
                        </div>
                        {thread.badges.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {thread.badges.slice(0, 2).map((badge) => (
                              <span
                                key={badge}
                                className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-foreground-subtle"
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs text-foreground-subtle">
                        {thread.receivedAt ? formatDistanceToNow(new Date(thread.receivedAt), { addSuffix: true }) : "Unknown"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <aside className="hidden w-[32rem] shrink-0 border-l border-border bg-surface xl:block">
        <div className="h-full min-h-0">
          {selected ? (
            folder === "drafts" ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-sm rounded-2xl border border-dashed border-border bg-background/40 p-8 text-center">
                  <div className="text-sm font-medium text-foreground">Draft preview</div>
                  <p className="mt-2 text-sm leading-6 text-foreground-muted">
                    Drafts stay compact in this view. Use compose to finish and send them.
                  </p>
                </div>
              </div>
            ) : (
              <ThreadView threadId={selected.threadId || selected.id} compact />
            )
          ) : (
            <ThreadEmptyState />
          )}
        </div>
      </aside>

      {composeOpen && <ComposeModal onClose={closeCompose} onSend={handleSend} />}
    </div>
  );
}

function ComposeModal({
  onClose,
  onSend,
}: {
  onClose: () => void;
  onSend: (payload: { to: string; subject: string; body: string; threadId?: string }) => Promise<void>;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="font-medium">Compose</div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5">
            Close
          </button>
        </div>
        <div className="space-y-3 p-4">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="w-full rounded-lg border border-border bg-transparent px-3 py-2 outline-none" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border border-border bg-transparent px-3 py-2 outline-none" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message..." className="min-h-56 w-full rounded-lg border border-border bg-transparent px-3 py-2 outline-none" />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={() => onSend({ to, subject, body })}
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeFolder(value: string | null): Folder {
  if (value === "drafts" || value === "sent" || value === "spam" || value === "trash") {
    return value;
  }
  return "inbox";
}
