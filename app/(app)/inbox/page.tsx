import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { MailWorkspace } from '@/components/inbox/MailWorkspace'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'
import Link from 'next/link'
import { endOfDay, startOfDay } from 'date-fns'
import { InboxRightRail } from '@/components/app/InboxRightRail'

function normalizeFolder(folder?: string) {
  if (folder === 'drafts' || folder === 'sent' || folder === 'spam' || folder === 'trash') {
    return folder
  }
  return 'inbox'
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; compose?: string }>
}) {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  const resolvedSearchParams = await searchParams
  const folder = normalizeFolder(resolvedSearchParams.folder)
  const composeOpen = resolvedSearchParams.compose === 'true'
  const { gmailConnected, calendarConnected } = await reconcileGoogleConnectionState(session.userId).catch(() => ({
    gmailConnected: false,
    calendarConnected: false,
  }))

  if (!gmailConnected) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h1 className="font-display text-lg font-semibold">Inbox</h1>
        </div>
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mail-x">
                <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
                <path d="m22 22-5-5" />
                <path d="m17 22 5-5" />
                <path d="m22 6-10 7L2 6" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground">Gmail not connected</h2>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              Connect Gmail again to load your mailbox, send mail, and keep thread actions working.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/onboarding/connect"
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-accent-foreground"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Reconnect Gmail
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const today = new Date()
  const railStart = startOfDay(today)
  const railEnd = endOfDay(today)

  // Fetch from our local DB. The inbox must render even if sync/Corsair is down.
  let initialMailboxPage = { items: [], nextPageToken: null } as { items: any[]; nextPageToken: string | null }
  let agendaEvents: any[] = []
  try {
    const trpc = await serverTrpc()
    const rawThreads = await trpc.email.getMailboxThreads({
      folder,
      limit: 10,
      offset: 0,
      query: '',
    })
    initialMailboxPage = JSON.parse(JSON.stringify(rawThreads))
  } catch (err) {
    console.error('Failed to fetch threads:', err)
  }

  if (calendarConnected) {
    try {
      const trpc = await serverTrpc()
      const events = await trpc.calendar.getEvents({
        startDate: railStart,
        endDate: railEnd,
      })
      agendaEvents = (events ?? []).map((event: any) => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
      }))
    } catch (err) {
      console.error('Failed to fetch agenda rail:', err)
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="grid h-full min-h-0 min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-h-0 min-w-0 overflow-hidden">
          <MailWorkspace initialMailboxPage={initialMailboxPage} initialFolder={folder} initialComposeOpen={composeOpen} />
        </div>
        <InboxRightRail calendarConnected={calendarConnected} events={agendaEvents} />
      </div>
    </div>
  )
}
