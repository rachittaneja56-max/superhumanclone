import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serverTrpc } from '@/lib/trpc/server'
import { SettingsClient } from '@/components/settings/SettingsClient'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  const trpc = await serverTrpc()
  const settings = await trpc.settings.getUserSettings({})

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <h1 className="font-display font-semibold text-lg">Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-6">

          <SettingsClient initialSettings={settings} />

          {/* Privacy Gate link */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border">
              <h2 className="text-xs font-medium text-foreground-subtle uppercase tracking-wider">
                Privacy
              </h2>
            </div>
            <Link href="/onboarding/privacy?mode=edit"
              className="flex items-center justify-between px-4 py-3
                hover:bg-surface-overlay transition-colors">
              <div>
                <p className="text-sm font-medium">Privacy Gate</p>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Choose which emails the AI can access
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-foreground-subtle" />
            </Link>
          </div>

          {/* Audit log link */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <Link href="/settings/audit"
              className="flex items-center justify-between px-4 py-3
                hover:bg-surface-overlay transition-colors">
              <div>
                <p className="text-sm font-medium">Activity Log</p>
                <p className="text-xs text-foreground-muted mt-0.5">
                  View all AI actions and approvals
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-foreground-subtle" />
            </Link>
          </div>

          {/* Integrations link */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <Link href="/onboarding/connect"
              className="flex items-center justify-between px-4 py-3
                hover:bg-surface-overlay transition-colors">
              <div>
                <p className="text-sm font-medium">Connected Accounts</p>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Connect or manage your Gmail and Calendar
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-foreground-subtle" />
            </Link>
          </div>

          {/* Sign out */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="w-full flex items-center px-4 py-3 hover:bg-surface-overlay transition-colors text-destructive">
                <p className="text-sm font-medium">Sign out</p>
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}
