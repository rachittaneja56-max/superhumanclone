import { auth } from '@/server/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { ThreadList } from '@/components/inbox/ThreadList'
import { MorningDigestBanner } from '@/components/inbox/MorningDigestBanner'
import { syncInboxIfEmpty } from '@/server/corsair/sync'

export default async function InboxPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // Trigger initial sync if inbox is empty
  // This is async and non-blocking — page renders while sync happens
  void syncInboxIfEmpty(session.user.id)

  // Fetch from our local DB (fast — no Corsair API call)
  let initialThreads: any[] = []
  try {
    const trpc = await serverTrpc()
    initialThreads = await trpc.email.getThreads({
      limit: 50,
      isArchived: false,
    })
  } catch (err) {
    console.error('Failed to fetch threads:', err)
    // Page still renders — ThreadList shows empty state
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Morning digest banner */}
      <MorningDigestBanner />

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        <ThreadList initialData={initialThreads} />
      </div>
    </div>
  )
}
