"use client";

import { ChangeEvent, type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, DraftingCompass, Inbox, Loader2, Mic, MicOff, RefreshCw, Search, Send, ShieldAlert, Square, SquarePen, Trash2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useUndoSend } from "@/hooks/useUndoSend";
import { useUIStore } from "@/store/ui-store";
import { mapEmailForListClient, type EmailListClientItem } from "@/lib/email-client";
import { sendEmailSchema } from "@/lib/schemas";
import { ThreadView } from "./ThreadView";
import { useSpeechToText } from "@/hooks/useSpeechToText";

type Folder = "inbox" | "drafts" | "sent" | "spam" | "trash";
export type ComposeDraft = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  threadId?: string;
};

const FOLDER_LABELS: Record<Folder, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sent: "Sent",
  spam: "Spam",
  trash: "Trash",
};

const MAILBOX_ITEMS: Array<{ folder: Folder; label: string; icon: ComponentType<{ className?: string }> }> = [
  { folder: "inbox", label: "Inbox", icon: Inbox },
  { folder: "drafts", label: "Drafts", icon: DraftingCompass },
  { folder: "sent", label: "Sent", icon: Send },
  { folder: "spam", label: "Spam", icon: ShieldAlert },
  { folder: "trash", label: "Trash", icon: Trash2 },
];

const PAGE_SIZE = 20;
type MailboxPage = {
  items: EmailListClientItem[];
  nextPageToken: string | null;
};
const AI_COMMANDS = [
  { id: "improve_tone", label: "Improve" },
  { id: "make_shorter", label: "Shorten" },
  { id: "make_formal", label: "Formal" },
  { id: "convert_to_bullets", label: "Bullets" },
  { id: "translate", label: "Translate" },
] as const;

