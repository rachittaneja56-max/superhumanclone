"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarIcon, Clock3, Link2, Users } from "lucide-react";

export type SchedulerProposal = {
  title?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  attendees?: string[];
  location?: string;
  description?: string;
  addMeetLink?: boolean;
};

export function SmartSchedulerModal({
  isOpen,
  onClose,
  threadId,
  initialProposal,
  skipSmartFill = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  threadId?: string;
  initialProposal?: SchedulerProposal | null;
  skipSmartFill?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [attendees, setAttendees] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [addMeetLink, setAddMeetLink] = useState(true);

  const smartFillMutation = trpc.calendar.smartFillFromThread.useMutation();
  const createEventMutation = trpc.calendar.createEvent.useMutation();

  useEffect(() => {
    if (!isOpen) return;

    if (initialProposal) {
      setTitle(initialProposal.title || "Meeting");

      if (initialProposal.startTime) {
        const start = new Date(initialProposal.startTime);
        if (!Number.isNaN(start.getTime())) {
          setDate(start.toISOString().split("T")[0]);
          setTime(start.toTimeString().slice(0, 5));
        }
      }

      if (initialProposal.endTime && initialProposal.startTime) {
        const start = new Date(initialProposal.startTime);
        const end = new Date(initialProposal.endTime);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
          setDuration(String(Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000))));
        }
      } else if (initialProposal.durationMinutes) {
        setDuration(String(initialProposal.durationMinutes));
      } else {
        setDuration("30");
      }

      setAttendees((initialProposal.attendees || []).join(", "));
      setLocation(initialProposal.location || "");
      setDescription(initialProposal.description || "");
      setConfidence(null);
      setAddMeetLink(initialProposal.addMeetLink ?? true);
      return;
    }

    if (skipSmartFill || !threadId) return;

    setTitle("");
    setDate("");
    setTime("");
    setDuration("30");
    setAttendees("");
    setLocation("");
    setDescription("");
    setConfidence(null);
    setAddMeetLink(true);

    smartFillMutation.mutate(
      { threadId },
      {
        onSuccess: (data) => {
          setTitle(data.suggestedTitle || "Sync");

          if (data.suggestedTime) {
            const d = new Date(data.suggestedTime);
            if (!Number.isNaN(d.getTime())) {
              setDate(d.toISOString().split("T")[0]);
              setTime(d.toTimeString().slice(0, 5));
            }
          }

          setDuration(data.suggestedDuration ? String(data.suggestedDuration) : "30");
          setAttendees((data.participants || []).join(", "));
          setDescription(data.suggestedDescription || "");
          setConfidence(data.confidence);
          setAddMeetLink(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, threadId, initialProposal, skipSmartFill]);

  const startDateTime = useMemo(() => {
    if (!date || !time) return null;
    const value = new Date(`${date}T${time}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }, [date, time]);

  const endDateTime = useMemo(() => {
    if (!startDateTime) return null;
    const mins = Number.parseInt(duration, 10);
    if (!Number.isFinite(mins)) return null;
    return new Date(startDateTime.getTime() + mins * 60_000);
  }, [duration, startDateTime]);

  const previewAttendees = attendees
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDateTime || !endDateTime) {
      toast.error("Date and time are required.");
      return;
    }

    try {
      await createEventMutation.mutateAsync({
        title: title.trim(),
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        attendees: previewAttendees,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        addMeetLink,
      });
      toast.success("Event scheduled successfully");
      onClose();
    } catch {
      toast.error("Failed to schedule event.");
    }
  };

  const confidenceBadge = useMemo(() => {
    if (confidence === null) return null;
    if (confidence >= 0.7) {
      return <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-green-500">High confidence</span>;
    }
    if (confidence >= 0.4) {
      return <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Medium confidence</span>;
    }
    return <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-500">Low confidence</span>;
  }, [confidence]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl font-sans">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Schedule from thread</DialogTitle>
            {confidenceBadge}
          </div>
          <DialogDescription>
            Review the details before creating the event.
          </DialogDescription>
        </DialogHeader>

        {smartFillMutation.isPending ? (
          <div className="flex flex-col items-center justify-center space-y-3 p-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <div className="text-sm text-muted-foreground animate-pulse">Analyzing thread context…</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] overflow-y-auto max-h-[60vh] pr-2 pb-2">
              <div className="grid gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Date</label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Start time</label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="15">15 mins</option>
                    <option value="30">30 mins</option>
                    <option value="45">45 mins</option>
                    <option value="60">60 mins</option>
                    <option value="90">90 mins</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Attendees</label>
                <Input
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value)}
                  placeholder="email1@domain.com, email2@domain.com"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Location</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional location" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[9rem]"
                  placeholder="Short summary of the meeting"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={addMeetLink}
                  onChange={(e) => setAddMeetLink(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-background"
                />
                Add Google Meet link
              </label>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Preview</div>
              <div className="space-y-3">
                <PreviewRow icon={<CalendarIcon className="h-4 w-4" />} label="Title" value={title || "Untitled event"} />
                <PreviewRow
                  icon={<Clock3 className="h-4 w-4" />}
                  label="Time"
                  value={startDateTime && endDateTime ? `${startDateTime.toLocaleString()} - ${endDateTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Pick a date and time"}
                />
                <PreviewRow icon={<Users className="h-4 w-4" />} label="Attendees" value={previewAttendees.length ? previewAttendees.join(", ") : "No attendees"} />
                <PreviewRow icon={<Link2 className="h-4 w-4" />} label="Meet" value={addMeetLink ? "Will generate a Google Meet link" : "Meet link disabled"} />
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Description</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground-muted">
                    {description.trim() || "No description yet."}
                  </p>
                </div>
              </div>
            </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between shrink-0 pt-2">
              <div>
                <Button type="button" variant="outline" onClick={onClose} disabled={createEventMutation.isPending}>
                  Cancel
                </Button>
              </div>
              <Button type="submit" disabled={createEventMutation.isPending}>
                {createEventMutation.isPending ? "Creating…" : "Create event"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-foreground">{value}</div>
    </div>
  );
}
