import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { serverTrpc } from '@/lib/trpc/server'
import { ThreadList } from '@/components/inbox/ThreadList'
import { MorningDigestBanner } from '@/components/inbox/MorningDigestBanner'

export default async function InboxPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  // Fetch from our local DB. The inbox must render even if sync/Corsair is down.
  let initialThreads: any[] = []
  try {
    const trpc = await serverTrpc()
    const rawThreads = await trpc.email.getThreads({
      limit: 50,
      isArchived: false,
    })
    initialThreads = JSON.parse(JSON.stringify(rawThreads))
  } catch (err) {
    console.error('Failed to fetch threads:', err)
  }

  if (initialThreads.length === 0) {
    after(async () => {
      const { syncInboxIfEmpty } = await import('@/server/corsair/sync')
      await syncInboxIfEmpty(session.userId!)
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <MorningDigestBanner />

      <div className="flex-1 overflow-y-auto">
        <ThreadList initialData={initialThreads} />
      </div>
    </div>
  )
}
