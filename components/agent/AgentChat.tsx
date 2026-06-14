"use client";

import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUIStore, type HITLActionState } from "@/store/ui-store";
import { HITLCard } from "./HITLCard";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUp, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_PROMPTS = [
  "What needs my attention today?",
  "Find emails about invoices this month",
  "Schedule a meeting with people from my last thread",
  "Summarize my unread emails",
];

export function AgentChat({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);
  
  const { activeHITLAction, setActiveHITLAction } = useUIStore();
  
  // Refetch pending HITL
  const getPendingHITL = trpc.agent.getPendingHITL.useQuery(undefined, {
    enabled: true,
  });

  useEffect(() => {
    if (getPendingHITL.data) {
      const row = getPendingHITL.data;
      // Transform DB row shape → UIStore HITLActionState
      const hitlState: HITLActionState = {
        actionId: row.id,
        actionType: row.action_type,
        humanReadable: `Pending: ${row.action_type}`,
        expiresAt: row.expires_at.toISOString(),
        payload: (row.payload as Record<string, unknown>) ?? undefined,
      };
      setActiveHITLAction(hitlState);
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
          sessionId 
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
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto px-4 py-6">
      
      {!hasStarted && messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-16 h-16 bg-accent/20 text-accent rounded-2xl flex items-center justify-center">
            <Bot className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-display font-medium text-foreground">How can I help you today?</h2>
          
          <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
            {SUGGESTED_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => sendMessage(prompt)}
                className="p-4 text-left border border-border bg-surface hover:bg-muted/50 rounded-xl text-sm text-foreground transition-colors"
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
                "max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed",
                msg.role === "user" 
                  ? "ml-auto bg-accent/10 text-foreground rounded-br-sm" 
                  : "mr-auto bg-surface border border-border text-foreground rounded-bl-sm"
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
            <div className="mr-auto flex items-center space-x-2 text-muted-foreground bg-surface border border-border rounded-full px-4 py-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="flex flex-col gap-3 mt-auto pt-4 relative">
        {/* HITL Card placed above the input area in the flow */}
        {activeHITLAction && (
          <div className="absolute bottom-full mb-4 right-0 z-10 w-full flex justify-end">
             <HITLCard className="w-full max-w-md animate-in slide-in-from-bottom-2 shadow-xl" />
          </div>
        )}

        <div className="relative flex items-end w-full border border-border bg-surface rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-accent transition-shadow">
          <textarea
            className="w-full max-h-48 min-h-[56px] resize-none bg-transparent px-4 py-4 text-sm focus:outline-none disabled:opacity-50"
            placeholder={activeHITLAction ? "Awaiting your approval..." : "Ask Tempo AI..."}
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
  );
}
