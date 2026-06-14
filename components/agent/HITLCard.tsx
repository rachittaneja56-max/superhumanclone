"use client";

import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUIStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Check, X, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function HITLCard({ className }: { className?: string }) {
  const { activeHITLAction, setActiveHITLAction } = useUIStore();
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolveMutation = trpc.agent.resolveHITL.useMutation();

  useEffect(() => {
    if (!activeHITLAction?.expiresAt) return;

    const expiryTime = new Date(activeHITLAction.expiresAt).getTime();
    
    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0 && !isSubmitting) {
        handleDecision("rejected");
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHITLAction]);

  if (!activeHITLAction) return null;

  const handleDecision = async (decision: "approved" | "rejected") => {
    setIsSubmitting(true);
    try {
      await resolveMutation.mutateAsync({
        actionId: activeHITLAction.actionId,
        decision,
      });
      toast.success(`Action ${decision}`);
    } catch (err) {
      toast.error("Failed to resolve action");
    } finally {
      setActiveHITLAction(null);
      setIsSubmitting(false);
    }
  };

  const totalSeconds = 5 * 60;
  const progressPercentage = (timeLeft / totalSeconds) * 100;
  const strokeDasharray = `${progressPercentage} 100`;

  return (
    <div className={cn("w-96 bg-surface shadow-2xl rounded-lg border border-border border-l-4 border-l-amber-500 z-50 animate-in slide-in-from-bottom-5 font-sans overflow-hidden", className || "fixed bottom-6 right-6")}>
      <div className="p-4 border-b border-border bg-amber-500/5 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-amber-600">
          <ShieldAlert className="w-5 h-5" />
          <h3 className="font-semibold text-sm">Agent Approval Required</h3>
        </div>
        
        {/* Countdown Ring */}
        <div className="relative w-8 h-8 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-border/50"
              strokeWidth="3"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-amber-500 transition-all duration-1000 ease-linear"
              strokeDasharray={strokeDasharray}
              strokeWidth="3"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className="absolute text-[9px] font-medium text-foreground">
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-foreground leading-relaxed">
          {activeHITLAction.humanReadable}
        </p>

        {activeHITLAction.payload && (
          <div className="p-3 bg-muted/20 border border-border rounded-md space-y-2">
            {activeHITLAction.payload.to && (
              <div className="flex items-start space-x-2 text-xs">
                <span className="font-semibold text-muted-foreground w-12 shrink-0">To:</span>
                <span className="text-foreground truncate">{activeHITLAction.payload.to.join(", ")}</span>
              </div>
            )}
            {activeHITLAction.payload.subject && (
              <div className="flex items-start space-x-2 text-xs">
                <span className="font-semibold text-muted-foreground w-12 shrink-0">Subject:</span>
                <span className="text-foreground line-clamp-2">{activeHITLAction.payload.subject}</span>
              </div>
            )}
            {!activeHITLAction.payload.to && !activeHITLAction.payload.subject && (
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <Mail className="w-3.5 h-3.5" />
                <span>Payload details hidden for privacy.</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleDecision("rejected")}
            disabled={isSubmitting}
            className="w-full sm:w-24 order-2 sm:order-1"
          >
            <X className="w-4 h-4 mr-1" />
            Reject
          </Button>
          <Button
            size="sm"
            onClick={() => handleDecision("approved")}
            disabled={isSubmitting}
            className="w-full sm:w-24 bg-amber-500 hover:bg-amber-600 text-white order-1 sm:order-2"
          >
            <Check className="w-4 h-4 mr-1" />
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
