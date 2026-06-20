"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Save, Calendar as CalendarIcon, Clock, Users, MapPin, AlignLeft, Video } from "lucide-react";
import type { SafeHitlPayload } from "@/server/ai/agents/action-agent";
import { Switch } from "@/components/ui/switch";

interface CalendarEventCardProps {
  payload: SafeHitlPayload;
  onApprove: (editedPayload: SafeHitlPayload) => void;
  onReject: () => void;
  isSubmitting: boolean;
}

export function CalendarEventCard({
  payload,
  onApprove,
  onReject,
  isSubmitting,
}: CalendarEventCardProps) {
  const [title, setTitle] = useState(payload.title || "");
  const [startTime, setStartTime] = useState(payload.startTime ? new Date(payload.startTime).toISOString().slice(0, 16) : "");
  const [endTime, setEndTime] = useState(payload.endTime ? new Date(payload.endTime).toISOString().slice(0, 16) : "");
  const [attendees, setAttendees] = useState(payload.attendees?.join(", ") || "");
  const [location, setLocation] = useState(payload.location || "");
  const [description, setDescription] = useState(payload.description || "");
  const [addMeetLink, setAddMeetLink] = useState(payload.addMeetLink ?? true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [description]);

  const handleApprove = () => {
    const attendeesArray = attendees
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    onApprove({
      ...payload,
      title,
      startTime: startTime ? new Date(startTime).toISOString() : undefined,
      endTime: endTime ? new Date(endTime).toISOString() : undefined,
      attendees: attendeesArray,
      location,
      description,
      addMeetLink,
    });
  };

  return (
    <div className="flex w-full flex-col bg-surface font-sans text-sm border border-border rounded-lg overflow-hidden shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event Title"
          className="w-full bg-transparent py-1 text-lg font-medium outline-none text-foreground placeholder:text-foreground-muted/50"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col space-y-4 p-4">
        {/* Time */}
        <div className="flex items-center space-x-3 text-foreground-muted">
          <Clock className="h-4 w-4 shrink-0" />
          <div className="flex flex-1 items-center space-x-2">
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isSubmitting}
              className="rounded-md border border-border bg-background px-2 py-1 outline-none focus:border-accent text-foreground"
            />
            <span>to</span>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={isSubmitting}
              className="rounded-md border border-border bg-background px-2 py-1 outline-none focus:border-accent text-foreground"
            />
          </div>
        </div>

        {/* Attendees */}
        <div className="flex items-center space-x-3 text-foreground-muted">
          <Users className="h-4 w-4 shrink-0" />
          <input
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="Add guests (comma separated)"
            disabled={isSubmitting}
            className="flex-1 bg-transparent py-1 outline-none text-foreground placeholder:text-foreground-muted/50"
          />
        </div>

        {/* Google Meet */}
        <div className="flex items-center space-x-3 text-foreground-muted">
          <Video className="h-4 w-4 shrink-0" />
          <div className="flex flex-1 items-center justify-between">
            <span className="text-foreground">Google Meet video conferencing</span>
            <Switch
              checked={addMeetLink}
              onCheckedChange={setAddMeetLink}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Location */}
        <div className="flex items-center space-x-3 text-foreground-muted">
          <MapPin className="h-4 w-4 shrink-0" />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location"
            disabled={isSubmitting}
            className="flex-1 bg-transparent py-1 outline-none text-foreground placeholder:text-foreground-muted/50"
          />
        </div>

        {/* Description */}
        <div className="flex items-start space-x-3 text-foreground-muted">
          <AlignLeft className="mt-1.5 h-4 w-4 shrink-0" />
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description"
            disabled={isSubmitting}
            className="flex-1 min-h-[60px] resize-none bg-transparent py-1 outline-none text-foreground placeholder:text-foreground-muted/50"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-3">
        <button
          onClick={onReject}
          disabled={isSubmitting}
          className="text-foreground-muted transition-colors hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={handleApprove}
          disabled={isSubmitting || !title.trim()}
          className="flex items-center space-x-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <span>Save</span>
        </button>
      </div>
    </div>
  );
}
