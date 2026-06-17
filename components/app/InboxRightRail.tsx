import Link from "next/link";
import { CalendarDays, Clock3, Sparkles } from "lucide-react";
import { format } from "date-fns";

type RailEvent = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string | null;
  attendeesSummary?: string | null;
  meetLink?: string | null;
  is_all_day: boolean;
};

export function InboxRightRail({
  calendarConnected,
  events,
}: {
  calendarConnected: boolean;
  events: RailEvent[];
}) {
  const nextEvents = [...events]
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 4);
  const nextEvent = nextEvents[0] ?? null;

  return (
    <aside className="hidden xl:flex xl:min-h-0 xl:flex-col xl:gap-4">
      <section className="rounded-[1.5rem] border border-border bg-surface p-4 shadow-[0_14px_36px_rgba(28,20,12,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-accent" />
              Day agenda
            </div>
            <p className="mt-1 text-xs leading-5 text-foreground-subtle">
              A quick glance at today&apos;s schedule.
            </p>
          </div>
          <Link
            href="/calendar"
            className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            Open
          </Link>
        </div>

        <div className="mt-4 space-y-2">
          {calendarConnected ? (
            nextEvents.length > 0 ? (
              nextEvents.map((event) => (
                <Link
                  key={event.id}
                  href="/calendar"
                  className="block rounded-2xl border border-border bg-background px-3 py-3 transition-colors hover:bg-surface-raised"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-foreground-subtle">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>{format(event.startTime, event.is_all_day ? "EEE, MMM d" : "h:mm a")}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-foreground-muted">
                        {event.location || event.attendeesSummary || "Calendar details available in the full view."}
                      </div>
                    </div>
                    {event.meetLink ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                        Meet
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))
            ) : (
              <EmptyRailState
                title="No meetings today"
                body="Your calendar is clear. Use this space for fast context and upcoming meeting prep."
              />
            )
          ) : (
            <EmptyRailState
              title="Calendar disconnected"
              body="Connect Google Calendar to see a compact agenda and meeting context here."
            />
          )}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-border bg-surface p-4 shadow-[0_14px_36px_rgba(28,20,12,0.06)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-accent" />
          Support
        </div>
        <p className="mt-1 text-xs leading-5 text-foreground-subtle">
          Keep the inbox focused. Open Calendar for the full schedule or use Agent for follow-up help.
        </p>
      </section>
    </aside>
  );
}

function EmptyRailState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background px-3 py-4">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-foreground-muted">{body}</p>
    </div>
  );
}
