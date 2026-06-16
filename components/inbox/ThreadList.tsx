'use client'
import { trpc } from '@/lib/trpc/client'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/store/ui-store'
import { toast } from 'sonner'
import { Archive, CheckCheck, Square, Trash2 } from 'lucide-react'

interface ThreadListProps {
  initialData: any[]
}

export function ThreadList({ initialData }: ThreadListProps) {
  const router = useRouter()
  const {
    selectedEmailId,
    selectedEmailIds,
    setSelectedEmail,
    toggleSelectedEmail,
    clearSelectedEmails,
  } = useUIStore()

  const { data: threads = initialData } = trpc.email.getThreads.useQuery(
    { limit: 50, isArchived: false },
    {
      initialData,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    }
  )

  const bulkMarkRead = trpc.email.bulkMarkRead.useMutation({
    onSuccess: () => {
      toast.success('Marked read')
      clearSelectedEmails()
    },
    onError: () => toast.error('Failed to mark read'),
  })
  const bulkArchive = trpc.email.bulkArchive.useMutation({
    onSuccess: () => {
      toast.success('Archived')
      clearSelectedEmails()
    },
    onError: () => toast.error('Failed to archive'),
  })
  const bulkDelete = trpc.email.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success('Moved to trash')
      clearSelectedEmails()
    },
    onError: () => toast.error('Failed to delete'),
  })
  const archiveMutation = trpc.email.archiveEmail.useMutation({
    onMutate: async ({ emailId }) => {
      toast.success('Archived', {
        action: { label: 'Undo', onClick: () => {} },
        duration: 10000,
      })
    },
    onError: () => toast.error('Failed to archive'),
  })

  const selectedCount = selectedEmailIds.length

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
      {selectedCount > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="text-sm text-muted-foreground">
            {selectedCount} selected
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => bulkMarkRead.mutate({ emailIds: selectedEmailIds })}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <CheckCheck className="h-4 w-4" />
              Read
            </button>
            <button
              onClick={() => bulkArchive.mutate({ emailIds: selectedEmailIds })}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
            <button
              onClick={() => bulkDelete.mutate({ emailIds: selectedEmailIds })}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-red-600 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Trash
            </button>
            <button
              onClick={clearSelectedEmails}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Square className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>
      )}
      {threads.map((thread: any) => (
        <div
          key={thread.id}
          onClick={() => {
            if (selectedCount > 0) {
              toggleSelectedEmail(thread.id)
              return
            }
            setSelectedEmail(thread.id)
            router.push('/inbox/' + thread.threadId)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            toggleSelectedEmail(thread.id)
          }}
          className={[
            'px-4 py-3 cursor-pointer transition-all duration-100',
            'hover:bg-surface-overlay',
            selectedEmailIds.includes(thread.id)
              ? 'bg-accent/10 border-l-2 border-accent pl-[14px]'
              : selectedEmailId === thread.id
              ? 'bg-accent/5 border-l-2 border-accent pl-[14px]'
              : 'border-l-2 border-transparent',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleSelectedEmail(thread.id)
              }}
              className="mt-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Select thread"
            >
              <Square className="h-4 w-4" />
            </button>
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
