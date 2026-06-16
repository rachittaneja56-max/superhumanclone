'use client'
import { trpc } from '@/lib/trpc/client'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, addDays, isSameMonth, isSameDay, isToday, parseISO } from 'date-fns'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, MapPin, Clock, Calendar } from 'lucide-react'

interface CalendarEvent {
  id: string
  userId?: string
  corsair_event_id?: string
  title: string
  description?: string | null
  startTime: Date | string
  endTime: Date | string
  location?: string | null
  is_all_day: boolean
  status: string
}

function parseDate(d: Date | string): Date {
  if (d instanceof Date) return d
  return new Date(d)
}

export function CalendarView({ initialEvents }: { initialEvents: CalendarEvent[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  // Fetch events for a wide range: 1 year back to 1 year forward, so historical events show
  const queryRange = useMemo(() => ({
    startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  }), [])

  const { data: rawEvents = initialEvents } = trpc.calendar.getEvents.useQuery(
    queryRange,
    { placeholderData: initialEvents as any, staleTime: 60000 }
  )

  const events: CalendarEvent[] = (rawEvents as any[]).map((e: any) => ({
    ...e,
    startTime: parseDate(e.startTime),
    endTime: parseDate(e.endTime),
  }))

  // Sort by start time (newest last = ascending)
  const sortedEvents = [...events].sort((a, b) =>
    parseDate(a.startTime).getTime() - parseDate(b.startTime).getTime()
  )

  // Events grouped by date string
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const ev of events) {
      const key = format(parseDate(ev.startTime), 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [events])

  // Events for the selected month or upcoming
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const selectedDayKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null
  const selectedDayEvents = selectedDayKey ? (eventsByDate[selectedDayKey] || []) : []

  // Upcoming events: next 90 days from today
  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    return sortedEvents.filter(e => {
      const d = parseDate(e.startTime)
      return d >= now && d <= cutoff
    }).slice(0, 8)
  }, [sortedEvents])

  // All events for this month
  const monthEvents = useMemo(() => {
    return sortedEvents.filter(e => isSameMonth(parseDate(e.startTime), currentMonth))
  }, [sortedEvents, currentMonth])

  // Build calendar grid rows
  const weeks: Date[][] = []
  let day = calStart
  while (day <= calEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  }

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const getEventColor = (ev: CalendarEvent) => {
    const t = ev.title.toLowerCase()
    if (t.includes('meet') || t.includes('webinar') || t.includes('mastermind') || t.includes('workshop')) return 'bg-violet-500'
    if (t.includes('internship') || t.includes('work') || t.includes('meeting')) return 'bg-blue-500'
    if (t.includes('birthday') || t.includes('party') || t.includes('celebration')) return 'bg-pink-500'
    if (t.includes('travel') || t.includes('train') || t.includes('flight')) return 'bg-amber-500'
    return 'bg-accent'
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-foreground font-display">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSelectedDay(null); setCurrentMonth(subMonths(currentMonth, 1)) }}
              className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors text-foreground-muted hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setSelectedDay(null); setCurrentMonth(new Date()) }}
              className="px-3 py-1 text-xs font-medium rounded-md border border-border hover:bg-surface-overlay transition-colors text-foreground-muted"
            >
              Today
            </button>
            <button
              onClick={() => { setSelectedDay(null); setCurrentMonth(addMonths(currentMonth, 1)) }}
              className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors text-foreground-muted hover:text-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-foreground-subtle pb-2">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="flex-1 grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {weeks.flat().map((d, i) => {
            const key = format(d, 'yyyy-MM-dd')
            const dayEvents = eventsByDate[key] || []
            const inMonth = isSameMonth(d, currentMonth)
            const today = isToday(d)
            const selected = selectedDay && isSameDay(d, selectedDay)
            return (
              <div
                key={i}
                onClick={() => setSelectedDay(selected ? null : d)}
                className={[
                  'bg-surface min-h-[80px] p-1.5 cursor-pointer transition-colors',
                  inMonth ? '' : 'opacity-30',
                  selected ? 'bg-accent/10' : 'hover:bg-surface-overlay',
                ].join(' ')}
              >
                <span className={[
                  'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                  today ? 'bg-accent text-accent-foreground' : 'text-foreground-muted',
                  selected && !today ? 'ring-1 ring-accent' : '',
                ].join(' ')}>
                  {format(d, 'd')}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 2).map((ev, j) => (
                    <div
                      key={j}
                      className={`text-[10px] leading-tight px-1 py-0.5 rounded text-white truncate ${getEventColor(ev)}`}
                      title={ev.title}
                    >
                      {ev.is_all_day ? '🔵 ' : ''}{ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-[10px] text-foreground-subtle pl-1">
                      +{dayEvents.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected day events */}
        {selectedDay && (
          <div className="mt-4 p-4 bg-surface border border-border rounded-xl">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              {format(selectedDay, 'EEEE, MMMM d')}
            </h3>
            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-foreground-subtle">No events this day</p>
            ) : (
              <div className="space-y-2">
                {selectedDayEvents.map((ev, i) => (
                  <EventCard key={i} event={ev} color={getEventColor(ev)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-6">
        {/* Upcoming Events */}
        <div>
          <h3 className="text-xs font-semibold text-foreground-subtle uppercase tracking-wider mb-3">
            Upcoming Events
          </h3>
          {upcomingEvents.length === 0 ? (
            <div className="text-center py-6 text-foreground-subtle">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No upcoming events</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((ev, i) => (
                <div
                  key={i}
                  onClick={() => {
                    const d = parseDate(ev.startTime)
                    setCurrentMonth(d)
                    setSelectedDay(d)
                  }}
                  className="group cursor-pointer p-3 rounded-lg border border-border hover:border-accent/50 hover:bg-surface-overlay transition-all"
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getEventColor(ev)}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{ev.title}</p>
                      <p className="text-[10px] text-foreground-subtle mt-0.5">
                        {format(parseDate(ev.startTime), 'MMM d · h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* This Month */}
        <div>
          <h3 className="text-xs font-semibold text-foreground-subtle uppercase tracking-wider mb-3">
            {format(currentMonth, 'MMMM')} · {monthEvents.length} events
          </h3>
          {monthEvents.length === 0 ? (
            <p className="text-xs text-foreground-subtle text-center py-4">No events this month</p>
          ) : (
            <div className="space-y-1.5">
              {monthEvents.slice(0, 6).map((ev, i) => (
                <div
                  key={i}
                  onClick={() => {
                    const d = parseDate(ev.startTime)
                    setSelectedDay(d)
                  }}
                  className="cursor-pointer flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-surface-overlay transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getEventColor(ev)}`} />
                  <span className="text-xs text-foreground-muted truncate flex-1">{ev.title}</span>
                  <span className="text-[10px] text-foreground-subtle flex-shrink-0">
                    {format(parseDate(ev.startTime), 'd')}
                  </span>
                </div>
              ))}
              {monthEvents.length > 6 && (
                <p className="text-xs text-foreground-subtle pl-2">+{monthEvents.length - 6} more</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EventCard({ event, color }: { event: CalendarEvent; color: string }) {
  const start = parseDate(event.startTime)
  const end = parseDate(event.endTime)
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-overlay border border-border">
      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-foreground-subtle">
            <Clock className="w-3 h-3" />
            {event.is_all_day
              ? 'All day'
              : `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 text-xs text-foreground-subtle truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {event.location}
            </span>
          )}
        </div>
        {event.description && (
          <p className="text-xs text-foreground-subtle mt-1.5 line-clamp-2">{event.description}</p>
        )}
      </div>
    </div>
  )
}
