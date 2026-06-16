"use client";

import React, { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, CalendarIcon, Reply, ReplyAll, Forward, Trash2 } from "lucide-react";
import { ComposeBox } from "./ComposeBox";
import { toast } from "sonner";

type MailMessage = {
  id: string
  corsair_message_id?: string
  from_name?: string | null
  from_address?: string
  to_address?: string
  subject?: string | null
  snippet?: string | null
  body_html?: string | null
  body_text?: string | null
  is_read?: boolean
  ai_triage_skipped?: boolean
  created_at?: string | Date
  tldr?: string | null
}

export function ThreadView({ threadId }: { threadId: string }) {
  const { data: thread, isLoading } = trpc.email.getThread.useQuery({ threadId });
  const markRead = trpc.email.markRead.useMutation();
  const archiveMutation = trpc.email.archiveEmail.useMutation({
    onSuccess: () => toast.success("Archived"),
    onError: () => toast.error("Failed to archive"),
  });
  const deleteMutation = trpc.email.deleteEmail.useMutation({
    onSuccess: () => toast.success("Moved to trash"),
    onError: () => toast.error("Failed to delete"),
  });
  
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<"reply" | "replyAll" | "forward" | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const typedThread = thread as MailMessage[] | undefined;
  const firstEmailId = typedThread?.[0]?.id;

  // Mark as read on mount
  useEffect(() => {
    if (!typedThread || typedThread.length === 0) return;
    const unread = typedThread.filter((e: MailMessage) => !e.is_read);
    if (unread.length > 0) {
      markRead.mutate({ emailIds: unread.map((e) => e.id).slice(0, 50) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEmailId]); 

  const virtualizer = useVirtualizer({
    count: thread?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, 
    overscan: 5,
  });

  if (isLoading) return <div className="p-4 flex-1 flex items-center justify-center text-sm text-gray-500 font-sans">Loading thread...</div>;
  if (!thread || thread.length === 0) return <div className="p-4 flex-1 flex items-center justify-center text-sm text-gray-500 font-sans">No emails found.</div>;

  const subject = typedThread?.[0]?.subject || "(No Subject)";
  const showTldr = (thread?.[0] as any)?.tldr && !(thread?.[0] as any)?.ai_triage_skipped;
  const combinedSnippets = (typedThread ?? []).map((e: MailMessage) => e.snippet).join(" ");
  const meetingRegex = /\b(meet|call|sync|chat|zoom|teams|schedule|availability|calendar|invite)\b/i;
  const hasMeetingIntent = meetingRegex.test(combinedSnippets);
  const primaryEmailId = typedThread?.[0]?.corsair_message_id || typedThread?.[0]?.id || "";
  const latest = typedThread?.[typedThread.length - 1];
  const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const forwardSubject = subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`;
  
  const useVirtual = thread.length > 20;

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] font-sans relative">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-display tracking-tight text-2xl font-semibold text-[var(--text)]">{subject}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReplyMode("reply")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <Reply className="w-4 h-4" />
              Reply
            </button>
            <button
              onClick={() => setReplyMode("replyAll")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <ReplyAll className="w-4 h-4" />
              Reply all
            </button>
            <button
              onClick={() => setReplyMode("forward")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <Forward className="w-4 h-4" />
              Forward
            </button>
            <button
              onClick={() => archiveMutation.mutate({ emailId: primaryEmailId })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
            <button
              onClick={() => deleteMutation.mutate({ emailId: primaryEmailId })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-red-500/10 text-red-600 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <Trash2 className="w-4 h-4" />
              Trash
            </button>
          </div>
        </div>
        {showTldr && (
          <div
            className="p-4 rounded-r-md text-sm mb-2 text-[var(--text)]"
            style={{
              backgroundColor: "var(--accent-subtle)",
              borderLeft: "3px solid var(--accent)",
            }}
          >
            <strong>TL;DR:</strong> {thread[0].tldr}
          </div>
        )}
      </div>

      {/* Email List */}
      <div ref={parentRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {useVirtual ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {typedThread?.[virtualItem.index] ? <EmailMessage email={typedThread[virtualItem.index]} /> : null}
              </div>
            ))}
          </div>
        ) : (
          typedThread?.map((email: MailMessage) => <EmailMessage key={email.id} email={email} />)
        )}
      </div>

      <div className="flex-shrink-0 border-t" style={{ borderColor: "var(--border)" }}>
        <ComposeBox
          threadId={threadId}
          replyTo={
            replyMode === "forward"
              ? {
                  subject: forwardSubject,
                  bodyPrefix: `\n\n--- Forwarded message ---\nFrom: ${latest?.from_name || latest?.from_address || ""}\nDate: ${latest?.created_at ? new Date(latest.created_at).toLocaleString() : ""}\nSubject: ${subject}\n`,
                }
              : replyMode
                ? {
                    to:
                      replyMode === "replyAll"
                    ? Array.from(
                        new Set(
                          (typedThread ?? [])
                            .flatMap((email: MailMessage) => [email.from_address, email.to_address])
                            .filter(Boolean) as string[]
                        )
                      )
                        .filter((addr) => addr !== latest?.from_address)
                        .join(", ")
                        : latest?.from_address || "",
                    subject: replySubject,
                    bodyPrefix: `\n\nOn ${latest?.created_at ? new Date(latest.created_at).toLocaleString() : "a previous date"}, ${latest?.from_name || latest?.from_address || "someone"} wrote:\n`,
                  }
                : undefined
          }
        />
      </div>

      {/* Floating Schedule Button */}
      {hasMeetingIntent && (
        <button
          onClick={() => setSchedulerOpen(true)}
          className="fixed bottom-6 right-8 bg-amber-500 hover:bg-amber-600 text-white rounded-full px-5 py-3 shadow-lg flex items-center space-x-2 transition-transform hover:scale-105 z-50"
        >
          <CalendarIcon className="w-5 h-5" />
          <span className="font-medium text-sm">Schedule from thread</span>
        </button>
      )}
    </div>
  );
}

function EmailMessage({ email }: { email: MailMessage }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const adjustHeight = () => {
      if (iframe.contentDocument?.body) {
        // slight buffer
        iframe.style.height = `${iframe.contentDocument.body.scrollHeight + 10}px`;
      }
    };

    let resizeObserver: ResizeObserver | null = null;

    const handleLoad = () => {
      adjustHeight();
      const body = iframe.contentDocument?.body;
      if (body) {
        resizeObserver = new ResizeObserver(() => adjustHeight());
        resizeObserver.observe(body);
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [email.body_html]);

  return (
    <div
      className="p-5 rounded-lg shadow-sm"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: !email.is_read ? "2px solid var(--accent)" : "1px solid var(--border)",
      }}
    >
      <div className="flex justify-between items-center mb-4 border-b pb-3" style={{ borderColor: "var(--border)" }}>
        <div className="font-medium text-[var(--text)]">{email.from_name || email.from_address}</div>
        <div className="text-xs text-gray-500">{new Date(email.created_at || Date.now()).toLocaleString()}</div>
      </div>
      
      {email.body_html ? (
        <div className="overflow-x-auto w-full">
          <iframe
            ref={iframeRef}
            srcDoc={email.body_html}
            sandbox="allow-same-origin"
            title={`Email from ${email.from_name || email.from_address}`}
            className="w-full border-0 bg-white rounded-md"
            style={{ height: "auto", minHeight: "100px", overflow: "hidden" }}
          />
        </div>
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--text)]">
          {email.snippet || "No content available."}
        </pre>
      )}
    </div>
  );
}
