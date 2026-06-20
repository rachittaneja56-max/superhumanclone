"use client";

import React, { Fragment, useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUIStore } from "@/store/ui-store";
import { HITLCard } from "./HITLCard";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUp, Bot, BrainCircuit, Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSpeechToText } from "@/hooks/useSpeechToText";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_PROMPTS = [
  "What needs my attention today?",
  "Find emails about invoices this month",
  "Schedule a meeting with people from my last thread",
  "Summarize my unread emails",
];

type MarkdownSegment =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string };

function parseInlineMarkdown(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const match = remaining.match(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/);
    if (!match || match.index === undefined) {
      segments.push({ type: "text", value: remaining });
      break;
    }

    if (match.index > 0) {
      segments.push({ type: "text", value: remaining.slice(0, match.index) });
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      segments.push({ type: "strong", value: token.slice(2, -2) });
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      segments.push({ type: "em", value: token.slice(1, -1) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      segments.push({ type: "code", value: token.slice(1, -1) });
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (linkMatch) {
        segments.push({ type: "link", label: linkMatch[1], href: linkMatch[2] });
      } else {
        segments.push({ type: "text", value: token });
      }
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return segments;
}

function renderInlineMarkdown(text: string) {
  return parseInlineMarkdown(text).map((segment, index) => {
    if (segment.type === "strong") {
      return <strong key={`${segment.type}-${index}`} className="font-semibold text-foreground">{segment.value}</strong>;
    }

    if (segment.type === "em") {
      return <em key={`${segment.type}-${index}`} className="italic">{segment.value}</em>;
    }

    if (segment.type === "code") {
      return (
        <code
          key={`${segment.type}-${index}`}
          className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
        >
          {segment.value}
        </code>
      );
    }

    if (segment.type === "link") {
      return (
        <a
          key={`${segment.type}-${index}`}
          href={segment.href}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-4 hover:text-accent/80"
        >
          {segment.label}
        </a>
      );
    }

    return <Fragment key={`${segment.type}-${index}`}>{segment.value}</Fragment>;
  });
}

function renderAssistantMarkdown(content: string) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;
  let currentCodeBlock: { language: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (currentParagraph.length === 0) return;
    const text = currentParagraph.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="mt-2 whitespace-pre-wrap first:mt-0">
          {renderInlineMarkdown(text)}
        </p>,
      );
    }
    currentParagraph = [];
  };

  const flushList = () => {
    if (!currentList) return;
    const ListTag = currentList.type;
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={cn(
          "mt-2 space-y-1.5 pl-5",
          currentList.type === "ul" ? "list-disc marker:text-accent" : "list-decimal marker:text-foreground-muted",
        )}
      >
        {currentList.items.map((item, index) => (
          <li key={`li-${index}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ListTag>,
    );
    currentList = null;
  };

  const flushCodeBlock = () => {
    if (!currentCodeBlock) return;
    blocks.push(
      <div key={`code-${blocks.length}`} className="mt-3 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm">
        {currentCodeBlock.language && (
          <div className="border-b border-border bg-background/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            {currentCodeBlock.language}
          </div>
        )}
        <pre className="overflow-x-auto p-4 text-sm text-foreground">
          <code>{currentCodeBlock.lines.join("\n")}</code>
        </pre>
      </div>,
    );
    currentCodeBlock = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (currentCodeBlock) {
      if (trimmed === "```") {
        flushCodeBlock();
      } else {
        currentCodeBlock.lines.push(rawLine);
      }
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      currentCodeBlock = {
        language: trimmed.slice(3).trim(),
        lines: [],
      };
      continue;
    }

    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushParagraph();
      flushList();
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const HeaderTag = `h${level}` as any;
      blocks.push(
        <HeaderTag
          key={`h-${blocks.length}`}
          className={cn(
            "mb-2 mt-4 font-display font-semibold text-foreground",
            level === 1 ? "text-2xl" : level === 2 ? "text-xl" : level === 3 ? "text-lg" : "text-base",
          )}
        >
          {renderInlineMarkdown(text)}
        </HeaderTag>,
      );
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-4 border-border" />);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (currentList?.type !== "ul") flushList();
      if (!currentList) currentList = { type: "ul", items: [] };
      currentList.items.push(ulMatch[1].trim());
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (currentList?.type !== "ol") flushList();
      if (!currentList) currentList = { type: "ol", items: [] };
      currentList.items.push(olMatch[1].trim());
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    currentParagraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCodeBlock();

  return blocks.length > 0 ? <div className="space-y-0.5">{blocks}</div> : <span className="whitespace-pre-wrap">{content}</span>;
}

function predictToolIndicator(input: string, threadContext?: string | null) {
  const lower = input.toLowerCase().trim();
  const hasThreadContext = Boolean(threadContext?.trim());
  const hasCalendarVerb = /\b(schedule|book|set up|set-up|plan|arrange|create|add|invite)\b/.test(lower);
  const hasCalendarObject = /\b(meeting|calendar|event|meet|invite)\b/.test(lower);
  const hasCalendarTiming = /\b(today|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s+\d|\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/.test(lower);

  if (lower.startsWith("/")) return "Rewriting draft...";
  if (/\b(find|search|look for|show me)\b/.test(lower) && /\b(email|emails|mail|inbox|thread|threads)\b/.test(lower)) {
    return "Searching your inbox...";
  }
  if ((/\b(digest|attention today|what needs my attention|unread emails)\b/.test(lower) && !hasThreadContext)) {
    return "Preparing your digest...";
  }
  if (/\b(prep|prepare|brief)\b/.test(lower) && /\b(meeting|call|event|calendar)\b/.test(lower)) {
    return "Preparing meeting brief...";
  }
  if (/\b(triage|classify|priority|urgent)\b/.test(lower) && hasThreadContext) return "Searching your inbox...";
  if (/\b(tl;dr|tldr|summari[sz]e|digest)\b/.test(lower) && hasThreadContext) return "Summarizing thread...";
  if (/\b(reply|respond|draft a reply|write back)\b/.test(lower) && hasThreadContext) return "Preparing reply...";
  if ((hasCalendarVerb && hasCalendarObject) || (hasCalendarObject && hasCalendarTiming)) {
    return "Drafting calendar event...";
  }
  if (/\bsend\b/.test(lower) && (/\b(email|mail|message|thread|this|that)\b/.test(lower) || hasThreadContext)) {
    return "Drafting email...";
  }
  return "Working...";
}

export function AgentChat({
  sessionId,
  threadContext,
  onClearContext,
}: {
  sessionId: string;
  threadContext?: string | null;
  onClearContext?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentIndicator, setCurrentIndicator] = useState<string | null>(null);
  const voice = useSpeechToText({
    onFinalText: (chunk) => {
      setInputValue((current) => (current.trim() ? `${current.trim()} ${chunk}` : chunk));
    },
  });
  
  const { activeHITLAction, setActiveHITLAction } = useUIStore();
  const clearSessionHistory = trpc.agent.clearSessionHistory.useMutation({
    onSuccess: () => {
      toast.success("Saved chat memory cleared");
    },
    onError: (error) => {
      toast.error(error.message || "Could not clear saved chat memory");
    },
  });
  
  // Refetch pending HITL
  const getPendingHITL = trpc.agent.getPendingHITL.useQuery({}, {
    enabled: true,
  });

  useEffect(() => {
    if (getPendingHITL.data) {
      setActiveHITLAction(getPendingHITL.data);
    } else if (getPendingHITL.isFetched) {
      setActiveHITLAction(null);
    }
  }, [getPendingHITL.data, getPendingHITL.isFetched, setActiveHITLAction]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeHITLAction]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming || activeHITLAction) return;

    setHasStarted(true);
    const newMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(newMessages);
    setInputValue("");
    setIsStreaming(true);
    setCurrentIndicator(predictToolIndicator(text, threadContext));

    // Add empty assistant message
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/trpc/agent.chatMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text, 
          sessionId,
          threadContext: threadContext ?? undefined,
          history: messages,
          allowMemory: memoryEnabled,
        }),
      });

      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + chunk },
            ];
          });
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + "\n\n[Error: Connection interrupted]" },
        ];
      });
    } finally {
      setIsStreaming(false);
      setCurrentIndicator(null);
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Bot className="h-4 w-4 text-accent" aria-hidden="true" />
              <span>AI Assistant</span>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">Ask Aethra about mail, schedules, and follow-ups.</p>
            {threadContext ? (
              <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs text-accent">
                <span className="min-w-0 truncate">Using approved page context</span>
                {onClearContext ? (
                  <button
                    type="button"
                    onClick={onClearContext}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    aria-label="Remove context"
                    title="Remove context"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setMemoryEnabled((value) => !value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors whitespace-nowrap",
                memoryEnabled
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border bg-background text-foreground-muted hover:bg-surface-raised hover:text-foreground",
              )}
              aria-pressed={memoryEnabled}
            >
              <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Memory</span>
            </button>
            {memoryEnabled ? (
              <button
                type="button"
                onClick={() => {
                  clearSessionHistory.mutate({ sessionId });
                  setMessages([]);
                  setHasStarted(false);
                }}
                className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground whitespace-nowrap"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-foreground-subtle">Memory stays off by default.</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
        {(voice.listening || voice.preview || voice.error || voice.permissionState === "requesting" || voice.permissionState === "unsupported") && (
          <div className="mb-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground-muted" aria-live="polite">
            {voice.error ? (
              voice.error
            ) : voice.permissionState === "unsupported" ? (
              "Voice input is not supported in this browser."
            ) : voice.permissionState === "requesting" ? (
              "Requesting microphone access..."
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

      {!hasStarted && messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 py-4 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
            <Bot className="h-8 w-8" aria-hidden="true" />
          </div>
          <div className="max-w-sm space-y-1">
            <h2 className="text-2xl font-display font-medium text-foreground">How can I help you today?</h2>
            <p className="text-sm text-foreground-muted">Pick a prompt or type below.</p>
          </div>
          
          <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {SUGGESTED_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => sendMessage(prompt)}
                className="min-h-20 rounded-xl border border-border bg-background p-4 text-left text-sm text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-6 pb-6 pr-2 scroll-smooth"
        >
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={cn(
                "max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed break-words",
                msg.role === "user" 
                  ? "ml-auto bg-accent/10 text-foreground rounded-br-sm" 
                  : "mr-auto border border-border bg-background text-foreground rounded-bl-sm"
              )}
            >
              {msg.role === "assistant" ? (
                <div className="space-y-2">{renderAssistantMarkdown(msg.content)}</div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
              {isStreaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
              )}
            </div>
          ))}
          {isStreaming && currentIndicator && (
            <div className="mr-auto flex items-center space-x-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{currentIndicator}</span>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="relative mt-auto flex flex-col gap-3 pt-4">
        {activeHITLAction ? <HITLCard /> : null}

        <div className="relative flex w-full items-end overflow-hidden rounded-2xl border border-border bg-background transition-shadow focus-within:ring-2 focus-within:ring-accent">
          <textarea
            className="min-h-[56px] w-full max-h-48 resize-none bg-transparent px-4 py-4 text-sm focus:outline-none disabled:opacity-50"
            placeholder={activeHITLAction ? "Awaiting your approval..." : "Ask Aethra AI..."}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isStreaming || !!activeHITLAction}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(inputValue);
              }
            }}
            rows={1}
          />
          <div className="flex items-center gap-2 p-2">
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
              disabled={!voice.supported || isStreaming || !!activeHITLAction}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
              title={voice.supported ? (voice.listening ? "Click to stop" : "Click to speak") : "Voice input unavailable"}
            >
              {voice.supported ? (
                voice.listening ? <Square className="h-4 w-4 fill-current" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />
              ) : (
                <MicOff className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <Button
              size="icon-sm"
              className="h-10 w-10 rounded-xl bg-accent text-accent-foreground transition-transform hover:bg-accent/90 active:scale-95 disabled:opacity-50"
              disabled={!inputValue.trim() || isStreaming || !!activeHITLAction}
              onClick={() => sendMessage(inputValue)}
            >
              <ArrowUp className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
