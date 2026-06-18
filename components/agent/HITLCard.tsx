"use client";

import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useUIStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Check, Pencil, X, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SmartSchedulerModal, type SchedulerProposal } from "@/components/calendar/SmartSchedulerModal";

export function HITLCard({ className }: { className?: string }) {
  const { activeHITLAction, setActiveHITLAction } = useUIStore();
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editProposal, setEditProposal] = useState<SchedulerProposal | null>(null);

  const resolveMutation = trpc.agent.resolveHITL.useMutation();
  const isCalendarCreate = activeHITLAction?.actionType === "create_event";

  const calendarProposal = useMemo<SchedulerProposal | null>(() => {
    if (!isCalendarCreate || !activeHITLAction?.payload) return null;
    const payload = activeHITLAction.payload as Record<string, unknown>;
    const attendees = Array.isArray(payload.attendees)
      ? payload.attendees.filter((item): item is string => typeof item === "string")
      : [];

    return {
      title: typeof payload.title === "string" ? payload.title : undefined,
      startTime: typeof payload.startTime === "string" ? payload.startTime : undefined,
      endTime: typeof payload.endTime === "string" ? payload.endTime : undefined,
      durationMinutes: typeof payload.durationMinutes === "number" ? payload.durationMinutes : undefined,
      attendees,
      location: typeof payload.location === "string" ? payload.location : undefined,
      description: typeof payload.description === "string" ? payload.description : undefined,
      addMeetLink: typeof payload.addMeetLink === "boolean" ? payload.addMeetLink : true,
    };
  }, [activeHITLAction, isCalendarCreate]);

  const handleDecision = async (decision: "approved" | "rejected") => {
    setIsSubmitting(true);
    try {
      if (!activeHITLAction) return;
      await resolveMutation.mutateAsync({
        actionId: activeHITLAction.actionId,
        decision,
      });
      setActiveHITLAction(null);
      toast.success(decision === "approved" ? "Action approved" : "Action cancelled");
    } catch {
      toast.error("Failed to resolve action");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!calendarProposal || !activeHITLAction) return;
    setIsSubmitting(true);
    try {
      await resolveMutation.mutateAsync({
        actionId: activeHITLAction.actionId,
        decision: "rejected",
      });
      setActiveHITLAction(null);
      setEditProposal(calendarProposal);
      setEditOpen(true);
      toast.message("Opened the event editor.");
    } catch {
      toast.error("Could not open the event editor.");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const totalSeconds = 5 * 60;
  const progressPercentage = (timeLeft / totalSeconds) * 100;
  const strokeDasharray = `${progressPercentage} 100`;

  const formatStart = (value?: string) => {
    if (!value) return "Not set";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const durationLabel = useMemo(() => {
    if (!calendarProposal?.startTime || !calendarProposal?.endTime) return null;
    const start = new Date(calendarProposal.startTime);
    const end = new Date(calendarProposal.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return `${minutes} min`;
  }, [calendarProposal]);

  if (!activeHITLAction) return null;

  return (
    <>
      <div
        className={cn(
          "w-96 overflow-hidden rounded-lg border border-border border-l-4 border-l-amber-500 bg-surface font-sans shadow-2xl animate-in slide-in-from-bottom-5 z-50",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-border bg-amber-500/5 p-4">
          <div className="flex items-center space-x-2 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
            <h3 className="text-sm font-semibold">
              {isCalendarCreate ? "Calendar approval required" : "Agent approval required"}
            </h3>
          </div>

          <div className="relative flex h-8 w-8 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
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

        <div className="space-y-4 p-4">
          <p className="text-sm leading-relaxed text-foreground">{activeHITLAction.humanReadable}</p>
          {activeHITLAction.riskLevel && (
            <div className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-500">
              {activeHITLAction.riskLevel} risk
            </div>
          )}

          {activeHITLAction.payload && (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              {isCalendarCreate && calendarProposal ? (
                <>
                  <DetailRow label="Title" value={calendarProposal.title || "Untitled event"} />
                  <DetailRow label="When" value={formatStart(calendarProposal.startTime)} />
                  {durationLabel && <DetailRow label="Duration" value={durationLabel} />}
                  <DetailRow
                    label="Attendees"
                    value={typeof activeHITLAction.payload.attendeesSummary === "string" ? activeHITLAction.payload.attendeesSummary : "No attendees"}
                  />
                  <DetailRow label="Meet" value={calendarProposal.addMeetLink ? "Google Meet enabled" : "Meet link off"} />
                  {calendarProposal.location && <DetailRow label="Location" value={calendarProposal.location} />}
                  {calendarProposal.description && <DetailRow label="Description" value={calendarProposal.description} clamp />}
                </>
              ) : (
                <>
                  {activeHITLAction.payload.recipientSummary && (
                    <DetailRow
                      label="To"
                      value={String(activeHITLAction.payload.recipientSummary)}
                    />
                  )}
                  {activeHITLAction.payload.subject && (
                    <DetailRow label="Subject" value={String(activeHITLAction.payload.subject)} clamp />
                  )}
                  {!activeHITLAction.payload.recipientSummary && !activeHITLAction.payload.subject && (
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span>Payload details hidden for privacy.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {isCalendarCreate ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEdit}
                  disabled={isSubmitting}
                  className="w-full sm:w-24"
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDecision("rejected")}
                  disabled={isSubmitting}
                  className="w-full sm:w-24"
                >
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDecision("approved")}
                  disabled={isSubmitting}
                  className="w-full bg-amber-500 text-white hover:bg-amber-600 sm:w-28"
                >
                  <Check className="mr-1 h-4 w-4" />
                  Create event
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDecision("rejected")}
                  disabled={isSubmitting}
                  className="w-full sm:w-24"
                >
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDecision("approved")}
                  disabled={isSubmitting}
                  className="w-full bg-amber-500 text-white hover:bg-amber-600 sm:w-24"
                >
                  <Check className="mr-1 h-4 w-4" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <SmartSchedulerModal
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditProposal(null);
        }}
        initialProposal={editProposal}
        skipSmartFill
      />
    </>
  );
}

function DetailRow({
  label,
  value,
  clamp = false,
}: {
  label: string;
  value: string;
  clamp?: boolean;
}) {
  return (
    <div className="flex items-start space-x-2 text-xs">
      <span className="w-20 shrink-0 font-semibold text-muted-foreground">{label}:</span>
      <span className={clamp ? "line-clamp-2 text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
