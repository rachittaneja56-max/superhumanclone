import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { CalendarView } from '@/components/calendar/CalendarView'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'

export default async function CalendarPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  let events: any[] = []

  const { calendarConnected } = await reconcileGoogleConnectionState(session.userId).catch(() => ({
    calendarConnected: false,
  }))

  if (!calendarConnected) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="h-14 flex items-center px-6 border-b border-border">
          <h1 className="font-display font-semibold text-lg">Calendar</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-surface-overlay rounded-full flex items-center justify-center mb-4 text-foreground-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar-x"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/></svg>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Calendar Not Connected</h2>
          <p className="text-foreground-muted mb-6 max-w-sm">
            You haven't connected your Google Calendar yet. Connect it to view and manage your events.
          </p>
          <a href="/onboarding/connect" className="px-6 py-2 bg-accent text-accent-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
            Connect Calendar
          </a>
        </div>
      </div>
    )
  }

  try {
    const trpc = await serverTrpc()
    const result = await trpc.calendar.getEvents({
      startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    events = result ?? []
  } catch (err) {
    console.error('Calendar fetch failed:', err)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <h1 className="font-display font-semibold text-lg">Calendar</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <CalendarView initialEvents={events} />
      </div>
    </div>
  )
}
