import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ThreadView } from '@/components/inbox/ThreadView'

export default async function ThreadViewPage({ params }: { params: { threadId: string } }) {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  return (
    <div className="flex-1 min-h-0">
      <ThreadView threadId={params.threadId} />
    </div>
  )
}
