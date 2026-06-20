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
    <div className="flex w-full flex-col bg-surface font-sans text-sm border border-border rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center space-x-2 border-b border-border px-4 py-2">
        <span className="w-12 text-foreground-muted">To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com"
          className="flex-1 bg-transparent py-1 outline-none text-foreground placeholder:text-foreground-muted/50"
          disabled={isSubmitting}
        />
      </div>
      <div className="border-b border-border px-4 py-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full bg-transparent py-1 font-medium outline-none text-foreground placeholder:text-foreground-muted/50"
          disabled={isSubmitting}
        />
      </div>
      <div className="p-4">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email here..."
          className="w-full min-h-[120px] resize-none bg-transparent outline-none text-foreground placeholder:text-foreground-muted/50"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-3">
        <button
          onClick={onReject}
          disabled={isSubmitting}
          className="text-foreground-muted transition-colors hover:text-foreground"
        >
          Discard
        </button>
        <button
          onClick={handleApprove}
          disabled={isSubmitting || !to.trim() || !body.trim()}
          className="flex items-center space-x-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}
