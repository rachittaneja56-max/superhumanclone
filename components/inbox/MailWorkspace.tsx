"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, ChevronRight, DraftingCompass, Inbox, Send, ShieldAlert, SquarePen, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useUndoSend } from "@/hooks/useUndoSend";

type Folder = "inbox" | "drafts" | "sent" | "spam" | "trash";

const FOLDERS: { id: Folder; label: string; icon: any }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "drafts", label: "Drafts", icon: DraftingCompass },
  { id: "sent", label: "Sent", icon: Send },
  { id: "spam", label: "Spam", icon: ShieldAlert },
  { id: "trash", label: "Trash", icon: Trash2 },
];

export function MailWorkspace({ initialThreads }: { initialThreads: any[] }) {
  const router = useRouter();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const { data: threads = initialThreads } = trpc.email.getMailboxThreads.useQuery(
    { folder, limit: 50, query },
    { initialData: folder === "inbox" ? initialThreads : undefined, placeholderData: (prev: any) => prev, refetchOnWindowFocus: false }
  );

  const selected = useMemo(() => threads.find((t: any) => (t.threadId || t.id) === activeThreadId) || threads[0], [threads, activeThreadId]);
  const sendMutation = trpc.email.sendEmail.useMutation();
  const { startUndoWindow } = useUndoSend();

  useEffect(() => {
    if (!threads.length) return;
    setActiveThreadId((prev) => prev || (threads[0].threadId || threads[0].id));
  }, [threads]);

  const handleSend = async (payload: { to: string; subject: string; body: string; threadId?: string }) => {
    try {
      const res = await sendMutation.mutateAsync({
        to: [payload.to],
        subject: payload.subject,
        body: payload.body,
        threadId: payload.threadId,
      });
      startUndoWindow(res.undoToken);
      setComposeOpen(false);
      toast.success("Queued for send");
    } catch {
      toast.error("Failed to start send");
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-[var(--background)] text-[var(--text)]">
      <aside className="w-64 shrink-0 border-r border-border bg-[var(--surface)] p-4">
        <button
          onClick={() => setComposeOpen(true)}
          className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium"
          style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
        >
          <SquarePen className="h-4 w-4" />
          Compose
        </button>
        <div className="space-y-1">
          {FOLDERS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setFolder(item.id)}
                className={[
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  folder === item.id ? "bg-[var(--accent-subtle)] font-medium" : "hover:bg-black/5 dark:hover:bg-white/5",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col border-r border-border">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold capitalize">{folder}</h1>
            <p className="text-sm text-foreground-muted">
              {threads.length} {folder === "drafts" ? "drafts" : "messages"}
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail"
            className="w-80 rounded-xl border border-border bg-transparent px-4 py-2 text-sm outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-foreground-muted">
              No mail in this folder yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {threads.map((thread: any) => {
                const id = thread.threadId || thread.id;
                const active = id === activeThreadId;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveThreadId(id);
                      if (folder !== "drafts") router.push(`/inbox/${id}`);
                    }}
                    className={[
                      "block w-full px-5 py-4 text-left transition-colors",
                      active ? "bg-[var(--accent-subtle)]" : "hover:bg-black/5 dark:hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{thread.fromName || thread.from_name || thread.fromAddress || thread.from_address || "Unknown"}</div>
                        <div className="truncate text-sm">{thread.subject || "(no subject)"}</div>
                        <div className="truncate text-xs text-foreground-muted">{thread.snippet || thread.body || "No preview available."}</div>
                      </div>
                      <div className="shrink-0 text-xs text-foreground-muted">
                        {thread.receivedAt ? formatDistanceToNow(new Date(thread.receivedAt), { addSuffix: true }) : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <aside className="w-[360px] shrink-0 bg-[var(--surface)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-foreground-muted">Details</h2>
          <CalendarDays className="h-4 w-4 text-foreground-muted" />
        </div>
        {selected ? (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="text-sm font-medium">{selected.subject || "(no subject)"}</div>
            <div className="text-sm text-foreground-muted">{selected.fromName || selected.from_name || selected.fromAddress || selected.from_address}</div>
            <div className="text-sm text-foreground-muted">{selected.snippet || "Open the thread to view the full message."}</div>
            <button
              onClick={() => router.push(`/inbox/${selected.threadId || selected.id}`)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              Open thread
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-foreground-muted">
            Pick a thread and we’ll show the useful bits here.
          </div>
        )}
      </aside>

      {composeOpen && (
        <ComposeModal onClose={() => setComposeOpen(false)} onSend={handleSend} />
      )}
    </div>
  );
}

function ComposeModal({ onClose, onSend }: { onClose: () => void; onSend: (payload: { to: string; subject: string; body: string; threadId?: string }) => Promise<void> }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="font-medium">Compose</div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5">Close</button>
        </div>
        <div className="space-y-3 p-4">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="w-full rounded-lg border border-border bg-transparent px-3 py-2 outline-none" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border border-border bg-transparent px-3 py-2 outline-none" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message..." className="min-h-56 w-full rounded-lg border border-border bg-transparent px-3 py-2 outline-none" />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">Cancel</button>
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
