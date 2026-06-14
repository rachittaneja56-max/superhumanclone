"use client";

import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function AutoReplyPanel({ emailId, onSelect }: { emailId: string; onSelect: (text: string) => void }) {
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 15;

  const { data: replies, isFetching } = trpc.email.getAutoReplies.useQuery(
    { emailId },
    {
      staleTime: Infinity,
      refetchInterval: (query) => {
        if (!query.state.data || query.state.data.length === 0) {
          if (attempts >= maxAttempts) return false;
          return 2000; // Poll every 2s
        }
        return false;
      },
    }
  );

  const toggleSuggestions = trpc.settings.toggleDraftSuggestions.useMutation();

  useEffect(() => {
    if (isFetching && (!replies || replies.length === 0)) {
      setAttempts((prev) => prev + 1);
    }
  }, [isFetching, replies]);

  const handleDisable = async () => {
    try {
      await toggleSuggestions.mutateAsync({ enabled: false });
      toast.success("Draft suggestions disabled");
    } catch (err) {
      toast.error("Failed to disable suggestions");
    }
  };

  if (!replies || replies.length === 0) {
    if (attempts >= maxAttempts) {
      return (
        <div className="p-4 border-t border-border bg-surface text-sm text-muted-foreground flex justify-between items-center">
          <span>Suggestions unavailable.</span>
        </div>
      );
    }
    return (
      <div className="p-4 border-t border-border bg-surface text-sm text-muted-foreground flex justify-between items-center animate-pulse">
        <span>Generating AI suggestions...</span>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-border bg-surface space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold tracking-wide text-foreground">AI Auto-Replies</h3>
        <Popover>
          <PopoverTrigger className="text-xs text-muted-foreground hover:underline">
            Disable
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4 text-sm" align="end">
            <div className="mb-3">Are you sure you want to disable draft suggestions for all emails?</div>
            <div className="flex justify-end space-x-2">
              <Button variant="ghost" size="sm">Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleDisable}>Disable</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {replies.map((reply, idx) => {
          let variantTitle = "Direct";
          if (idx === 1) variantTitle = "Warm";
          if (idx === 2) variantTitle = "Boundary";
          
          return (
            <button
              key={reply.id}
              onClick={() => onSelect(reply.reply_text)}
              className="text-left p-3 rounded-md border border-border hover:border-accent hover:bg-accent/5 transition-colors text-xs text-foreground flex flex-col justify-between group"
            >
              <div className="font-semibold mb-1 opacity-70 group-hover:opacity-100">{variantTitle}</div>
              <div className="line-clamp-3 opacity-80">{reply.reply_text}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
