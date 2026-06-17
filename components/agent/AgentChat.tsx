"use client";

import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUIStore } from "@/store/ui-store";
import { HITLCard } from "./HITLCard";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUp, Bot, X, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_PROMPTS = [
  "What needs my attention today?",
  "Find emails about invoices this month",
  "Schedule a meeting with people from my last thread",
  "Summarize my unread emails",
];

export function AgentChat({
  sessionId,
  threadContext,
  onClearThreadContext,
}: {
  sessionId: string;
  threadContext?: string | null;
  onClearThreadContext?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);
  
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
    }
  }, [getPendingHITL.data, setActiveHITLAction]);

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
        <p className="mt-3 text-xs text-foreground-subtle">Memory stays off unless you turn it on.</p>

        {threadContext && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent/20 bg-accent-subtle px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Context</span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                  attached
                </span>
              </div>
              <div className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-foreground-muted">
                {threadContext}
              </div>
            </div>
            {onClearThreadContext && (
              <button
                type="button"
                onClick={() => {
                  onClearThreadContext();
                  toast.message("Thread context removed");
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                aria-label="Remove thread context"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
      
      {!hasStarted && messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 py-4 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
            <Bot className="h-8 w-8" aria-hidden="true" />
          </div>
          <div className="max-w-sm space-y-1">
            <h2 className="text-2xl font-display font-medium text-foreground">How can I help you today?</h2>
            <p className="text-sm text-foreground-muted">Pick a prompt or start from the box below.</p>
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
              <span className="whitespace-pre-wrap">{msg.content}</span>
              {isStreaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
              )}
            </div>
          ))}
          {/* Tool indicator */}
          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div className="mr-auto flex items-center space-x-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="relative mt-auto flex flex-col gap-3 pt-4">
        {/* HITL Card placed above the input area in the flow */}
        {activeHITLAction && (
          <div className="absolute bottom-full right-0 z-10 mb-4 flex w-full justify-end">
            <HITLCard className="w-full max-w-md animate-in slide-in-from-bottom-2 shadow-xl" />
          </div>
        )}

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
          <div className="p-2">
            <Button 
              size="icon-sm" 
              className="rounded-xl w-10 h-10 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-transform active:scale-95"
              disabled={!inputValue.trim() || isStreaming || !!activeHITLAction}
              onClick={() => sendMessage(inputValue)}
            >
              <ArrowUp className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
