import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ThreadPageClient } from '@/components/inbox/ThreadPageClient'
import Link from 'next/link'

export default async function ThreadViewPage({ params }: { params: { threadId: string } }) {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
        <Link
          href="/inbox"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-raised"
        >
          Back to Inbox
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <ThreadPageClient threadId={params.threadId} />
      </div>
    </div>
  )
}
