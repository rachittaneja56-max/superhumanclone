"use client";

import { useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, differenceInMinutes, endOfDay, endOfMonth, endOfWeek, format, isAfter, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MeetingPrepBriefDialog } from "@/components/calendar/MeetingPrepBriefDialog";

type ViewMode = "month" | "week" | "day" | "timeline";
type TimelineFilter = "today" | "tomorrow" | "week";

export type CalendarEvent = {
  id: string;
  userId?: string;
  corsair_event_id?: string;
  title: string;
  description?: string | null;
  startTime: Date | string;
  endTime: Date | string;
  location?: string | null;
  is_all_day: boolean;
  status: string;
  meetLink?: string | null;
};

type EventEditorState = {
  eventId?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string;
  location: string;
  description: string;
  addMeetLink: boolean;
};

type TimelineItem =
  | {
      type: "email";
      id: string;
      time: Date;
      sender: string;
      subject: string;
      snippet: string;
      unread: boolean;
    }
  | {
      type: "event";
      id: string;
      time: Date;
      title: string;
      attendees: string[];
      location?: string | null;
      event: CalendarEvent;
    };

const HOUR_HEIGHT = 72;

function parseDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function formatTimeInput(date: Date) {
  return format(date, "HH:mm");
}

function startOfVisibleRange(date: Date, view: ViewMode) {
  if (view === "day") return startOfDay(date);
  if (view === "week") return startOfWeek(date, { weekStartsOn: 1 });
  return startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
}

function endOfVisibleRange(date: Date, view: ViewMode) {
  if (view === "day") return endOfDay(date);
  if (view === "week") return endOfWeek(date, { weekStartsOn: 1 });
  return endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
}

function moveDate(date: Date, view: ViewMode, direction: 1 | -1) {
  if (view === "day") return addDays(date, direction);
  if (view === "week") return direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1);
  if (view === "timeline") return addDays(date, direction);
  return direction > 0 ? addMonths(date, 1) : subMonths(date, 1);
}

function timeLabel(date: Date) {
  return format(date, "h:mm a");
}

function formatTimelineDate(date: Date) {
  return format(date, "EEE, MMM d");
}

