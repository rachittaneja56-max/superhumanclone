'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, CreditCard, Inbox, LayoutDashboard, LogOut, Bot, Settings, Shield } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { signOutAction } from '@/app/actions/auth'

const APP_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/agent', label: 'Agent', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function UnifiedSidebar({
  firstName,
  email,
  isAdmin = false,
}: {
  firstName: string
  email?: string | null
  isAdmin?: boolean
}) {
  const pathname = usePathname()
  const initial = (firstName || email || 'U').charAt(0).toUpperCase()

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-border/80 bg-surface/95">
      <div className="border-b border-border px-4 py-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <span className="font-display text-base font-semibold tracking-tight text-foreground">
            aethra<span className="text-accent">.</span>
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
            Workspace
          </div>
          {APP_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.href === '/inbox'
              ? pathname.startsWith('/inbox')
              : pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-100',
                  isActive
                    ? 'bg-accent/10 text-accent font-medium border-l-2 border-accent pl-[10px]'
                    : 'text-foreground-muted hover:bg-surface-overlay hover:text-foreground',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>

        <div className="mt-5 space-y-1">
          {isAdmin ? (
            <Link
              href="/admin"
              className={[
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-100',
                pathname === '/admin'
                  ? 'bg-accent/10 text-accent font-medium border-l-2 border-accent pl-[10px]'
                  : 'text-foreground-muted hover:bg-surface-overlay hover:text-foreground',
              ].join(' ')}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span className="truncate">Admin</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{firstName}</p>
              <p className="truncate text-xs text-foreground-subtle">Workspace ready</p>
            </div>
            <ThemeToggle />
          </div>

          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-red-500/90 transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
