"use client";

import React, { useState, useRef, useEffect, ChangeEvent } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUndoSend } from "@/hooks/useUndoSend";
import { Send, X, Check, Mic, MicOff, Square } from "lucide-react";
import { toast } from "sonner";
import { sendEmailSchema } from "@/lib/schemas";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { REWRITE_COMMANDS, filterRewriteCommands, type RewriteCommandId } from "@/lib/ai-rewrite-commands";
import { RewriteCommandMenu } from "./RewriteCommandMenu";

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
  const [slashLength, setSlashLength] = useState(0);
  const [slashQuery, setSlashQuery] = useState("");
  const [rewriteState, setRewriteState] = useState<"idle" | "loading" | "preview">("idle");
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  const [translateTo, setTranslateTo] = useState("English");
  const settingsQuery = trpc.settings.getUserSettings.useQuery({});
  const aiAllowed = Boolean(settingsQuery.data?.aiEnabled && settingsQuery.data?.draftSuggestionsEnabled && settingsQuery.data?.privacyConfigured);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voice = useSpeechToText({
    onFinalText: (chunk) => {
      setDraft((current) => (current.trim() ? `${current.trim()} ${chunk}` : chunk));
    },
  });

  useEffect(() => {
    if (!replyTo) return
    setTo(replyTo.to || "")
    setSubject(replyTo.subject || "")
    setDraft(replyTo.bodyPrefix || "")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [replyTo])

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [draft]);

  const rewriteMutation = trpc.email.rewriteDraft.useMutation();
  const sendMutation = trpc.email.sendEmail.useMutation();
  const { startUndoWindow, isPending } = useUndoSend();
  const visibleCommands = filterRewriteCommands(slashQuery);

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
    const commandMatch = currentLine.match(/^\/([a-z-]*)$/i);

    if (commandMatch) {
      setShowSlashMenu(true);
      setSlashIndex(lineStart);
      setSlashLength(currentLine.length);
      setSlashQuery(commandMatch[1].toLowerCase());
    } else if (showSlashMenu) {
      setShowSlashMenu(false);
      setSlashIndex(-1);
      setSlashLength(0);
      setSlashQuery("");
    }
  };

  const closeSlashMenu = () => {
    setShowSlashMenu(false);
    setSlashIndex(-1);
    setSlashLength(0);
    setSlashQuery("");
  };

  const executeCommand = async (cmdId: RewriteCommandId) => {
    if (!aiAllowed) {
      toast.error("AI assist is disabled in settings.");
      return;
    }

    closeSlashMenu();
    const hasInlineCommand = slashIndex >= 0 && slashLength > 0;
    const newDraft = hasInlineCommand
      ? draft.substring(0, slashIndex) + draft.substring(slashIndex + slashLength)
      : draft;
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
        translateTo: cmdId === "translate" ? translateTo.trim() || "English" : undefined,
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
      className="flex flex-col space-y-3 border-t border-border bg-surface p-4 font-sans"
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
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">Rewrite modes</span>
          {REWRITE_COMMANDS.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick={() => void executeCommand(cmd.id)}
              disabled={!aiAllowed || rewriteState !== "idle" || isPending}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cmd.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-foreground-muted">
            <span className="hidden sm:inline">Translate to</span>
            <input
              value={translateTo}
              onChange={(event) => setTranslateTo(event.target.value)}
              className="h-8 w-28 rounded-full border border-border bg-surface px-3 text-xs text-foreground outline-none transition-colors focus:border-accent"
              placeholder="Language"
            />
          </div>
          {!aiAllowed && (
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground-subtle">
              AI unavailable
            </span>
          )}
        </div>

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
            {(voice.listening || voice.preview || voice.error) && (
              <div className="mb-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground-muted" aria-live="polite">
                {voice.error ? (
                  voice.error
                ) : voice.permissionState === "requesting" ? (
                  "Requesting microphone access..."
                ) : voice.permissionState === "unsupported" ? (
                  "Voice input is not supported in this browser."
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
              <RewriteCommandMenu
                commands={visibleCommands}
                query={slashQuery}
                onSelect={(commandId) => void executeCommand(commandId)}
                className="absolute left-4 bottom-16 z-50 w-72"
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[12px] opacity-60">
          Type `/` for rewrite commands. Ctrl/Cmd + Enter sends.
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              if (voice.listening) {
                voice.stopListening();
              } else {
                void voice.startListening();
              }
            }}
            disabled={!voice.supported || rewriteState !== "idle" || isPending}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
            title={voice.supported ? (voice.listening ? "Click to stop" : "Click to speak") : "Voice input unavailable"}
          >
            {voice.supported ? (
              voice.listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </button>
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
    </div>
  );
}

function splitRecipients(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
