import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { MorningDigestBanner } from '@/components/inbox/MorningDigestBanner'
import { MailWorkspace } from '@/components/inbox/MailWorkspace'

export default async function InboxPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  // Fetch from our local DB. The inbox must render even if sync/Corsair is down.
  let initialThreads: any[] = []
  try {
    const trpc = await serverTrpc()
    const rawThreads = await trpc.email.getMailboxThreads({
      folder: 'inbox',
      limit: 50,
      query: '',
    })
    initialThreads = JSON.parse(JSON.stringify(rawThreads))
  } catch (err) {
    console.error('Failed to fetch threads:', err)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <MorningDigestBanner />
      <div className="flex-1 min-h-0 overflow-hidden">
        <MailWorkspace initialThreads={initialThreads} />
      </div>
    </div>
  )
}
