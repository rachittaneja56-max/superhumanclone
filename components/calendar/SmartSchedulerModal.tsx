"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SmartSchedulerModal({
  isOpen,
  onClose,
  threadId,
}: {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [participants, setParticipants] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);

  const smartFillMutation = trpc.calendar.smartFillFromThread.useMutation();
  const createEventMutation = trpc.calendar.createEvent.useMutation();

  useEffect(() => {
    if (isOpen && threadId) {
      smartFillMutation.mutate(
        { threadId },
        {
          onSuccess: (data) => {
            setTitle(data.suggestedTitle || "Sync");
            
            if (data.suggestedTime) {
              const d = new Date(data.suggestedTime);
              if (!isNaN(d.getTime())) {
                setDate(d.toISOString().split("T")[0]);
                setTime(d.toTimeString().slice(0, 5));
              }
            }
            
            setDuration(data.suggestedDuration ? String(data.suggestedDuration) : "30");
            setParticipants(data.participants || []);
            setConfidence(data.confidence);
          },
          onError: (err) => {
            if (err.data?.code === "FORBIDDEN") {
              toast.error(err.message);
              onClose();
            } else {
              toast.error("Failed to generate smart schedule suggestions.");
            }
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, threadId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      toast.error("Date and time are required.");
      return;
    }

    const startDateTime = new Date(`${date}T${time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60000);

    try {
      await createEventMutation.mutateAsync({
        title,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        attendees: participants,
      });
      toast.success("Event scheduled successfully");
      onClose();
    } catch (err) {
      toast.error("Failed to schedule event.");
    }
  };

  const getConfidenceBadge = () => {
    if (confidence === null) return null;
    if (confidence >= 0.7) {
      return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-600">High Confidence</span>;
    }
    if (confidence >= 0.4) {
      return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-600">Medium Confidence</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-600">Low Confidence</span>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md font-sans">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Schedule from Thread</DialogTitle>
            {getConfidenceBadge()}
          </div>
        </DialogHeader>

        {smartFillMutation.isPending ? (
          <div className="p-6 flex flex-col items-center justify-center space-y-3">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-muted-foreground animate-pulse">Analyzing thread context...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Date</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Time</label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Duration (mins)</label>
              <select 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="15">15 mins</option>
                <option value="30">30 mins</option>
                <option value="45">45 mins</option>
                <option value="60">60 mins</option>
                <option value="90">90 mins</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Attendees</label>
              <div className="flex flex-wrap gap-2 p-2 border border-border rounded-md bg-muted/20 min-h-10">
                {participants.length > 0 ? participants.map((p) => (
                  <span key={p} className="px-2 py-1 bg-surface border border-border rounded-md text-xs">
                    {p}
                  </span>
                )) : (
                  <span className="text-xs text-muted-foreground self-center">No attendees found.</span>
                )}
              </div>
            </div>

            <div className="pt-4 flex justify-end space-x-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={createEventMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEventMutation.isPending}>
                {createEventMutation.isPending ? "Scheduling..." : "Schedule Event"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
