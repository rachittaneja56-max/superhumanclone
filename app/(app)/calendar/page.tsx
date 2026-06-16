import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { CalendarView } from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  let events: any[] = []
  try {
    const trpc = await serverTrpc()
    const result = await trpc.calendar.getEvents({
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
