import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { MorningDigestBanner } from '@/components/inbox/MorningDigestBanner'
import { MailWorkspace } from '@/components/inbox/MailWorkspace'

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

  // Fetch from our local DB. The inbox must render even if sync/Corsair is down.
  let initialThreads: any[] = []
  try {
    const trpc = await serverTrpc()
    const rawThreads = await trpc.email.getMailboxThreads({
      folder,
      limit: 30,
      offset: 0,
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
        <MailWorkspace initialThreads={initialThreads} initialFolder={folder} initialComposeOpen={composeOpen} />
      </div>
    </div>
  )
}
