import { auth } from '@/server/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Mail, Calendar, Bot, Search, Settings, LogOut
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { AppClientShell } from '@/components/app-client-shell'
import { NavItem } from '@/components/NavItem'

// Nav items — defined server-side (static, no state needed)
const NAV_ITEMS = [
  { href: '/inbox',    icon: Mail,     label: 'Inbox' },
  { href: '/calendar', icon: Calendar, label: 'Calendar' },
  { href: '/agent',    icon: Bot,      label: 'Agent' },
  { href: '/search',   icon: Search,   label: 'Search' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-surface">

        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <span className="font-display font-semibold text-lg tracking-tight">
            aethra<span className="text-accent">.</span>
          </span>
          <ThemeToggle />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent flex-shrink-0">
              {session.user.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-foreground">
                {session.user.name ?? 'User'}
              </p>
              <p className="text-xs text-foreground-subtle truncate">
                {session.user.email}
              </p>
            </div>
            <a href="/api/auth/signout"
              className="text-foreground-subtle hover:text-foreground transition-colors flex-shrink-0"
              title="Sign out">
              <LogOut className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>

      {/* Client-only shell: shortcuts, command palette, Ably */}
      <AppClientShell userId={session.user.id} />

    </div>
  )
}
