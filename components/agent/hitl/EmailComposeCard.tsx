"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Send } from "lucide-react";
import type { SafeHitlPayload } from "@/server/ai/agents/action-agent";

interface EmailComposeCardProps {
  payload: SafeHitlPayload;
  onApprove: (editedPayload: SafeHitlPayload) => void;
  onReject: () => void;
  isSubmitting: boolean;
}

export function EmailComposeCard({
  payload,
  onApprove,
  onReject,
  isSubmitting,
}: EmailComposeCardProps) {
  const [to, setTo] = useState(payload.to?.join(", ") || "");
  const [subject, setSubject] = useState(payload.subject || "");
  const [body, setBody] = useState(payload.body || "");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [body]);

  const handleApprove = () => {
    const toArray = to
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    onApprove({
      ...payload,
      to: toArray,
      subject,
      body,
    });
  };

  return (
    <div className="flex w-full flex-col bg-surface font-sans text-sm rounded-lg shadow-sm ring-1 ring-border">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
          <span className="text-foreground-muted font-medium w-14 shrink-0">To:</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-foreground-muted/50 min-w-0"
            disabled={isSubmitting}
          />
        </div>
        
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
          <span className="text-foreground-muted font-medium w-14 shrink-0">Subject:</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter subject"
            className="flex-1 bg-transparent font-medium outline-none text-foreground placeholder:text-foreground-muted/50 min-w-0"
            disabled={isSubmitting}
          />
        </div>

        <div className="rounded-md border border-border bg-background transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent overflow-hidden">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email here..."
            className="w-full min-h-[160px] resize-none bg-transparent outline-none text-foreground placeholder:text-foreground-muted/50 p-3"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-raised px-4 py-3">
        <button
          type="button"
          onClick={onReject}
          disabled={isSubmitting}
          className="rounded-full px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={isSubmitting || !to.trim() || !body.trim()}
          className="flex items-center space-x-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Send className="h-4 w-4" />
          <span>Send email</span>
        </button>
      </div>
    </div>
  );
}
