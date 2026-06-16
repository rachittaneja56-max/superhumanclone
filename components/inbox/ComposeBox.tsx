"use client";

import React, { useState, useRef, useEffect, ChangeEvent } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUndoSend } from "@/hooks/useUndoSend";
import { Send, X, Check } from "lucide-react";
import { toast } from "sonner";
import { sendEmailSchema } from "@/lib/schemas";

const COMMANDS = [
  { id: "improve_tone", label: "Improve Tone" },
  { id: "make_shorter", label: "Make Shorter" },
  { id: "make_formal", label: "Make Formal" },
  { id: "convert_to_bullets", label: "Convert to Bullets" },
  { id: "translate", label: "Translate" },
] as const;

export function ComposeBox({
  threadId,
  replyTo,
}: {
  threadId?: string
  replyTo?: {
    to?: string
    subject?: string
    bodyPrefix?: string
  }
}) {
  const [draft, setDraft] = useState("");
  const [originalDraft, setOriginalDraft] = useState("");
  const [rewrittenDraft, setRewrittenDraft] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashIndex, setSlashIndex] = useState(-1);
  const [rewriteState, setRewriteState] = useState<"idle" | "loading" | "preview">("idle");
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!replyTo) return
    setTo(replyTo.to || "")
    setSubject(replyTo.subject || "")
    setDraft(replyTo.bodyPrefix || "")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [replyTo])

  const rewriteMutation = trpc.email.rewriteDraft.useMutation();
  const sendMutation = trpc.email.sendEmail.useMutation();
  const { startUndoWindow, isPending } = useUndoSend();

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(val);

    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }

    // Detect /slash at start of line
    const cursor = e.target.selectionStart;
    const lastNewline = val.lastIndexOf("\n", cursor - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const currentLine = val.substring(lineStart, cursor);

    if (currentLine === "/") {
      setShowSlashMenu(true);
      setSlashIndex(lineStart);
    } else if (showSlashMenu) {
      setShowSlashMenu(false);
    }
  };

  const executeCommand = async (cmdId: typeof COMMANDS[number]["id"]) => {
    setShowSlashMenu(false);
    // Remove the slash from the draft
    const newDraft = draft.substring(0, slashIndex) + draft.substring(slashIndex + 1);
    setDraft(newDraft);
    setOriginalDraft(newDraft);

    if (newDraft.trim().length === 0) {
      toast.error("Please write a draft first to use AI commands.");
      return;
    }

    setRewriteState("loading");
    try {
      const result = await rewriteMutation.mutateAsync({
        draft: newDraft,
        instruction: cmdId,
        translateTo: cmdId === "translate" ? "Spanish" : undefined, // Stubbed for now, can be improved
      });
      setRewrittenDraft(result.rewritten);
      setRewriteState("preview");
    } catch (err) {
      toast.error("Failed to rewrite draft");
      setRewriteState("idle");
    }
  };

  const acceptRewrite = () => {
    setDraft(rewrittenDraft);
    setRewriteState("idle");
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const discardRewrite = () => {
    setDraft(originalDraft);
    setRewriteState("idle");
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSend = async () => {
    const toList = splitRecipients(to);
    const parsed = sendEmailSchema.safeParse({
      to: toList,
      subject: subject.trim() || "No Subject",
      body: draft,
      threadId,
    });

    if (!parsed.success) {
      toast.error("Enter a valid recipient and message before sending.");
      return;
    }

    try {
      const res = await sendMutation.mutateAsync(parsed.data);
      
      setDraft("");
      setSubject("");
      setTo("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "80px";
      }

      startUndoWindow(res.undoToken);
    } catch {
      toast.error("Failed to schedule send");
    }
  };

  return (
    <div
      className="p-4 border-t sticky bottom-0 z-20 flex flex-col space-y-3 font-sans"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
    >
      {/* Basic To / Subject fields for stub compose - would be hidden if just replying */}
      <div className="flex space-x-2 mb-2">
        <input 
          placeholder="To" 
          value={to} 
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 p-3 min-h-[44px] rounded border bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        />
        <input 
          placeholder="Subject" 
          value={subject} 
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 p-3 min-h-[44px] rounded border bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        />
      </div>

      <div className="relative w-full">
        {rewriteState === "preview" ? (
          <div className="flex w-full space-x-4">
            <div className="flex-1 p-3 rounded-md border text-sm opacity-60" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs font-bold mb-2 uppercase tracking-wide">Original</div>
              <pre className="whitespace-pre-wrap font-sans">{originalDraft}</pre>
            </div>
            <div className="flex-1 p-3 rounded-md border bg-amber-500/10 text-sm border-amber-500/30">
              <div className="text-xs font-bold mb-2 uppercase tracking-wide text-amber-700">AI Rewritten</div>
              <pre className="whitespace-pre-wrap font-sans">{rewrittenDraft}</pre>
              <div className="flex mt-4 space-x-2">
                <button
                  onClick={acceptRewrite}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded-md flex items-center space-x-1 hover:bg-amber-600 transition text-xs font-medium"
                >
                  <Check className="w-4 h-4" />
                  <span>Accept</span>
                </button>
                <button
                  onClick={discardRewrite}
                  className="px-3 py-1.5 border rounded-md flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-xs font-medium"
                  style={{ borderColor: "var(--border)" }}
                >
                  <X className="w-4 h-4" />
                  <span>Discard</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleTextChange}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={replyTo ? "Write your reply here..." : "Write your email here..."}
              className="w-full min-h-[80px] p-3 rounded-md border bg-transparent text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
              disabled={rewriteState === "loading" || isPending}
            />
            {rewriteState === "loading" && (
              <div className="absolute inset-0 bg-amber-500/10 animate-pulse rounded-md border border-amber-500/30 flex items-center justify-center pointer-events-none">
                <span className="text-amber-600 font-medium text-sm drop-shadow-sm">Rewriting draft...</span>
              </div>
            )}
            {showSlashMenu && (
              <div
                className="absolute left-4 bottom-16 bg-[var(--surface)] border rounded-md shadow-lg p-2 z-50 flex flex-col w-56"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="text-xs font-medium px-2 py-1 mb-1 opacity-50 uppercase tracking-wider">AI Commands</div>
                {COMMANDS.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => executeCommand(cmd.id)}
                    className="text-left px-3 py-2 text-sm rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-[var(--text)]"
                  >
                    {cmd.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[12px] opacity-60">
          Type &quot;/&quot; on a new line for AI commands
        </span>
        <button
          onClick={handleSend}
          disabled={!draft || rewriteState !== "idle" || isPending}
          className="px-5 py-2 rounded-md font-medium text-sm flex items-center space-x-2 disabled:opacity-50 transition-colors"
          style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
        >
          <Send className="w-4 h-4" />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}

function splitRecipients(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
