'use client'
import { trpc } from '@/lib/trpc/client'
import { format } from 'date-fns'

export function CalendarView({ initialEvents }: { initialEvents: any[] }) {
  const { data: events = initialEvents } = trpc.calendar.getEvents.useQuery(
    {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    { initialData: initialEvents, staleTime: 60000 }
  )

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-4xl">📅</span>
        <p className="text-sm text-foreground-muted">No upcoming events</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {events.map((event: any) => (
        <div key={event.id}
          className="flex items-start gap-4 p-4 bg-surface border
            border-border rounded-lg hover:border-border-strong transition-colors">
          <div className="w-1 self-stretch rounded-full bg-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground truncate">
              {event.title}
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">
              {event.startTime
                ? format(new Date(event.startTime), 'MMM d, h:mm a')
                : 'Time TBD'}
            </p>
            {event.meetingLink && (
              <a href={event.meetingLink} target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline mt-1 inline-block">
                Join Meet →
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
