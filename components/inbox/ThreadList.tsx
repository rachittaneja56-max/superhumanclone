'use client'
import { trpc } from '@/lib/trpc/client'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/store/ui-store'
import { toast } from 'sonner'

interface ThreadListProps {
  initialData: any[]
}

export function ThreadList({ initialData }: ThreadListProps) {
  const router = useRouter()
  const { selectedEmailId, setSelectedEmail } = useUIStore()

  const { data: threads = initialData } = trpc.email.getThreads.useQuery(
    { limit: 50, isArchived: false },
    {
      initialData,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    }
  )

  const archiveMutation = trpc.email.archiveEmail.useMutation({
    onMutate: async ({ emailId }) => {
      toast.success('Archived', {
        action: { label: 'Undo', onClick: () => {} },
        duration: 10000,
      })
    },
    onError: () => toast.error('Failed to archive'),
  })

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <span className="text-2xl">✉️</span>
        </div>
        <p className="text-sm text-foreground-muted">Your inbox is empty</p>
        <p className="text-xs text-foreground-subtle">
          Syncing your Gmail — check back in a moment
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {threads.map((thread: any) => (
        <div
          key={thread.id}
          onClick={() => {
            setSelectedEmail(thread.id)
            router.push('/inbox/' + thread.threadId)
          }}
          className={[
            'px-4 py-3 cursor-pointer transition-all duration-100',
            'hover:bg-surface-overlay',
            selectedEmailId === thread.id
              ? 'bg-accent/5 border-l-2 border-accent pl-[14px]'
              : 'border-l-2 border-transparent',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <span className={[
              'text-sm truncate',
              !thread.isRead ? 'font-semibold text-foreground' : 'text-foreground-muted',
            ].join(' ')}>
              {thread.fromName || thread.fromAddress || 'Unknown'}
            </span>
            <span className="text-xs text-foreground-subtle flex-shrink-0">
              {thread.receivedAt
                ? formatDistanceToNow(new Date(thread.receivedAt), { addSuffix: true })
                : ''}
            </span>
          </div>
          <p className={[
            'text-sm truncate',
            !thread.isRead ? 'font-medium text-foreground' : 'text-foreground-muted',
          ].join(' ')}>
            {thread.subject || '(no subject)'}
          </p>
          {thread.tldr && !thread.aiTriageSkipped && (
            <p className="text-xs text-accent mt-0.5 truncate">
              ✦ {thread.tldr}
            </p>
          )}
          {thread.snippet && (
            <p className="text-xs text-foreground-subtle truncate mt-0.5">
              {thread.snippet}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
