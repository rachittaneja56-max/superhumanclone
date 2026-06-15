import { auth } from '@/server/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { format } from 'date-fns'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

const ACTION_LABELS: Record<string, string> = {
  email_sent: 'Email sent',
  email_archived: 'Email archived',
  email_deleted: 'Email deleted',
  email_restored: 'Email restored',
  calendar_created: 'Calendar event created',
  agent_action_approved: 'Agent action approved',
  agent_action_rejected: 'Agent action rejected',
  setting_changed: 'Setting changed',
  memory_cleared: 'Memory cleared',
  trash_emptied: 'Trash emptied',
}

export default async function AuditPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  let logs: any[] = []
  try {
    const trpc = await serverTrpc()
    logs = await trpc.audit.getAuditLog({ limit: 50 })
  } catch {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-14 flex items-center gap-3 px-6 border-b border-border">
        <Link href="/settings"
          className="text-foreground-subtle hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-display font-semibold text-lg">Activity Log</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {logs.length === 0 ? (
          <p className="text-sm text-foreground-subtle text-center pt-8">
            No activity yet
          </p>
        ) : (
          <div className="space-y-1">
            {logs.map((log: any) => (
              <div key={log.id}
                className="flex items-center justify-between px-4 py-3
                  bg-surface border border-border rounded-lg">
                <span className="text-sm text-foreground">
                  {ACTION_LABELS[log.action] ?? log.action}
                </span>
                <span className="text-xs text-foreground-subtle">
                  {format(new Date(log.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