export function MailWorkspace({
  initialMailboxPage,
  initialFolder,
  initialComposeOpen,
}: {
  initialMailboxPage: MailboxPage;
  initialFolder: Folder;
  initialComposeOpen: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(initialComposeOpen);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<EmailListClientItem[]>(initialMailboxPage.items);
  const [nextPageToken, setNextPageToken] = useState<string | null>(initialMailboxPage.nextPageToken);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pushFocusLayer = useUIStore((state) => state.pushFocusLayer);
  const popFocusLayer = useUIStore((state) => state.popFocusLayer);

  const folder = normalizeFolder(searchParams.get("folder") ?? initialFolder);
  const composeFromUrl = searchParams.get("compose") === "true";
  const selectedThreadFromUrl = searchParams.get("thread");
  const isSearchMode = debouncedQuery.length >= 2;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const mailboxQuery = trpc.email.getMailboxThreads.useQuery(
    { folder, limit: PAGE_SIZE, offset: 0, query: "" },
    {
      enabled: debouncedQuery.length < 2,
      initialData: folder === initialFolder ? initialMailboxPage : undefined,
      refetchOnWindowFocus: false,
    }
  );
  const searchQuery = trpc.search.textSearch.useQuery(
    { query: debouncedQuery, limit: 50 },
    {
      enabled: debouncedQuery.length >= 2,
      refetchOnWindowFocus: false,
    }
  );
  const unreadCountsQuery = trpc.email.getUnreadCounts.useQuery({});

  const searchThreads = useMemo(
    () =>
      (searchQuery.data ?? []).map((row) =>
        mapEmailForListClient({
          ...row,
        }),
      ),
    [searchQuery.data],
  );
  const currentMailboxPage = useMemo(() => {
    if (isSearchMode) {
      return { items: searchThreads, nextPageToken: null };
    }

    if (mailboxQuery.data) {
      return mailboxQuery.data as MailboxPage;
    }

    if (folder === initialFolder) {
      return initialMailboxPage;
    }

    return { items: [], nextPageToken: null };
  }, [folder, initialFolder, initialMailboxPage, isSearchMode, mailboxQuery.data, searchThreads]);
  const hasMore = !isSearchMode && Boolean(nextPageToken);
  const isRefreshing = mailboxQuery.isFetching || searchQuery.isFetching;
  const visibleThreads = isSearchMode ? searchThreads : threads;
  const isInitialListLoading = isSearchMode ? searchQuery.isLoading : mailboxQuery.isLoading;

  const selected = useMemo(
    () => visibleThreads.find((thread) => (thread.threadId || thread.id) === activeThreadId) || null,
    [activeThreadId, visibleThreads]
  );
  const sendMutation = trpc.email.sendEmail.useMutation();
  const archiveMutation = trpc.email.archiveEmail.useMutation();
  const deleteMutation = trpc.email.deleteEmail.useMutation();
  const markReadMutation = trpc.email.markRead.useMutation();
  const markUnreadMutation = trpc.email.markUnread.useMutation();
  const { startUndoWindow, countdown, cancel: cancelUndo, isPending: undoPending } = useUndoSend();

  useEffect(() => {
    setComposeOpen(composeFromUrl || initialComposeOpen);
  }, [composeFromUrl, initialComposeOpen]);

  useEffect(() => {
    if (!composeOpen) return;

    pushFocusLayer();
    return () => popFocusLayer();
  }, [composeOpen, popFocusLayer, pushFocusLayer]);

  useEffect(() => {
    const focusSearch = () => searchInputRef.current?.focus();
    window.addEventListener("aethra:focus-mail-search", focusSearch as EventListener);
    return () => window.removeEventListener("aethra:focus-mail-search", focusSearch as EventListener);
  }, []);

  useEffect(() => {
    const incoming = currentMailboxPage;
    setThreads(incoming.items);
    setNextPageToken(incoming.nextPageToken);
  }, [currentMailboxPage, folder, initialMailboxPage]);

  useEffect(() => {
    if (isSearchMode) return;

    setActiveThreadId(null);
    setThreads(folder === initialFolder ? initialMailboxPage.items : []);
    setNextPageToken(folder === initialFolder ? initialMailboxPage.nextPageToken : null);
  }, [folder, initialFolder, initialMailboxPage, isSearchMode]);

  useEffect(() => {
    if (!selectedThreadFromUrl) {
      setActiveThreadId(null);
      return;
    }

    const exists = visibleThreads.some((thread) => (thread.threadId || thread.id) === selectedThreadFromUrl);
    setActiveThreadId(exists ? selectedThreadFromUrl : null);
  }, [selectedThreadFromUrl, visibleThreads]);

  const replaceSearch = useCallback((params: URLSearchParams) => {
    const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(target);
  }, [pathname, router]);

  const openFolder = useCallback((nextFolder: Folder) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("folder", nextFolder);
    params.delete("thread");
    params.delete("compose");
    replaceSearch(params);
  }, [replaceSearch, searchParams]);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeDraft(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("compose");
    replaceSearch(params);
  }, [replaceSearch, searchParams]);

  const closeThread = useCallback(() => {
    setActiveThreadId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("thread");
    replaceSearch(params);
  }, [replaceSearch, searchParams]);

  const openThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    if (window.matchMedia("(min-width: 1280px)").matches) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("thread", threadId);
      replaceSearch(params);
      return;
    }
    router.push(`/inbox/${threadId}`);
  }, [replaceSearch, router, searchParams]);

  const openReplyComposer = useCallback((draft: ComposeDraft) => {
    setComposeDraft(draft);
    setComposeOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("compose", "true");
    replaceSearch(params);
  }, [replaceSearch, searchParams]);

  const refreshMailbox = useCallback(() => {
    if (isSearchMode) {
      void searchQuery.refetch();
      return;
    }

    void mailboxQuery.refetch();
  }, [isSearchMode, mailboxQuery, searchQuery]);

  useEffect(() => {
    const openCompose = () => setComposeOpen(true);
    const moveThread = (direction: 1 | -1) => {
      if (!visibleThreads.length) return;
      const currentId = activeThreadId ?? selected?.threadId ?? selected?.id ?? visibleThreads[0].threadId ?? visibleThreads[0].id;
      const currentIndex = visibleThreads.findIndex((thread) => (thread.threadId || thread.id) === currentId);
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = Math.min(visibleThreads.length - 1, Math.max(0, startIndex + direction));
      const nextThread = visibleThreads[nextIndex];
      const nextId = nextThread?.threadId || nextThread?.id;
      if (nextId) {
        openThread(nextId);
      }
    };
    const openCurrent = () => {
      const id = activeThreadId ?? selected?.threadId ?? selected?.id ?? visibleThreads[0]?.threadId ?? visibleThreads[0]?.id;
      if (id) openThread(id);
    };
    const archiveCurrent = async () => {
      const id = selected?.threadId || selected?.id;
      if (!id) return;
      try {
        await archiveMutation.mutateAsync({ emailId: id });
        closeThread();
      } catch {
        toast.error("Failed to archive mail.");
      }
    };
    const trashCurrent = async () => {
      const id = selected?.threadId || selected?.id;
      if (!id) return;
      try {
        await deleteMutation.mutateAsync({ emailId: id });
        closeThread();
      } catch {
        toast.error("Failed to trash mail.");
      }
    };
    const toggleReadCurrent = async () => {
      const id = selected?.threadId || selected?.id;
      if (!id) return;
      try {
        if (selected?.isRead) {
          await markUnreadMutation.mutateAsync({ emailIds: [id] });
        } else {
          await markReadMutation.mutateAsync({ emailIds: [id] });
        }
      } catch {
        toast.error("Failed to update read state.");
      }
    };
    const handleShortcut = (event: Event) => {
      const key = (event as CustomEvent).type;
      if (key === "aethra:compose-open") openCompose();
      if (key === "aethra:thread-next") moveThread(1);
      if (key === "aethra:thread-prev") moveThread(-1);
      if (key === "aethra:thread-open") openCurrent();
      if (key === "aethra:thread-archive") void archiveCurrent();
      if (key === "aethra:thread-trash") void trashCurrent();
      if (key === "aethra:thread-toggle-read") void toggleReadCurrent();
      if (key === "aethra:escape-all") {
        if (composeOpen) closeCompose();
        if (selected) closeThread();
      }
    };

    window.addEventListener("aethra:compose-open", handleShortcut);
    window.addEventListener("aethra:thread-next", handleShortcut);
    window.addEventListener("aethra:thread-prev", handleShortcut);
    window.addEventListener("aethra:thread-open", handleShortcut);
    window.addEventListener("aethra:thread-archive", handleShortcut);
    window.addEventListener("aethra:thread-trash", handleShortcut);
    window.addEventListener("aethra:thread-toggle-read", handleShortcut);
    window.addEventListener("aethra:escape-all", handleShortcut);
    return () => {
      window.removeEventListener("aethra:compose-open", handleShortcut);
      window.removeEventListener("aethra:thread-next", handleShortcut);
      window.removeEventListener("aethra:thread-prev", handleShortcut);
      window.removeEventListener("aethra:thread-open", handleShortcut);
      window.removeEventListener("aethra:thread-archive", handleShortcut);
      window.removeEventListener("aethra:thread-trash", handleShortcut);
      window.removeEventListener("aethra:thread-toggle-read", handleShortcut);
      window.removeEventListener("aethra:escape-all", handleShortcut);
    };
  }, [
    activeThreadId,
    archiveMutation,
    closeCompose,
    closeThread,
    composeOpen,
    deleteMutation,
    markReadMutation,
    markUnreadMutation,
    openThread,
    selected,
    visibleThreads,
  ]);

  const fetchMore = useCallback(async () => {
    if (isFetchingMore || !nextPageToken || mailboxQuery.isLoading || isSearchMode) return;

    setIsFetchingMore(true);
    try {
      const nextPage = await utils.email.getMailboxThreads.fetch({
        folder,
        limit: PAGE_SIZE,
        offset: threads.length,
        pageToken: nextPageToken,
        query: "",
      });

      setThreads((prev) => {
        const seen = new Set(prev.map((item) => item.threadId || item.id));
        const merged = [...prev];
        for (const item of nextPage.items ?? []) {
          const key = item.threadId || item.id;
          if (!seen.has(key)) {
            merged.push(item);
            seen.add(key);
          }
        }
        return merged;
      });
      setNextPageToken(nextPage.nextPageToken ?? null);
    } catch {
      toast.error("Could not load more mail right now.");
    } finally {
      setIsFetchingMore(false);
    }
  }, [folder, isFetchingMore, isSearchMode, mailboxQuery.isLoading, nextPageToken, threads.length, utils.email.getMailboxThreads]);

  const handleSend = async (payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    threadId?: string;
  }) => {
    try {
      const res = await sendMutation.mutateAsync(payload);
      startUndoWindow(res.undoToken);
      closeCompose();
      toast.success("Queued for send");
    } catch {
      toast.error("Failed to start send");
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col">
        {!selected && (
          <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-xl font-semibold sm:text-2xl">{FOLDER_LABELS[folder]}</h1>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {visibleThreads.length}
                  </span>
                  {folder === "inbox" && unreadCountsQuery.data && (
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground-muted">
                      {unreadCountsQuery.data.inbox} unread
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground-muted">
                  {folder === "drafts"
                    ? "Drafts stay saved while you work."
                    : "Click a conversation to open the thread view."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {MAILBOX_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = folder === item.folder;

                    return (
                      <button
                        key={item.folder}
                        type="button"
                        onClick={() => openFolder(item.folder)}
                        className={[
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          isActive
                            ? "border-accent/30 bg-accent/10 text-accent"
                            : "border-border bg-background text-foreground-muted hover:bg-surface-raised hover:text-foreground",
                        ].join(" ")}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 sm:max-w-xl">
                  <Search className="h-4 w-4 shrink-0 text-foreground-subtle" />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search mail"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
                  />
                </div>
                <button
                  onClick={refreshMailbox}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised"
                >
                  <RefreshCw className={["h-4 w-4", isRefreshing ? "animate-spin" : ""].join(" ")} />
                  Refresh
                </button>
                <button
                  onClick={() => setComposeOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-transform hover:scale-[1.01]"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  <SquarePen className="h-4 w-4" />
                  Compose
                </button>
              </div>
            </div>

            {undoPending && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent-subtle px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    Email scheduled to send{typeof countdown === "number" ? ` in ${countdown}s` : ""}
                  </div>
                  <div className="text-xs text-foreground-muted">Undo before it leaves your outbox.</div>
                </div>
                <button
                  onClick={cancelUndo}
                  className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-raised"
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        )}

        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border bg-surface px-4 py-3 sm:px-5">
              <button
                onClick={closeThread}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-raised"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Inbox
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                {folder === "drafts" ? (
                  <DraftPreviewCard draft={selected} />
                ) : (
                  <ThreadView
                    threadId={selected.threadId || selected.id}
                    mailbox={folder}
                    onReplyCompose={openReplyComposer}
                    onDeleted={closeThread}
                  />
                )}
              </div>
            </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <section className="min-w-0 flex-1">
              <div className="h-full overflow-y-auto">
                {isInitialListLoading && visibleThreads.length === 0 ? (
                  <MailboxLoading folder={folder} />
                ) : mailboxQuery.isError ? (
                  <div className="flex h-full items-center justify-center px-6 text-sm text-foreground-muted">
                    We couldn&apos;t load this mailbox right now.
                  </div>
                ) : visibleThreads.length === 0 ? (
                  <MailboxEmptyState folder={folder} query={debouncedQuery} />
                ) : (
                  <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-3 sm:px-4">
                    {visibleThreads.map((thread) => {
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
                            "w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition-all",
                            active
                              ? "border-accent/40 bg-accent-subtle shadow-sm"
                              : "border-border bg-surface hover:border-border-strong hover:bg-surface-raised",
                          ].join(" ")}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className={thread.isRead ? "h-2 w-2 shrink-0 rounded-full bg-transparent" : "h-2 w-2 shrink-0 rounded-full bg-accent"} />
                                <div className="truncate text-sm font-semibold text-foreground">
                                  {thread.senderName || "Unknown sender"}
                                </div>
                              </div>
                              <div className="mt-1 truncate text-sm text-foreground">
                                {thread.subject || "(no subject)"}
                              </div>
                              <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-foreground-muted">
                                {thread.snippet || "No preview available."}
                              </div>
                              {thread.badges.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {thread.badges.slice(0, 3).map((badge) => (
                                    <span
                                      key={badge}
                                      className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-subtle"
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

                    <div className="flex min-h-12 items-center justify-center py-3">
                      {isFetchingMore ? (
                        <div className="inline-flex items-center gap-2 text-xs text-foreground-muted">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading more mail
                        </div>
                      ) : hasMore ? (
                        <button
                          type="button"
                          onClick={() => void fetchMore()}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-raised"
                        >
                          Load more
                        </button>
                      ) : (
                        <span className="text-xs text-foreground-subtle">You&apos;re caught up.</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {composeOpen && (
        <ComposeModal
          onClose={closeCompose}
          onSend={handleSend}
          initialDraft={composeDraft ?? undefined}
        />
      )}
    </div>
  );
}

export function ComposeModal({
  onClose,
  onSend,
  initialDraft,
}: {
  onClose: () => void;
  onSend: (payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    threadId?: string;
  }) => Promise<void>;
  initialDraft?: ComposeDraft;
}) {
  const saveDraft = trpc.email.saveDraft.useMutation();
  const deleteDraft = trpc.email.deleteDraft.useMutation();
  const rewriteMutation = trpc.email.rewriteDraft.useMutation();
  const settingsQuery = trpc.settings.getUserSettings.useQuery({});
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [originalBody, setOriginalBody] = useState("");
  const [rewrittenBody, setRewrittenBody] = useState("");
  const [rewriteState, setRewriteState] = useState<"idle" | "loading" | "preview">("idle");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [showAiTools, setShowAiTools] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(-1);
  const [slashLength, setSlashLength] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voice = useSpeechToText({
    onFinalText: (chunk) => {
      setBody((current) => (current.trim() ? `${current.trim()} ${chunk}` : chunk));
    },
  });

  const aiAllowed = Boolean(settingsQuery.data?.aiEnabled && settingsQuery.data?.draftSuggestionsEnabled && settingsQuery.data?.privacyConfigured);

  const hasContent = [to, cc, bcc, subject, body].some((value) => value.trim().length > 0);
  const visibleAiCommands = slashQuery.trim()
    ? AI_COMMANDS.filter((command) => command.id.replaceAll("_", "-").includes(slashQuery.trim()))
    : AI_COMMANDS;

  const closeSlashMenu = useCallback(() => {
    setShowSlashMenu(false);
    setSlashQuery("");
    setSlashIndex(-1);
    setSlashLength(0);
  }, []);

  const handleBodyChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setBody(value);

    const cursor = event.target.selectionStart ?? value.length;
    const lastNewline = value.lastIndexOf("\n", Math.max(0, cursor - 1));
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const currentLine = value.slice(lineStart, cursor);
    const commandMatch = currentLine.match(/^\/([a-z-]*)$/i);

    if (commandMatch) {
      setShowAiTools(true);
      setShowSlashMenu(true);
      setSlashIndex(lineStart);
      setSlashLength(currentLine.length);
      setSlashQuery(commandMatch[1].toLowerCase());
      return;
    }

    closeSlashMenu();
  }, [closeSlashMenu]);

  useEffect(() => {
    if (!initialDraft) return;
    setDraftId(undefined);
    setTo(initialDraft.to ?? "");
    setCc(initialDraft.cc ?? "");
    setBcc(initialDraft.bcc ?? "");
    setSubject(initialDraft.subject ?? "");
    setBody(initialDraft.body ?? "");
    setShowAiTools(false);
    setShowSlashMenu(false);
    setSlashQuery("");
    setSlashIndex(-1);
    setSlashLength(0);
    setRewriteState("idle");
    setOriginalBody("");
    setRewrittenBody("");
  }, [initialDraft]);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (!hasContent) {
      return;
    }

    saveTimerRef.current = setTimeout(() => {
      saveDraft.mutate(
        {
          id: draftId,
          to,
          cc,
          bcc,
          subject,
          body,
        },
        {
          onSuccess: (draft) => {
            if (!draftId) {
              setDraftId(draft.id);
            }
          },
        }
      );
    }, 1200);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [bcc, body, cc, draftId, hasContent, saveDraft, subject, to]);

  const closeWithConfirm = useCallback(async () => {
    if (!hasContent) {
      onClose();
      return;
    }

    if (!window.confirm("Discard this draft?")) {
      return;
    }

    if (draftId) {
      await deleteDraft.mutateAsync({ id: draftId }).catch(() => null);
    }
    onClose();
  }, [deleteDraft, draftId, hasContent, onClose]);

  const handleSend = useCallback(async () => {
    const parsed = sendEmailSchema.safeParse({
      to: splitRecipients(to),
      cc: splitRecipients(cc),
      bcc: splitRecipients(bcc),
      subject: subject.trim() || "No Subject",
      body,
    });

    if (!parsed.success) {
      toast.error("Enter valid recipients, a subject, and a message.");
      return;
    }

    try {
      setIsSending(true);
      await onSend(parsed.data);
      if (draftId) {
        await deleteDraft.mutateAsync({ id: draftId }).catch(() => null);
      }
      setDraftId(undefined);
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
    } catch {
      toast.error("We could not queue this email.");
    } finally {
      setIsSending(false);
    }
  }, [bcc, body, cc, deleteDraft, draftId, onSend, subject, to]);

  const executeAiCommand = useCallback(async (command: typeof AI_COMMANDS[number]["id"]) => {
    if (!aiAllowed) {
      toast.error("AI assist is disabled in settings.");
      return;
    }

    const hasInlineCommand = showSlashMenu && slashIndex >= 0 && slashLength > 0;
    const sourceBody = hasInlineCommand
      ? body.slice(0, slashIndex) + body.slice(slashIndex + slashLength)
      : body;

    if (!sourceBody.trim()) {
      toast.error("Write something first.");
      return;
    }

    setShowAiTools(true);
    setShowSlashMenu(false);
    setOriginalBody(sourceBody);
    setRewriteState("loading");

    try {
      const result = await rewriteMutation.mutateAsync({
        draft: sourceBody,
        instruction: command,
        translateTo: command === "translate" ? "Spanish" : undefined,
      });
      setRewrittenBody(result.rewritten);
      setRewriteState("preview");
    } catch {
      toast.error("Could not rewrite this draft.");
      setRewriteState("idle");
    }
  }, [aiAllowed, body, rewriteMutation, showSlashMenu, slashIndex, slashLength]);

  const acceptRewrite = useCallback(() => {
    setBody(rewrittenBody);
    setRewriteState("idle");
    closeSlashMenu();
  }, [closeSlashMenu, rewrittenBody]);

  const discardRewrite = useCallback(() => {
    setBody(originalBody);
    setRewriteState("idle");
    closeSlashMenu();
  }, [closeSlashMenu, originalBody]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSend();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        void closeWithConfirm();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeWithConfirm, handleSend]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-base font-semibold text-foreground">Compose</div>
            <div className="mt-1 text-xs text-foreground-subtle">Drafts save quietly while you type.</div>
          </div>
          <button
            onClick={() => void closeWithConfirm()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
            className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none transition-colors focus:border-accent"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
            <button
              type="button"
              onClick={() => setShowCcBcc((value) => !value)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-overlay"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCcBcc ? "rotate-180" : ""}`} />
              Cc / Bcc
            </button>
            <div className="flex items-center gap-2">
              <span>{draftId ? "Draft saved" : "New draft"}</span>
              <button
                type="button"
                onClick={() => setShowAiTools((value) => !value)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-surface-raised"
              >
                AI assist
              </button>
              {!aiAllowed && (
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground-subtle">
                  AI unavailable
                </span>
              )}
            </div>
          </div>

          {showAiTools && (
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">AI tools</span>
                {visibleAiCommands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    disabled={!aiAllowed || rewriteMutation.isPending || rewriteState === "loading"}
                    onClick={() => void executeAiCommand(command.id)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    /{command.id.replaceAll("_", "-")}
                  </button>
                ))}
              </div>
              {showSlashMenu && (
                <div className="mt-2 text-[11px] text-foreground-subtle">
                  Filtering for <span translate="no">/{slashQuery || "…"}</span>
                </div>
              )}
              <div className="mt-2 text-[11px] text-foreground-subtle">
                Privacy gate and AI settings must allow draft rewrites before these actions run.
              </div>
            </div>
          )}

          {rewriteState === "preview" ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">Original</div>
                <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground-muted">{originalBody}</pre>
              </div>
              <div className="rounded-xl border border-accent/30 bg-accent-subtle p-3">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">Preview</div>
                <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{rewrittenBody}</pre>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={acceptRewrite}
                    className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={discardRewrite}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-raised"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          ) : showCcBcc ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Cc"
                className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none transition-colors focus:border-accent"
              />
              <input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="Bcc"
                className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none transition-colors focus:border-accent"
              />
            </div>
          ) : null}

          {rewriteState !== "preview" && (
            <>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none transition-colors focus:border-accent"
              />
              {(voice.listening || voice.preview || voice.error) && (
                <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground-muted" aria-live="polite">
                  {voice.error ? (
                    voice.error
                  ) : voice.listening ? (
                    <>
                      Listening...
                      {voice.preview ? <span className="ml-2 text-foreground">{voice.preview}</span> : null}
                    </>
                  ) : (
                    voice.preview
                  )}
                </div>
              )}
              <textarea
                value={body}
                onChange={handleBodyChange}
                placeholder="Write your message..."
                className="min-h-[22rem] w-full rounded-xl border border-border bg-background px-3 py-3 text-sm leading-6 outline-none transition-colors focus:border-accent"
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-background/80 px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-foreground-subtle">
            <span>Type / for AI suggestions.</span>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                voice.startListening();
              }}
              onPointerUp={voice.stopListening}
              onPointerLeave={voice.stopListening}
              onPointerCancel={voice.stopListening}
              disabled={!voice.supported || rewriteState !== "idle" || isSending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
              title={voice.supported ? (voice.listening ? "Release to stop" : "Hold to speak") : "Voice input unavailable"}
            >
              {voice.supported ? (
                voice.listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void closeWithConfirm()}
              className="rounded-xl border border-border px-4 py-2 text-sm transition-colors hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSend()}
              disabled={isSending}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SquarePen className="h-4 w-4" />}
              {isSending ? "Queueing..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MailboxLoading({ folder }: { folder: Folder }) {
  const copy = getMailboxCopy(folder);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-3 sm:px-4">
      <div className="rounded-2xl border border-border bg-surface px-4 py-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
          Loading {copy.label}
        </div>
        <div className="mt-2 text-sm text-foreground-muted">{copy.loading}</div>
      </div>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="w-full animate-pulse rounded-2xl border border-border bg-surface px-4 py-4">
          <div className="h-4 w-1/3 rounded bg-surface-overlay" />
          <div className="mt-3 h-4 w-2/3 rounded bg-surface-overlay" />
          <div className="mt-3 h-3 w-full rounded bg-surface-overlay" />
        </div>
      ))}
    </div>
  );
}

function MailboxEmptyState({
  folder,
  query,
}: {
  folder: Folder;
  query: string;
}) {
  const copy = getMailboxCopy(folder);
  const hasQuery = query.trim().length >= 2;

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
          {hasQuery ? "No results" : copy.label}
        </div>
        <div className="mt-3 text-lg font-semibold text-foreground">
          {hasQuery ? `No matches in ${copy.label.toLowerCase()}` : copy.emptyTitle}
        </div>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          {hasQuery ? `Try a different search term or switch folders.` : copy.emptyBody}
        </p>
      </div>
    </div>
  );
}

function DraftPreviewCard({ draft }: { draft: EmailListClientItem }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-left shadow-sm">
        <div className="text-sm font-medium text-foreground">Draft preview</div>
        <div className="mt-3 text-sm text-foreground">{draft.subject || "(no subject)"}</div>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          {draft.snippet || "Open compose to finish this draft and send it."}
        </p>
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

function getMailboxCopy(folder: Folder) {
  switch (folder) {
    case "drafts":
      return {
        label: "Drafts",
        loading: "Pulling saved drafts and recent edits.",
        emptyTitle: "No drafts yet",
        emptyBody: "New drafts you save will appear here while you work.",
      };
    case "sent":
      return {
        label: "Sent",
        loading: "Loading messages that have already gone out.",
        emptyTitle: "Nothing sent yet",
        emptyBody: "Sent mail will appear here once messages leave your outbox.",
      };
    case "spam":
      return {
        label: "Spam",
        loading: "Checking the filtered updates and low-priority mail.",
        emptyTitle: "Spam is empty",
        emptyBody: "No filtered spam or noisy updates are showing right now.",
      };
    case "trash":
      return {
        label: "Trash",
        loading: "Loading recently trashed mail.",
        emptyTitle: "Trash is clear",
        emptyBody: "Mail you trash will stay here until it is restored or purged.",
      };
    default:
      return {
        label: "Inbox",
        loading: "Loading your latest inbox threads.",
        emptyTitle: "Inbox is clear",
        emptyBody: "New conversations will appear here as they arrive.",
      };
  }
}

function splitRecipients(value: string) {
  const recipients = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return recipients.length > 0 ? recipients : undefined;
}