export function CalendarView({
  initialEvents,
  initialDate = new Date(),
}: {
  initialEvents: CalendarEvent[];
  initialDate?: Date | string;
}) {
  const utils = trpc.useUtils();
  const [view, setView] = useState<ViewMode>("month");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("today");
  const [currentDate, setCurrentDate] = useState(() => parseDate(initialDate));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [prepBriefEvent, setPrepBriefEvent] = useState<CalendarEvent | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<EventEditorState | null>(null);

  const range = useMemo(() => {
    const startDate = startOfVisibleRange(currentDate, view);
    const endDate = endOfVisibleRange(currentDate, view);
    return { startDate, endDate };
  }, [currentDate, view]);

  const timelineRange = useMemo(() => {
    const base = startOfDay(currentDate);
    if (timelineFilter === "tomorrow") {
      const startDate = startOfDay(addDays(base, 1));
      return { startDate, endDate: endOfDay(startDate) };
    }
    if (timelineFilter === "week") {
      const startDate = startOfWeek(base, { weekStartsOn: 1 });
      return { startDate, endDate: endOfWeek(base, { weekStartsOn: 1 }) };
    }
    const startDate = startOfDay(base);
    return { startDate, endDate: endOfDay(base) };
  }, [currentDate, timelineFilter]);

  const { data: rawEvents = initialEvents, isLoading, isError, refetch } = trpc.calendar.getEvents.useQuery(range, {
    initialData: initialEvents,
    placeholderData: initialEvents,
    refetchOnWindowFocus: false,
  });

  const { data: rawTimeline = [], isFetching: isTimelineFetching } = trpc.calendar.getTimeline.useQuery(timelineRange, {
    enabled: view === "timeline",
    placeholderData: [],
    refetchOnWindowFocus: false,
  });

  const events = useMemo(() => {
    return (rawEvents ?? []).map((event: CalendarEvent) => ({
      ...event,
      startTime: parseDate(event.startTime),
      endTime: parseDate(event.endTime),
    })) as CalendarEvent[];
  }, [rawEvents]);

  const timelineItems = useMemo(() => {
    const items = (rawTimeline ?? []).map((item: any) => {
      if (item.type === "email") {
        return {
          type: "email",
          id: item.id,
          time: new Date(item.time),
          sender: item.sender,
          subject: item.subject,
          snippet: item.snippet,
          unread: Boolean(item.unread),
        } as TimelineItem;
      }

      return {
        type: "event",
        id: item.id,
        time: new Date(item.time),
        title: item.title,
        attendees: Array.isArray(item.attendees) ? item.attendees : [],
        location: item.location ?? null,
        event: {
          ...(item.event as CalendarEvent),
          startTime: parseDate((item.event as CalendarEvent).startTime),
          endTime: parseDate((item.event as CalendarEvent).endTime),
        },
      } as TimelineItem;
    });

    return items.sort((a: TimelineItem, b: TimelineItem) => a.time.getTime() - b.time.getTime());
  }, [rawTimeline]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      const key = format(parseDate(event.startTime), "yyyy-MM-dd");
      (map[key] ||= []).push(event);
    }
    return map;
  }, [events]);

  const monthWeeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const weeks: Date[][] = [];
    let cursor = start;
    while (cursor <= end) {
      const week: Date[] = [];
      for (let index = 0; index < 7; index += 1) {
        week.push(cursor);
        cursor = addDays(cursor, 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [currentDate]);

  const visibleDays = useMemo(() => {
    const start = range.startDate;
    const days: Date[] = [];
    let cursor = startOfDay(start);
    while (cursor <= range.endDate) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [range.endDate, range.startDate]);

  const selectedDayKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedDayEvents = selectedDayKey ? eventsByDay[selectedDayKey] ?? [] : [];
  const dayAgenda = (selectedDay ? selectedDayEvents : events.filter((event) => isSameDay(parseDate(event.startTime), currentDate)))
    .slice()
    .sort((a, b) => parseDate(a.startTime).getTime() - parseDate(b.startTime).getTime());

  const upcoming = useMemo(() => {
    const now = new Date();
    return events
      .filter((event) => isAfter(parseDate(event.endTime), now))
      .sort((a, b) => parseDate(a.startTime).getTime() - parseDate(b.startTime).getTime())
      .slice(0, 8);
  }, [events]);

  const createEventMutation = trpc.calendar.createEvent.useMutation({
    onSuccess: async () => {
      await utils.calendar.getEvents.invalidate();
      await refetch();
      toast.success("Event created");
    },
    onError: () => toast.error("Could not create event"),
  });
  const updateEventMutation = trpc.calendar.updateEvent.useMutation({
    onSuccess: async () => {
      await utils.calendar.getEvents.invalidate();
      await refetch();
      toast.success("Event updated");
    },
    onError: () => toast.error("Could not update event"),
  });
  const deleteEventMutation = trpc.calendar.deleteEvent.useMutation({
    onSuccess: async () => {
      await utils.calendar.getEvents.invalidate();
      await refetch();
      toast.success("Event deleted");
    },
    onError: () => toast.error("Could not delete event"),
  });

  const openNewEvent = () => {
    const date = selectedDay ?? currentDate;
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    setEditorState({
      title: "",
      date: format(date, "yyyy-MM-dd"),
      startTime: formatTimeInput(start),
      endTime: formatTimeInput(end),
      attendees: "",
      location: "",
      description: "",
      addMeetLink: true,
    });
    setEditorOpen(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    const start = parseDate(event.startTime);
    const end = parseDate(event.endTime);
    setEditorState({
      eventId: event.corsair_event_id || event.id,
      title: event.title,
      date: format(start, "yyyy-MM-dd"),
      startTime: formatTimeInput(start),
      endTime: formatTimeInput(end),
      attendees: "",
      location: event.location || "",
      description: event.description || "",
      addMeetLink: Boolean(event.meetLink),
    });
    setEditorOpen(true);
  };

  const handleSubmitEvent = async () => {
    if (!editorState) return;

    const start = new Date(`${editorState.date}T${editorState.startTime}:00`);
    const end = new Date(`${editorState.date}T${editorState.endTime}:00`);
    if (!editorState.title.trim()) {
      toast.error("Add a title.");
      return;
    }
    if (!(start instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      toast.error("Pick a valid start and end time.");
      return;
    }

    const attendees = editorState.attendees
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const payload = {
      title: editorState.title.trim(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      attendees,
      description: editorState.description.trim() || undefined,
      location: editorState.location.trim() || undefined,
      addMeetLink: editorState.addMeetLink,
    };

    const wantsMeetLink = editorState.addMeetLink;
    let result: { meetLink?: string | null } | null = null;

    if (editorState.eventId) {
      result = await updateEventMutation.mutateAsync({ eventId: editorState.eventId, ...payload });
    } else {
      result = await createEventMutation.mutateAsync(payload);
    }

    if (wantsMeetLink && !result?.meetLink) {
      toast.message("Event saved. Google Meet link was not returned by Google.");
    }
    setEditorOpen(false);
    setEditorState(null);
  };

  const handleDeleteEvent = async () => {
    if (!editorState?.eventId) return;
    await deleteEventMutation.mutateAsync({ eventId: editorState.eventId });
    setEditorOpen(false);
    setEditorState(null);
  };

  const isBusy = createEventMutation.isPending || updateEventMutation.isPending || deleteEventMutation.isPending;
  const shiftVisibleDate = (direction: 1 | -1) => {
    if (view === "timeline") {
      if (timelineFilter === "week") {
        setCurrentDate((date) => (direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1)));
        return;
      }
      setCurrentDate((date) => addDays(date, direction));
      return;
    }

    setCurrentDate((date) => moveDate(date, view, direction));
  };

  const hasVisibleContent = view === "timeline" ? timelineItems.length > 0 : events.length > 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-accent" />
            <h2 className="truncate font-display text-xl font-semibold text-foreground sm:text-2xl">
              {view === "month"
                ? format(currentDate, "MMMM yyyy")
                : view === "week"
                  ? `${format(range.startDate, "MMM d")} - ${format(range.endDate, "MMM d, yyyy")}`
                  : format(currentDate, "EEEE, MMMM d, yyyy")}
            </h2>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            Google Calendar-style planning for your Aethra workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-border bg-background p-1">
            {(["month", "week", "day", "timeline"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  view === mode ? "bg-accent text-accent-foreground" : "text-foreground-muted hover:bg-surface-raised hover:text-foreground",
                ].join(" ")}
              >
                {mode === "timeline" ? "Timeline" : mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-background p-1">
            <button type="button" onClick={() => shiftVisibleDate(-1)} className="rounded-lg p-2 hover:bg-surface-raised">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentDate(new Date());
                setSelectedDay(null);
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-raised"
            >
              Today
            </button>
            <button type="button" onClick={() => shiftVisibleDate(1)} className="rounded-lg p-2 hover:bg-surface-raised">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Button onClick={openNewEvent} className="gap-2">
            <Plus className="h-4 w-4" />
            New event
          </Button>
        </div>
        {view === "timeline" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["today", "tomorrow", "week"] as TimelineFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setTimelineFilter(filter)}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  timelineFilter === filter
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-foreground-muted hover:bg-surface-raised hover:text-foreground",
                ].join(" ")}
              >
                {filter === "week" ? "This week" : filter[0].toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {((view === "timeline" && isTimelineFetching && timelineItems.length === 0) || (view !== "timeline" && isLoading && events.length === 0)) ? (
        <CalendarLoading />
      ) : isError ? (
        <CalendarError onRetry={() => void refetch()} />
      ) : !hasVisibleContent ? (
        <CalendarEmpty onCreate={openNewEvent} />
      ) : (
        <div className="grid min-h-0 flex-1 min-w-0 gap-4 px-4 pb-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:px-6">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
            {view === "month" ? (
            <MonthGrid
                weeks={monthWeeks}
                currentDate={currentDate}
                eventsByDay={eventsByDay}
                selectedDay={selectedDay}
                onPickDay={setSelectedDay}
                onOpenEvent={setSelectedEvent}
              />
            ) : view === "timeline" ? (
              <UnifiedTimelineFeed
                items={timelineItems}
                onOpenEvent={setSelectedEvent}
                onPickDay={(day) => {
                  setSelectedDay(day);
                  if (day) setCurrentDate(day);
                }}
              />
            ) : (
              <TimelineView
                days={visibleDays}
                events={events}
                onPickDay={setSelectedDay}
                onOpenEvent={setSelectedEvent}
              />
            )}
          </div>

          <aside className="min-w-0 space-y-4">
            <AgendaCard
              title={selectedDay ? format(selectedDay, "EEEE, MMMM d") : view === "day" ? format(currentDate, "EEEE, MMMM d") : "Selected day"}
              events={dayAgenda}
              emptyLabel="No events for this day."
              onOpenEvent={setSelectedEvent}
            />

            <AgendaCard
              title="Upcoming"
              events={upcoming}
              emptyLabel="No upcoming events."
              onOpenEvent={setSelectedEvent}
            />
          </aside>
        </div>
      )}

      <EventDetailDialog
        event={selectedEvent}
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        onEdit={(event) => {
          setSelectedEvent(null);
          openEditEvent(event);
        }}
        onPrepBrief={(event) => {
          setPrepBriefEvent(event);
        }}
        onDelete={async (event) => {
          await deleteEventMutation.mutateAsync({ eventId: event.corsair_event_id || event.id });
          setSelectedEvent(null);
        }}
      />

      <MeetingPrepBriefDialog
        open={Boolean(prepBriefEvent)}
        onClose={() => setPrepBriefEvent(null)}
        eventId={prepBriefEvent?.corsair_event_id || prepBriefEvent?.id || null}
        title={prepBriefEvent?.title || "Upcoming meeting"}
      />

      <EventEditorDialog
        open={editorOpen}
        busy={isBusy}
        state={editorState}
        onClose={() => {
          setEditorOpen(false);
          setEditorState(null);
        }}
        onChange={setEditorState}
        onSubmit={() => void handleSubmitEvent()}
        onDelete={editorState?.eventId ? () => void handleDeleteEvent() : undefined}
      />
    </div>
  );
}

function MonthGrid({
  weeks,
  currentDate,
  eventsByDay,
  selectedDay,
  onPickDay,
  onOpenEvent,
}: {
  weeks: Date[][];
  currentDate: Date;
  eventsByDay: Record<string, CalendarEvent[]>;
  selectedDay: Date | null;
  onPickDay: (date: Date | null) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 border-b border-border bg-background/60">
        {dayLabels.map((label) => (
          <div key={label} className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            {label}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 gap-px bg-border">
        {weeks.flat().map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay[key] ?? [];
          const inMonth = isSameMonth(day, currentDate);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onPickDay(selected ? null : day)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPickDay(selected ? null : day);
                }
              }}
              className={[
                "group min-h-[9.5rem] overflow-hidden bg-surface p-2 text-left transition-colors cursor-pointer",
                inMonth ? "" : "opacity-40",
                selected ? "bg-accent-subtle" : "hover:bg-surface-raised",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                    isToday(day) ? "bg-accent text-accent-foreground" : "text-foreground-muted",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </span>
              </div>

              <div className="mt-2 space-y-1">
                {dayEvents.slice(0, 4).map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEvent(event);
                    }}
                    className="truncate rounded-md border border-accent/20 bg-accent/10 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent/15"
                  >
                    {event.is_all_day ? "• " : ""}
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 4 && <div className="px-1 text-[11px] text-foreground-subtle">+{dayEvents.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({
  days,
  events,
  onPickDay,
  onOpenEvent,
}: {
  days: Date[];
  events: CalendarEvent[];
  onPickDay: (date: Date | null) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const height = 24 * HOUR_HEIGHT;
  const grouped = useMemo(() => {
    return days.map((day) => ({
      day,
      events: events.filter((event) => isSameDay(parseDate(event.startTime), day)),
    }));
  }, [days, events]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid border-b border-border bg-background/60" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="px-2 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">Time</div>
        {days.map((day) => (
          <button
            key={format(day, "yyyy-MM-dd")}
            type="button"
            onClick={() => onPickDay(day)}
            className="border-l border-border px-2 py-3 text-left transition-colors hover:bg-surface-raised"
          >
            <div className="text-xs font-semibold text-foreground">{format(day, "EEE d")}</div>
            {isToday(day) && <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-accent">Today</div>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ minHeight: `${height}px`, display: "grid", gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="sticky left-0 z-10 bg-surface">
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={hour} className="relative h-[72px] border-b border-border px-2 py-1 text-[11px] text-foreground-subtle">
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </div>
            ))}
          </div>

          {grouped.map(({ day, events: dayEvents }) => (
            <div key={format(day, "yyyy-MM-dd")} className="relative border-l border-border">
              {Array.from({ length: 24 }).map((_, hour) => (
                <div key={hour} className="h-[72px] border-b border-border/70" />
              ))}

              {dayEvents.map((event) => {
                const start = parseDate(event.startTime);
                const end = parseDate(event.endTime);
                const dayStart = startOfDay(day);
                const top = Math.max(0, differenceInMinutes(start, dayStart) * (HOUR_HEIGHT / 60));
                const heightPx = Math.max(36, differenceInMinutes(end, start) * (HOUR_HEIGHT / 60));

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event)}
                    className="absolute left-1 right-1 overflow-hidden rounded-xl border border-accent/20 bg-accent/15 p-2 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-accent/20"
                    style={{ top, height: heightPx }}
                  >
                    <div className="truncate text-xs font-semibold text-foreground">{event.title}</div>
                    <div className="mt-1 truncate text-[11px] text-foreground-muted">
                      {event.is_all_day ? "All day" : `${timeLabel(start)} - ${timeLabel(end)}`}
                    </div>
                    {event.location && (
                      <div className="mt-1 truncate text-[11px] text-foreground-subtle">{event.location}</div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UnifiedTimelineFeed({
  items,
  onOpenEvent,
  onPickDay,
}: {
  items: TimelineItem[];
  onOpenEvent: (event: CalendarEvent) => void;
  onPickDay: (date: Date | null) => void;
}) {
  const grouped = useMemo(() => {
    const buckets: Record<string, TimelineItem[]> = {};
    for (const item of items) {
      const key = formatTimelineDate(item.time);
      (buckets[key] ||= []).push(item);
    }
    return buckets;
  }, [items]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3 text-sm text-foreground-muted">
        Unified timeline of emails and events, sorted by time.
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-4">
          {Object.entries(grouped).map(([day, dayItems]) => (
            <section key={day} className="space-y-2">
              <button
                type="button"
                onClick={() => onPickDay(dayItems[0]?.time ?? null)}
                className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle hover:text-foreground"
              >
                {day}
              </button>
              <div className="space-y-2">
                {dayItems.map((item) => (
                  <div
                    key={`${item.type}:${item.id}`}
                    className="rounded-2xl border border-border bg-background p-4 transition-colors hover:bg-surface-raised"
                  >
                    {item.type === "email" ? (
                      <button
                        type="button"
                        onClick={() => onPickDay(item.time)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{item.sender}</div>
                            <div className="mt-1 truncate text-sm text-foreground">{item.subject}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-foreground-muted">{item.snippet}</div>
                          </div>
                          <div className="shrink-0 text-xs text-foreground-subtle">
                            {format(item.time, "h:mm a")}
                          </div>
                        </div>
                        {item.unread && (
                          <div className="mt-3 inline-flex rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                            Unread
                          </div>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenEvent(item.event)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
                            <div className="mt-1 text-sm text-foreground-muted">
                              {item.event.is_all_day ? "All day" : `${format(item.time, "h:mm a")} - ${format(parseDate(item.event.endTime), "h:mm a")}`}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-foreground-muted">
                              {item.attendees.length > 0 ? item.attendees.slice(0, 3).join(", ") : "No attendees"}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-foreground-subtle">
                            {format(item.time, "h:mm a")}
                          </div>
                        </div>
                        {item.location && (
                          <div className="mt-3 inline-flex rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-medium text-foreground-muted">
                            {item.location}
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaCard({
  title,
  events,
  emptyLabel,
  onOpenEvent,
}: {
  title: string;
  events: CalendarEvent[];
  emptyLabel: string;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-2 p-4">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-subtle">
            {emptyLabel}
          </div>
        ) : (
          events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onOpenEvent(event)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-surface-raised"
            >
              <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-foreground-muted">
                <Clock className="h-3.5 w-3.5" />
                <span>{event.is_all_day ? "All day" : format(parseDate(event.startTime), "EEE, h:mm a")}</span>
                {event.location && (
                  <>
                    <span className="text-foreground-subtle">•</span>
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{event.location}</span>
                  </>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function EventDetailDialog({
  event,
  open,
  onClose,
  onEdit,
  onPrepBrief,
  onDelete,
}: {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onPrepBrief: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  if (!event) return null;
  const start = parseDate(event.startTime);
  const end = parseDate(event.endTime);
  const isUpcoming = isAfter(end, new Date());

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{event.title}</DialogTitle>
          <DialogDescription>
            {event.is_all_day ? "All day" : `${format(start, "PPP p")} - ${format(end, "p")}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {event.location && (
            <div className="flex items-start gap-2 text-foreground-muted">
              <MapPin className="mt-0.5 h-4 w-4" />
              <span>{event.location}</span>
            </div>
          )}
          {event.description && <p className="whitespace-pre-wrap leading-6 text-foreground">{event.description}</p>}
          {event.meetLink && (
            <a href={event.meetLink} target="_blank" rel="noreferrer" className="inline-flex text-sm font-medium text-accent hover:underline">
              Join Google Meet
            </a>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {isUpcoming && (
              <Button type="button" variant="outline" onClick={() => onPrepBrief(event)}>
                Prep brief
              </Button>
            )}
            <Button type="button" variant="destructive" onClick={() => onDelete(event)}>
              Delete
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" onClick={() => onEdit(event)}>
              Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventEditorDialog({
  open,
  busy,
  state,
  onClose,
  onChange,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  busy: boolean;
  state: EventEditorState | null;
  onClose: () => void;
  onChange: (next: EventEditorState | null) => void;
  onSubmit: () => void;
  onDelete?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{state?.eventId ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>Keep meetings in sync with Google Calendar.</DialogDescription>
        </DialogHeader>

        {state && (
          <div className="grid gap-4">
            <Input value={state.title} onChange={(e) => onChange({ ...state, title: e.target.value })} placeholder="Title" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input type="date" value={state.date} onChange={(e) => onChange({ ...state, date: e.target.value })} />
              <Input type="time" value={state.startTime} onChange={(e) => onChange({ ...state, startTime: e.target.value })} />
              <Input type="time" value={state.endTime} onChange={(e) => onChange({ ...state, endTime: e.target.value })} />
            </div>
            <Input
              value={state.location}
              onChange={(e) => onChange({ ...state, location: e.target.value })}
              placeholder="Location"
            />
            <Input
              value={state.attendees}
              onChange={(e) => onChange({ ...state, attendees: e.target.value })}
              placeholder="Attendees, comma separated"
            />
            <Textarea
              value={state.description}
              onChange={(e) => onChange({ ...state, description: e.target.value })}
              placeholder="Description"
              className="min-h-[9rem]"
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={state.addMeetLink}
                onChange={(e) => onChange({ ...state, addMeetLink: e.target.checked })}
                className="h-4 w-4 rounded border-border bg-background"
              />
              Add Google Meet link
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {onDelete && state?.eventId && (
              <Button type="button" variant="destructive" onClick={onDelete} disabled={busy}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={busy}>
              {state?.eventId ? "Save changes" : "Create event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-sm text-foreground-muted">
      Loading calendar...
    </div>
  );
}

function CalendarError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <CalendarIcon className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold text-foreground">Calendar did not load</div>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          We could not fetch your events right now.
        </p>
        <Button className="mt-5" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function CalendarEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <CalendarIcon className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold text-foreground">No events yet</div>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          Add a meeting, schedule a focus block, or create something from scratch.
        </p>
        <Button className="mt-5" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New event
        </Button>
      </div>
    </div>
  );
}
